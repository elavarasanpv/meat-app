import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminExpenseInput } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { AdminService } from "./admin.service";

const IST = 5.5 * 3600_000;
const DAY = 86_400_000;
type Line = { product_id: string | null; requested_kg: number; actual_kg: number | null; unavailable: boolean; is_free: boolean | null; unit_price_per_kg: number; shop_unit_price: number | null };
type Money = {
  orders: number;
  /** Items at the customer price, before any discount. */
  itemSales: number;
  deliveryFees: number;
  /** Discount the customer got, split by who pays for it. */
  discountOurs: number;
  discountShops: number;
  /** What the customer actually paid. */
  paid: number;
  /** Items at the shop (purchase) price. */
  purchaseCost: number;
  /** Free offer items Thanjoz Mart pays the shop for. */
  freeItemsOurs: number;
  appCharges: number;
  /** What the shops are owed: purchase cost + our free items − app charge − the shops' own discounts. */
  shopPaid: number;
  riderPay: number;
  /** Weighed weights and rounding: what the customer paid against the bill lines. */
  adjustments: number;
  /** Paid − shop paid − rider pay. */
  orderProfit: number;
  freeDeliveries: number;
};
const zero = (): Money => ({ orders: 0, itemSales: 0, deliveryFees: 0, discountOurs: 0, discountShops: 0, paid: 0, purchaseCost: 0, freeItemsOurs: 0, appCharges: 0, shopPaid: 0, riderPay: 0, adjustments: 0, orderProfit: 0, freeDeliveries: 0 });
const add = (a: Money, b: Money) => {
  for (const k of Object.keys(a) as (keyof Money)[]) a[k] += b[k];
};

/**
 * Profit and loss for a date range (Indian days): delivered orders only, worked
 * out the same way the shops' own amounts are, then the admin's spending.
 */
@Injectable()
export class PnlService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AdminService,
  ) {}

  private get db() {
    return this.supabase.admin;
  }

  async pnl(fromDate: string, toDate: string) {
    const from = this.dayStart(fromDate);
    const to = this.dayStart(toDate);
    if (to < from) throw new BadRequestException("The end date is before the start date");
    if ((to - from) / DAY > 370) throw new BadRequestException("Choose a year or less");
    const end = to + DAY;

    const { data: orders, error } = await this.db
      .from("orders")
      .select("id, created_at, vertical_type, dealer_id, est_amount, final_amount, delivery_fee, fee_reason, discount_amount, discount_shop_share, customer_coupon_id, app_charge, rider_fee, order_items(product_id, requested_kg, actual_kg, unavailable, is_free, unit_price_per_kg, shop_unit_price)")
      .eq("status", "DELIVERED")
      .gte("created_at", new Date(from).toISOString())
      .lt("created_at", new Date(end).toISOString())
      .limit(20000);
    if (error) throw new BadRequestException(error.message);

    // Older meat orders have no saved shop price: use the shop's price now.
    const dealerIds = [...new Set((orders ?? []).filter((o) => o.vertical_type === "meat" && o.dealer_id).map((o) => o.dealer_id as string))];
    const { data: prices } = dealerIds.length ? await this.db.from("dealer_products").select("dealer_id, product_id, price_per_kg").in("dealer_id", dealerIds) : { data: [] };
    const cost = new Map((prices ?? []).map((p) => [`${p.dealer_id}:${p.product_id}`, Number(p.price_per_kg ?? 0)]));
    let estimatedCostLines = 0;

    const days = new Map<string, Money>();
    for (let t = from; t <= to; t += DAY) days.set(this.dateOf(t), zero());
    const byVertical: Record<string, Money> = { meat: zero(), grocery: zero() };
    const total = zero();

    for (const o of orders ?? []) {
      const m = zero();
      m.orders = 1;
      for (const l of (o.order_items as unknown as Line[]) ?? []) {
        if (l.unavailable) continue;
        const qty = Number(l.actual_kg ?? l.requested_kg);
        let shopEach = l.shop_unit_price;
        if (shopEach == null && !l.is_free) {
          shopEach = cost.get(`${o.dealer_id}:${l.product_id}`) ?? 0;
          estimatedCostLines += 1;
        }
        const shopLine = Math.round(Number(shopEach ?? 0) * qty);
        if (l.is_free) m.freeItemsOurs += shopLine;
        else {
          m.itemSales += Math.round(Number(l.unit_price_per_kg) * qty);
          m.purchaseCost += shopLine;
        }
      }
      const discount = Number(o.discount_amount ?? 0);
      // Same rule as the shop's own amount: only a shop's next-order coupon comes off the shop.
      m.discountShops = o.customer_coupon_id ? Number(o.discount_shop_share ?? discount) : 0;
      m.discountOurs = discount - m.discountShops;
      m.deliveryFees = Number(o.delivery_fee ?? 0);
      if (!m.deliveryFees && ["free_above", "first_order"].includes(o.fee_reason as string)) m.freeDeliveries = 1;
      m.paid = Number(o.final_amount ?? o.est_amount);
      m.adjustments = m.paid - (m.itemSales - discount + m.deliveryFees);
      m.appCharges = Number(o.app_charge ?? 0);
      m.shopPaid = m.purchaseCost + m.freeItemsOurs - m.appCharges - m.discountShops;
      m.riderPay = Number(o.rider_fee ?? 0);
      m.orderProfit = m.paid - m.shopPaid - m.riderPay;

      const day = days.get(this.dateOf(new Date(o.created_at).getTime()));
      if (day) add(day, m);
      add(byVertical[o.vertical_type === "grocery" ? "grocery" : "meat"], m);
      add(total, m);
    }

    const expenses = await this.listExpenses(fromDate, toDate);
    const spent = expenses.reduce((s, e) => s + e.amount, 0);
    const byCategory: Record<string, number> = {};
    const spentByDay = new Map<string, number>();
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
      spentByDay.set(e.spentOn, (spentByDay.get(e.spentOn) ?? 0) + e.amount);
    }

    // Money promised back to customers by support (wallet credits) is a loss too.
    const { data: credits } = await this.db
      .from("wallet_entries")
      .select("amount, created_at")
      .eq("reason", "support_credit")
      .gt("amount", 0)
      .gte("created_at", new Date(from).toISOString())
      .lt("created_at", new Date(end).toISOString());
    let supportCredits = 0;
    for (const c of credits ?? []) {
      const amount = Number(c.amount);
      const day = this.dateOf(new Date(c.created_at).getTime());
      supportCredits += amount;
      spentByDay.set(day, (spentByDay.get(day) ?? 0) + amount);
    }
    if (supportCredits) byCategory.support_credit = supportCredits;
    const allSpent = spent + supportCredits;

    return {
      from: fromDate,
      to: toDate,
      total,
      byVertical,
      expenses: { total: allSpent, byCategory },
      netProfit: total.orderProfit - allSpent,
      days: [...days.entries()].map(([date, m]) => ({ date, ...m, spent: spentByDay.get(date) ?? 0, net: m.orderProfit - (spentByDay.get(date) ?? 0) })),
      estimatedCostLines,
    };
  }

  async listExpenses(fromDate: string, toDate: string) {
    const { data, error } = await this.db
      .from("expenses")
      .select("id, spent_on, category, amount, note, created_at, profiles:created_by(full_name)")
      .gte("spent_on", fromDate)
      .lte("spent_on", toDate)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((e) => ({
      id: e.id as string,
      spentOn: e.spent_on as string,
      category: e.category as string,
      amount: Number(e.amount),
      note: e.note as string | null,
      by: (e.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    }));
  }

  async addExpense(adminId: string, input: AdminExpenseInput) {
    const { data, error } = await this.db
      .from("expenses")
      .insert({ spent_on: input.spentOn, category: input.category, amount: input.amount, note: input.note?.trim() || null, created_by: adminId })
      .select("id")
      .single();
    if (error) throw new BadRequestException(error.message);
    await this.audit.log(adminId, "expense.add", data.id, { ...input });
    return { id: data.id };
  }

  async removeExpense(adminId: string, id: string) {
    const { data } = await this.db.from("expenses").select("spent_on, category, amount, note").eq("id", id).maybeSingle();
    if (!data) throw new NotFoundException("Not found");
    const { error } = await this.db.from("expenses").delete().eq("id", id);
    if (error) throw new BadRequestException(error.message);
    await this.audit.log(adminId, "expense.remove", id, { ...data, amount: Number(data.amount) });
    return { ok: true };
  }

  /** Midnight IST of a YYYY-MM-DD date, as epoch ms. */
  private dayStart(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException("Dates are YYYY-MM-DD");
    return Date.parse(`${date}T00:00:00Z`) - IST;
  }

  private dateOf(t: number) {
    return new Date(t + IST).toISOString().slice(0, 10);
  }
}
