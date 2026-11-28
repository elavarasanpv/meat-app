import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { DEALER_ACCEPT_TIMEOUT_MIN, PREP_LEAD_MIN, SCHEDULED_AFTER_MIN, ON_THE_WAY_DETOUR_KM, RIDER_MAX_ACTIVE_ORDERS, RIDER_OFFER_RADIUS_KM, WEIGHT_TOLERANCE } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { AdminService } from "./admin.service";
import type { AdminUser } from "./admin.guard";

/** "45 min", "3 h", "2 days" */
const dur = (mins: number) => (mins < 90 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`);

/** Packed orders waiting longer than this for a rider raise an alert. */
const RIDER_WAIT_ALERT_MIN = 10;
/** An order for now that no shop has accepted after this long needs a call. */
const NOT_ACCEPTED_ALERT_MIN = 30;
/** Even with the slot close, give the shop its first few minutes. */
const ACCEPT_GRACE_MS = 10 * 60_000;

export type Alert = {
  id: string;
  kind: "no_shop" | "not_accepted" | "late" | "waiting_rider" | "cash_count" | "failed" | "cancelled" | "shop_declined" | "ticket" | "price_risk" | "market_change";
  severity: "urgent" | "warn" | "info";
  open: boolean; // still needs someone to act
  title: string;
  body: string;
  at: string;
  link: string;
};

/** The admin's own account, the admin team, the activity log and live alerts. */
@Injectable()
export class AdminAccountService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AdminService,
  ) {}

  private get db() {
    return this.supabase.admin;
  }

  // ───────────────────────────── alerts ─────────────────────────────

  async notifications(): Promise<Alert[]> {
    const db = this.db;
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 3600_000).toISOString();
    const [{ data: live }, { data: subs }, { data: attempts }, { data: cancelled }, { data: declined }, { data: tickets }] = await Promise.all([
      db
        .from("orders")
        .select("id, display_id, status, dealer_id, ready_by, created_at, updated_at, dealers(shop_name), delivery_slots(starts_at)")
        .in("status", ["PLACED", "DEALER_ASSIGNED", "ACCEPTED", "PACKING", "PACKED"]),
      db.from("cash_submissions").select("id, submitted, created_at, delivery_partners(profiles(full_name))").is("verified_by", null),
      db.from("delivery_attempts").select("id, reason, created_at, orders(id, display_id)").gte("created_at", dayAgo),
      db.from("orders").select("id, display_id, cancel_reason, updated_at").eq("status", "CANCELLED").gte("updated_at", dayAgo),
      db.from("order_assignments").select("id, outcome, reason, responded_at, orders(id, display_id), dealers(shop_name)").in("outcome", ["rejected", "timeout"]).gte("offered_at", dayAgo),
      db.from("tickets").select("id, type, body, created_at, profiles!tickets_customer_id_fkey(full_name)").eq("status", "open").order("created_at").limit(20),
    ]);

    const out: Alert[] = [];
    for (const o of live ?? []) {
      const shop = (o.dealers as unknown as { shop_name: string } | null)?.shop_name;
      if (!o.dealer_id && ["PLACED", "DEALER_ASSIGNED"].includes(o.status)) {
        out.push({ id: `no_shop:${o.id}`, kind: "no_shop", severity: "urgent", open: true, title: `${o.display_id} has no shop`, body: "No open shop stocks these items for this pincode. Move it to a shop or cancel it.", at: o.created_at, link: `/orders?id=${o.id}` });
      } else if (o.status === "DEALER_ASSIGNED" && this.unanswered(o, now)) {
        const mins = Math.round((now - new Date(o.created_at).getTime()) / 60000);
        out.push({ id: `not_accepted:${o.id}`, kind: "not_accepted", severity: "urgent", open: true, title: `${o.display_id} not accepted for ${dur(mins)}`, body: "No shop has answered. Call the shop, or move the order to another one.", at: o.created_at, link: `/orders?id=${o.id}` });
      } else if (o.ready_by && ["ACCEPTED", "PACKING"].includes(o.status) && new Date(o.ready_by).getTime() < now) {
        const mins = Math.round((now - new Date(o.ready_by).getTime()) / 60000);
        out.push({ id: `late:${o.id}`, kind: "late", severity: "warn", open: true, title: `${o.display_id} is ${dur(mins)} late`, body: `${shop ?? "The shop"} promised it packed by now.`, at: o.ready_by, link: `/orders?id=${o.id}` });
      } else if (o.status === "PACKED" && now - new Date(o.updated_at).getTime() > RIDER_WAIT_ALERT_MIN * 60_000) {
        const mins = Math.round((now - new Date(o.updated_at).getTime()) / 60000);
        out.push({ id: `waiting_rider:${o.id}`, kind: "waiting_rider", severity: "warn", open: true, title: `${o.display_id} waiting ${dur(mins)} for a rider`, body: `Packed at ${shop ?? "the shop"} and no rider has taken it.`, at: o.updated_at, link: `/orders?id=${o.id}` });
      }
    }
    for (const s of subs ?? []) {
      const name = (s.delivery_partners as unknown as { profiles: { full_name: string | null } | null } | null)?.profiles?.full_name ?? "A rider";
      out.push({ id: `cash_count:${s.id}`, kind: "cash_count", severity: "warn", open: true, title: `Count ₹${Math.round(Number(s.submitted ?? 0)).toLocaleString("en-IN")} from ${name}`, body: "Cash handed over and not counted yet.", at: s.created_at, link: "/cash" });
    }
    const REASON: Record<string, string> = { no_answer: "customer didn't answer", refused: "customer refused", wrong_address: "wrong address", other: "other reason" };
    for (const a of attempts ?? []) {
      const o = a.orders as unknown as { id: string; display_id: string } | null;
      if (!o) continue;
      out.push({ id: `failed:${a.id}`, kind: "failed", severity: "warn", open: false, title: `${o.display_id} delivery failed`, body: `Rider reported: ${REASON[a.reason] ?? a.reason}.`, at: a.created_at, link: `/orders?id=${o.id}` });
    }
    for (const c of cancelled ?? []) {
      out.push({ id: `cancelled:${c.id}`, kind: "cancelled", severity: "info", open: false, title: `${c.display_id} cancelled`, body: c.cancel_reason ?? "No reason given.", at: c.updated_at, link: `/orders?id=${c.id}` });
    }
    for (const d of declined ?? []) {
      const o = d.orders as unknown as { id: string; display_id: string } | null;
      if (!o) continue;
      const shop = (d.dealers as unknown as { shop_name: string } | null)?.shop_name ?? "A shop";
      out.push({ id: `shop_declined:${d.id}`, kind: "shop_declined", severity: "info", open: false, title: `${shop} ${d.outcome === "timeout" ? "missed" : "declined"} ${o.display_id}`, body: d.outcome === "timeout" ? "No answer in 5 minutes." : `Reason: ${(d.reason ?? "not given").replace(/_/g, " ")}.`, at: d.responded_at ?? new Date().toISOString(), link: `/orders?id=${o.id}` });
    }
    for (const t of tickets ?? []) {
      const who = (t.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "A customer";
      out.push({ id: `ticket:${t.id}`, kind: "ticket", severity: "warn", open: true, title: `Support: ${who}`, body: (t.body ?? "").slice(0, 110), at: t.created_at, link: `/support?id=${t.id}` });
    }
    out.push(...(await this.priceAlerts(dayAgo)));
    const rank = { urgent: 0, warn: 1, info: 2 };
    return out.sort((a, b) => Number(b.open) - Number(a.open) || rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at));
  }

  /**
   * Meat prices against each shop's own counter (market) price.
   *  • Needs action while it lasts: the shop's counter price is below what we
   *    sell for (customers pay more on the app), or below what we pay the shop.
   *  • Updates: every market price change of the last 24 hours, with what it
   *    now means for us.
   */
  private async priceAlerts(dayAgo: string): Promise<Alert[]> {
    const db = this.db;
    const [{ data: rows }, { data: changes }] = await Promise.all([
      db
        .from("dealer_products")
        .select("dealer_id, product_id, price_per_kg, market_price, market_price_at, dealers!inner(shop_name, is_active, store_type), products!inner(name, unit, base_price_per_kg, is_active)")
        .not("market_price", "is", null)
        .eq("dealers.store_type", "meat"),
      db
        .from("price_history")
        .select("id, dealer_id, product_id, old_price, new_price, created_at, products(name, unit, base_price_per_kg), dealers(shop_name), profiles:changed_by(role)")
        .eq("kind", "market")
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    type Shop = { shop_name: string; is_active?: boolean };
    type Prod = { name: string; unit: string; base_price_per_kg: number; is_active?: boolean };
    const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
    const per = (u: string) => (u === "piece" ? "/pc" : "/kg");
    const costOf = new Map((rows ?? []).map((r) => [`${r.dealer_id}:${r.product_id}`, r.price_per_kg == null ? null : Number(r.price_per_kg)]));
    const out: Alert[] = [];
    for (const r of rows ?? []) {
      const shop = r.dealers as unknown as Shop;
      const prod = r.products as unknown as Prod;
      if (!shop?.is_active || !prod?.is_active) continue;
      const market = Number(r.market_price);
      const sell = Number(prod.base_price_per_kg);
      const cost = r.price_per_kg == null ? null : Number(r.price_per_kg);
      const overSell = sell - market;
      const overCost = cost == null ? 0 : cost - market;
      if (overSell <= 0 && overCost <= 0) continue;
      const u = per(prod.unit);
      const lines: string[] = [];
      if (overCost > 0) lines.push(`We pay the shop ${rs(cost!)}${u}, ${rs(overCost)} more than its own counter price. Ask the shop for a lower cost.`);
      if (overSell > 0) lines.push(`Customers pay ${rs(sell)}${u} on the app, ${rs(overSell)} more than at the shop. Lower our selling price.`);
      out.push({
        id: `price_risk:${r.dealer_id}:${r.product_id}`,
        kind: "price_risk",
        severity: overCost > 0 || overSell >= sell * 0.05 ? "urgent" : "warn",
        open: true,
        title: `${prod.name}: ${shop.shop_name} counter price is ${rs(market)}${u}`,
        body: lines.join(" "),
        at: r.market_price_at ?? new Date().toISOString(),
        link: `/pricing?product=${r.product_id}`,
      });
    }
    for (const c of changes ?? []) {
      const prod = c.products as unknown as Prod | null;
      const shop = c.dealers as unknown as Shop | null;
      if (!prod || !shop) continue;
      const from = c.old_price == null ? null : Number(c.old_price);
      const to = Number(c.new_price);
      const by = (c.profiles as unknown as { role: string } | null)?.role === "admin" ? "You set" : `${shop.shop_name} changed`;
      const pct = from ? Math.round(((to - from) / from) * 100) : null;
      const cost = costOf.get(`${c.dealer_id}:${c.product_id}`) ?? null;
      const sell = Number(prod.base_price_per_kg);
      const u = per(prod.unit);
      const now = `Now: market ${rs(to)}, our cost ${cost == null ? "not set" : rs(cost)}, we sell ${rs(sell)}${u}.`;
      out.push({
        id: `market_change:${c.id}`,
        kind: "market_change",
        severity: pct != null && Math.abs(pct) >= 10 ? "warn" : "info",
        open: false,
        title: `${by} ${prod.name} market price ${from == null ? "" : `${rs(from)} → `}${rs(to)}${u}${pct ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}`,
        body: now,
        at: c.created_at,
        link: `/pricing?product=${c.product_id}`,
      });
    }
    return out;
  }

  /**
   * Offered and nobody answered: an order for now after half an hour, an order
   * for a later slot (placed at night, say) once its preparing time is near.
   */
  private unanswered(o: { created_at: string; delivery_slots: unknown }, now: number) {
    const s = o.delivery_slots as { starts_at: string } | { starts_at: string }[] | null;
    const startsAt = (Array.isArray(s) ? s[0] : s)?.starts_at;
    const toSlot = startsAt ? new Date(startsAt).getTime() - now : 0;
    if (toSlot <= PREP_LEAD_MIN * 60_000) return now - new Date(o.created_at).getTime() > ACCEPT_GRACE_MS;
    return toSlot <= SCHEDULED_AFTER_MIN * 60_000 && now - new Date(o.created_at).getTime() > NOT_ACCEPTED_ALERT_MIN * 60_000;
  }

  // ───────────────────────────── own profile ─────────────────────────────

  async updateMe(admin: AdminUser, name: string) {
    const { error } = await this.db.from("profiles").update({ full_name: name }).eq("id", admin.id);
    if (error) throw new BadRequestException(error.message);
    await this.audit.log(admin.id, "admin.profile", admin.id, { name });
    return { name };
  }

  // ───────────────────────────── admin team ─────────────────────────────

  private async usersByEmail() {
    const { data } = await this.db.auth.admin.listUsers({ perPage: 1000 });
    return new Map((data?.users ?? []).filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]));
  }

  async admins() {
    const [{ data: rows }, users] = await Promise.all([this.db.from("admin_emails").select("email, note, created_at").order("created_at"), this.usersByEmail()]);
    const ids = [...users.values()].map((u) => u.id);
    const { data: profiles } = ids.length ? await this.db.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    return (rows ?? []).map((r) => {
      const u = users.get(r.email);
      return {
        email: r.email,
        note: r.note,
        addedAt: r.created_at,
        name: profiles?.find((p) => p.id === u?.id)?.full_name ?? null,
        status: !u ? "invited" : u.last_sign_in_at ? "active" : "invited",
        lastSignIn: u?.last_sign_in_at ?? null,
      };
    });
  }

  /** Put an email on the allowlist and return a personal link to set a password. */
  async invite(admin: AdminUser, email: string, note: string | undefined, appUrl: string) {
    const db = this.db;
    const { error } = await db.from("admin_emails").upsert({ email, note: note || null });
    if (error) throw new BadRequestException(error.message);
    let kind: "invite" | "recovery" = "invite";
    let link = await db.auth.admin.generateLink({ type: "invite", email });
    if (link.error) {
      kind = "recovery";
      link = await db.auth.admin.generateLink({ type: "recovery", email });
      if (link.data?.user?.id) await db.from("profiles").update({ role: "admin" }).eq("id", link.data.user.id);
    }
    if (link.error) throw new BadRequestException(link.error.message);
    await this.audit.log(admin.id, "admin.invite", email, { note, kind });
    return { email, kind, link: `${appUrl.replace(/\/$/, "")}/set-password#token_hash=${link.data.properties.hashed_token}&type=${kind}` };
  }

  /** Take an email off the allowlist. The API refuses them from the next request. */
  async remove(admin: AdminUser, email: string) {
    if (email === admin.email) throw new ConflictException("You can't remove yourself");
    const { count } = await this.db.from("admin_emails").select("email", { count: "exact", head: true });
    if ((count ?? 0) <= 1) throw new ConflictException("At least one admin must remain");
    const { error } = await this.db.from("admin_emails").delete().eq("email", email);
    if (error) throw new BadRequestException(error.message);
    const user = (await this.usersByEmail()).get(email);
    if (user) await this.db.from("profiles").update({ role: "customer" }).eq("id", user.id).eq("role", "admin");
    await this.audit.log(admin.id, "admin.remove", email);
    return { removed: true };
  }

  // ───────────────────────────── activity & rules ─────────────────────────────

  async activity(limit = 60) {
    const [{ data }, users] = await Promise.all([
      this.db.from("admin_actions").select("id, admin_id, action, target, detail, created_at, profiles(full_name)").order("created_at", { ascending: false }).limit(limit),
      this.usersByEmail(),
    ]);
    const emailById = new Map([...users.values()].map((u) => [u.id, u.email!]));
    return (data ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      target: a.target,
      detail: a.detail as Record<string, unknown> | null,
      at: a.created_at,
      by: (a.profiles as unknown as { full_name: string | null } | null)?.full_name ?? emailById.get(a.admin_id) ?? "Admin",
    }));
  }

  rules() {
    return {
      shopAcceptMinutes: DEALER_ACCEPT_TIMEOUT_MIN,
      riderRadiusKm: RIDER_OFFER_RADIUS_KM,
      riderMaxOrders: RIDER_MAX_ACTIVE_ORDERS,
      detourKm: ON_THE_WAY_DETOUR_KM,
      weightTolerancePct: Math.round(WEIGHT_TOLERANCE * 100),
      riderWaitAlertMin: RIDER_WAIT_ALERT_MIN,
    };
  }
}
