import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase.service";

const IST = 5.5 * 3600_000;
const DAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export type SuggestionItem = {
  productId: string;
  name: string;
  nameTa: string | null;
  unit: "kg" | "piece";
  price: number; // today's selling price
  qty: number;
  size: "small" | "medium" | "large" | null;
  imagePath: string | null;
};
export type Suggestion = {
  kind: "habit" | "favourite" | "last" | "popular";
  /** For "habit": which weekday the habit is on (today or tomorrow). */
  day?: (typeof DAY)[number];
  items: SuggestionItem[];
  total: number;
};

type Product = { id: string; name: string; name_ta: string | null; unit: "kg" | "piece"; base_price_per_kg: number; image_path: string | null; is_active: boolean };
type Row = { id: string; created_at: string; order_items: { product_id: string; requested_kg: number; size: string | null; unavailable: boolean }[] };

/**
 * "For you" on the home screen, from the customer's own delivered orders:
 * a weekday habit, a favourite, their last basket, or what's popular nearby.
 * Everything is re-priced at today's price and filtered to what a shop
 * serving their pincode actually stocks right now.
 */
@Injectable()
export class SuggestionsService {
  constructor(private readonly supabase: SupabaseService) {}

  async forCustomer(userId: string): Promise<Suggestion[]> {
    const db = this.supabase.admin;
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const [{ data: mine }, { data: addrs }, { data: products }] = await Promise.all([
      db
        .from("orders")
        .select("id, created_at, order_items(product_id, requested_kg, size, unavailable)")
        .eq("customer_id", userId)
        .eq("status", "DELIVERED")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(12),
      db.from("addresses").select("pincode").eq("user_id", userId).is("archived_at", null),
      db.from("products").select("id, name, name_ta, unit, base_price_per_kg, image_path, is_active"),
    ]);
    const catalog = new Map<string, Product>((products ?? []).map((p) => [p.id, p as Product]));
    const pincodes = [...new Set((addrs ?? []).map((a) => a.pincode))];
    const stocked = await this.stockedProducts(pincodes);
    const orders = (mine ?? []) as Row[];

    const nowIst = new Date(Date.now() + IST);
    const today = nowIst.getUTCDay();
    const tomorrow = (today + 1) % 7;
    const dayOf = (iso: string) => new Date(new Date(iso).getTime() + IST).getUTCDay();

    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (s: Suggestion | null) => {
      if (!s || !s.items.length) return;
      const sig = s.items.map((i) => `${i.productId}:${i.qty}`).sort().join("|");
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push(s);
    };
    const build = (kind: Suggestion["kind"], rows: Row["order_items"], day?: Suggestion["day"]): Suggestion | null => {
      const items: SuggestionItem[] = [];
      for (const it of rows) {
        if (it.unavailable) continue;
        const p = catalog.get(it.product_id);
        if (!p || !p.is_active || !stocked.has(p.id)) continue;
        if (items.some((x) => x.productId === p.id)) continue;
        items.push({
          productId: p.id,
          name: p.name,
          nameTa: p.name_ta,
          unit: p.unit,
          price: Number(p.base_price_per_kg),
          qty: Number(it.requested_kg),
          size: (it.size as SuggestionItem["size"]) ?? null,
          imagePath: p.image_path,
        });
      }
      if (!items.length) return null;
      return { kind, day, items, total: Math.round(items.reduce((t, i) => t + i.price * i.qty, 0)) };
    };

    // 1. Weekday habit: ≥2 of the last 8 orders on today's (or tomorrow's) weekday.
    for (const [d, label] of [
      [today, DAY[today]],
      [tomorrow, DAY[tomorrow]],
    ] as const) {
      const onDay = orders.slice(0, 8).filter((o) => dayOf(o.created_at) === d);
      if (onDay.length >= 2) {
        push(build("habit", onDay[0].order_items, label));
        break;
      }
    }

    // 2. Favourite: a product in ≥2 orders, with the quantity they used last time.
    const count = new Map<string, number>();
    for (const o of orders) for (const it of o.order_items) if (!it.unavailable) count.set(it.product_id, (count.get(it.product_id) ?? 0) + 1);
    const fav = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
    if (fav) {
      const lastRow = orders.flatMap((o) => o.order_items).find((it) => it.product_id === fav[0] && !it.unavailable);
      if (lastRow) push(build("favourite", [lastRow]));
    }

    // 3. Their last basket.
    if (orders[0]) push(build("last", orders[0].order_items));

    // 4. Popular near them (last 30 days, delivered, same pincodes). Always try, so new customers get one.
    if (out.length < 3) {
      let q = db
        .from("orders")
        .select("order_items(product_id, requested_kg, size, unavailable), addresses!inner(pincode)")
        .eq("status", "DELIVERED")
        .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
        .limit(300);
      if (pincodes.length) q = q.in("addresses.pincode", pincodes);
      const { data: nearby } = await q;
      const pop = new Map<string, { n: number; qty: number[] }>();
      for (const o of nearby ?? []) {
        for (const it of (o.order_items ?? []) as Row["order_items"]) {
          if (it.unavailable) continue;
          const e = pop.get(it.product_id) ?? { n: 0, qty: [] };
          e.n += 1;
          e.qty.push(Number(it.requested_kg));
          pop.set(it.product_id, e);
        }
      }
      const top = [...pop.entries()].filter(([id]) => !out.some((s) => s.items.some((i) => i.productId === id))).sort((a, b) => b[1].n - a[1].n)[0];
      if (top) {
        const qtys = top[1].qty.sort((a, b) => a - b);
        push(build("popular", [{ product_id: top[0], requested_kg: qtys[Math.floor(qtys.length / 2)], size: "medium", unavailable: false }]));
      }
    }
    return out.slice(0, 3);
  }

  /** Products at least one active shop serving these pincodes has in stock now. */
  private async stockedProducts(pincodes: string[]): Promise<Set<string>> {
    const db = this.supabase.admin;
    let dealerIds: string[] | null = null;
    if (pincodes.length) {
      const { data } = await db.from("dealer_pincodes").select("dealer_id").in("pincode", pincodes);
      dealerIds = [...new Set((data ?? []).map((d) => d.dealer_id))];
      if (!dealerIds.length) return new Set();
    }
    let q = db.from("dealer_products").select("product_id, out_of_stock_until, dealers!inner(is_active)").eq("dealers.is_active", true);
    if (dealerIds) q = q.in("dealer_id", dealerIds);
    const { data } = await q;
    const now = new Date().toISOString();
    return new Set((data ?? []).filter((r) => !r.out_of_stock_until || r.out_of_stock_until <= now).map((r) => r.product_id));
  }
}
