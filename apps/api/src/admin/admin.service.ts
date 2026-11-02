import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase.service";

/**
 * Shared admin helpers. Every admin change calls `log` so the audit trail
 * answers "who did what, when" without anyone remembering to write it.
 */
@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseService) {}

  async log(adminId: string, action: string, target?: string, detail?: Record<string, unknown>) {
    const { error } = await this.supabase.admin
      .from("admin_actions")
      .insert({ admin_id: adminId, action, target: target ?? null, detail: detail ?? null });
    if (error) console.error("[admin] audit", error.message);
  }

  /**
   * Everything the dashboard shows, in one call. Days are Indian days
   * (IST midnight), whatever timezone the server runs in.
   */
  async dashboard() {
    const db = this.supabase.admin;
    const IST = 5.5 * 3600_000;
    const dayStartIst = (d: Date) => new Date(Math.floor((d.getTime() + IST) / 86_400_000) * 86_400_000 - IST);
    const today0 = dayStartIst(new Date());
    const from = new Date(today0.getTime() - 6 * 86_400_000); // 7 days incl. today
    const DEAD = ["CANCELLED", "RETURNED", "REFUNDED", "DELIVERY_FAILED"];
    const ACTIVE = ["PLACED", "DEALER_ASSIGNED", "ACCEPTED", "PACKING", "PACKED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];

    const [{ data: orders }, { data: riders }, { data: shops }, { data: recent }] = await Promise.all([
      db
        .from("orders")
        .select("id, status, est_amount, final_amount, created_at, dealer_id, ready_by, order_items(product_id, requested_kg, unavailable)")
        .gte("created_at", from.toISOString()),
      db.from("delivery_partners").select("id, is_online, cash_balance, profiles(full_name)").eq("is_active", true),
      db.from("dealers").select("id, shop_name, is_open, closed_until").eq("is_active", true),
      db
        .from("orders")
        .select("id, display_id, status, est_amount, final_amount, created_at, profiles!orders_customer_id_fkey(full_name, phone), dealers(shop_name)")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    // Shop (cost) price per dealer+product, to work out our margin.
    const dealerIds = [...new Set((orders ?? []).map((o) => o.dealer_id).filter(Boolean))] as string[];
    const { data: prices } = dealerIds.length
      ? await db.from("dealer_products").select("dealer_id, product_id, price_per_kg").in("dealer_id", dealerIds)
      : { data: [] as { dealer_id: string; product_id: string; price_per_kg: number }[] };
    const cost = new Map((prices ?? []).map((p) => [`${p.dealer_id}:${p.product_id}`, Number(p.price_per_kg)]));

    type Day = { date: string; orders: number; sales: number; cost: number };
    const days: Day[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(from.getTime() + i * 86_400_000 + IST);
      return { date: d.toISOString().slice(0, 10), orders: 0, sales: 0, cost: 0 };
    });
    const stage: Record<string, number> = {};
    let late = 0;
    let unassigned = 0;
    const now = Date.now();
    for (const o of orders ?? []) {
      const idx = Math.floor((new Date(o.created_at).getTime() + IST) / 86_400_000) - Math.floor((from.getTime() + IST) / 86_400_000);
      const dead = DEAD.includes(o.status);
      if (idx >= 0 && idx < 7 && !dead) {
        days[idx].orders += 1;
        days[idx].sales += Number(o.final_amount ?? o.est_amount);
        for (const it of (o.order_items as { product_id: string; requested_kg: number; unavailable: boolean }[]) ?? []) {
          if (!it.unavailable) days[idx].cost += Math.round((cost.get(`${o.dealer_id}:${it.product_id}`) ?? 0) * Number(it.requested_kg));
        }
      }
      if (ACTIVE.includes(o.status)) {
        stage[o.status] = (stage[o.status] ?? 0) + 1;
        if (o.ready_by && ["ACCEPTED", "PACKING"].includes(o.status) && new Date(o.ready_by).getTime() < now) late += 1;
        if (o.status === "PLACED" && !o.dealer_id) unassigned += 1;
      }
    }

    const today = days[6];
    const yesterday = days[5];
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

    return {
      today: {
        orders: today.orders,
        sales: today.sales,
        cost: today.cost,
        margin: today.sales - today.cost,
        ordersVsYesterday: pct(today.orders, yesterday.orders),
        salesVsYesterday: pct(today.sales, yesterday.sales),
      },
      days: days.map((d) => ({ ...d, margin: d.sales - d.cost })),
      stage,
      attention: { late, unassigned },
      onDuty: {
        ridersOnline: (riders ?? []).filter((r) => r.is_online).length,
        riders: (riders ?? []).length,
        shopsOpen: (shops ?? []).filter((s) => s.is_open && (!s.closed_until || new Date(s.closed_until).getTime() <= now)).length,
        shops: (shops ?? []).length,
        cashOutstanding: (riders ?? []).reduce((s, r) => s + Number(r.cash_balance), 0),
        cashByRider: (riders ?? [])
          .filter((r) => Number(r.cash_balance) > 0)
          .map((r) => ({ id: r.id, name: (r.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "Rider", cash: Number(r.cash_balance) })),
      },
      recent: (recent ?? []).map((o) => ({
        id: o.id,
        displayId: o.display_id,
        status: o.status,
        amount: Number(o.final_amount ?? o.est_amount),
        createdAt: o.created_at,
        customer: (o.profiles as unknown as { full_name: string | null; phone: string | null } | null)?.full_name ?? null,
        shop: (o.dealers as unknown as { shop_name: string } | null)?.shop_name ?? null,
      })),
    };
  }

  async me(adminId: string, email: string) {
    const { data: profile } = await this.supabase.admin.from("profiles").select("full_name, role").eq("id", adminId).maybeSingle();
    return { id: adminId, email, name: profile?.full_name ?? null, role: profile?.role ?? "admin" };
  }
}
