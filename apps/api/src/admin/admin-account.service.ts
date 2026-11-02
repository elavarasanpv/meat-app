import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { DEALER_ACCEPT_TIMEOUT_MIN, DELIVERY_FEE, FREE_DELIVERY_ABOVE, ON_THE_WAY_DETOUR_KM, RIDER_MAX_ACTIVE_ORDERS, RIDER_OFFER_RADIUS_KM, WEIGHT_TOLERANCE } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { AdminService } from "./admin.service";
import type { AdminUser } from "./admin.guard";

/** "45 min", "3 h", "2 days" */
const dur = (mins: number) => (mins < 90 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`);

/** Packed orders waiting longer than this for a rider raise an alert. */
const RIDER_WAIT_ALERT_MIN = 10;

export type Alert = {
  id: string;
  kind: "no_shop" | "late" | "waiting_rider" | "cash_count" | "failed" | "cancelled" | "shop_declined" | "ticket";
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
        .select("id, display_id, status, dealer_id, ready_by, created_at, updated_at, dealers(shop_name)")
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
      out.push({ id: `shop_declined:${d.id}`, kind: "shop_declined", severity: "info", open: false, title: `${shop} ${d.outcome === "timeout" ? "missed" : "declined"} ${o.display_id}`, body: d.outcome === "timeout" ? "No answer in 5 minutes; offered to the next shop." : `Reason: ${(d.reason ?? "not given").replace(/_/g, " ")}.`, at: d.responded_at ?? new Date().toISOString(), link: `/orders?id=${o.id}` });
    }
    for (const t of tickets ?? []) {
      const who = (t.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "A customer";
      out.push({ id: `ticket:${t.id}`, kind: "ticket", severity: "warn", open: true, title: `Support: ${who}`, body: (t.body ?? "").slice(0, 110), at: t.created_at, link: `/support?id=${t.id}` });
    }
    const rank = { urgent: 0, warn: 1, info: 2 };
    return out.sort((a, b) => Number(b.open) - Number(a.open) || rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at));
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
      deliveryFee: DELIVERY_FEE,
      freeDeliveryAbove: FREE_DELIVERY_ABOVE,
      shopAcceptMinutes: DEALER_ACCEPT_TIMEOUT_MIN,
      riderRadiusKm: RIDER_OFFER_RADIUS_KM,
      riderMaxOrders: RIDER_MAX_ACTIVE_ORDERS,
      detourKm: ON_THE_WAY_DETOUR_KM,
      weightTolerancePct: Math.round(WEIGHT_TOLERANCE * 100),
      riderWaitAlertMin: RIDER_WAIT_ALERT_MIN,
    };
  }
}
