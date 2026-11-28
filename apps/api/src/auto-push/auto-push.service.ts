import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { AutoPushInput } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { PushService } from "../push/push.service";

type Kind = "salary_day" | "weekend" | "inactive" | "reorder";
type Row = {
  kind: Kind;
  enabled: boolean;
  title: string;
  body: string;
  title_ta: string | null;
  body_ta: string | null;
  send_at: string;
  day_of_month: number;
  weekday: number;
  inactive_days: number;
  audience: "all" | "ordered" | "never_ordered";
  pincodes: string[];
  last_run_on: string | null;
  last_sent_at: string | null;
  last_sent_count: number | null;
};

const IST = 5.5 * 3600_000;
const SWEEP_MS = 5 * 60_000;
/** A push that could not go at its time (the server was asleep) still goes within this window, never late at night. */
const LATE_MS = 3 * 3600_000;
const ORDER: Kind[] = ["reorder", "inactive", "salary_day", "weekend"];
const DAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_TA = ["ஞாயிற்றுக்கிழமை", "திங்கட்கிழமை", "செவ்வாய்க்கிழமை", "புதன்கிழமை", "வியாழக்கிழமை", "வெள்ளிக்கிழமை", "சனிக்கிழமை"];

type ReorderRow = { user_id: string; order_id: string; names: string[] | null; names_ta: string[] | null };

/** "Chicken curry cut", "Chicken curry cut and Eggs", "Chicken curry cut, Eggs and 2 more". */
function itemsLine(names: string[], ta: boolean) {
  const and = ta ? " மற்றும் " : " and ";
  if (names.length <= 1) return names[0] ?? (ta ? "உங்கள் பொருட்கள்" : "your favourites");
  if (names.length === 2) return names.join(and);
  return `${names.slice(0, 2).join(", ")}${and}${ta ? `மேலும் ${names.length - 2}` : `${names.length - 2} more`}`;
}
const fill = (text: string, day: string, items: string) => text.split("{day}").join(day).split("{items}").join(items);

/** Indian date and minute of the day, from a UTC time. */
function istNow(t = Date.now()) {
  const d = new Date(t + IST);
  return { date: d.toISOString().slice(0, 10), day: d.getUTCDate(), weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), year: d.getUTCFullYear(), month: d.getUTCMonth() };
}
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Automatic customer pushes. Every few minutes: each switched-on kind whose
 * day it is and whose time has come goes out once that (Indian) day.
 */
@Injectable()
export class AutoPushService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly supabase: SupabaseService,
    private readonly push: PushService,
  ) {}

  private get db() {
    return this.supabase.admin;
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep().catch((e) => console.error("[auto-push] sweep", e)), SWEEP_MS);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async rows(): Promise<Row[]> {
    const { data, error } = await this.db.from("auto_pushes").select("*");
    if (error) throw new BadRequestException(error.message);
    return ((data ?? []) as Row[]).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  }

  /** Is today this push's day? Salary day on a short month falls on its last day. */
  private isDay(r: Row, now = istNow()) {
    if (r.kind === "weekend") return now.weekday === r.weekday;
    if (r.kind === "salary_day") {
      const last = new Date(Date.UTC(now.year, now.month + 1, 0)).getUTCDate();
      return now.day === Math.min(r.day_of_month, last);
    }
    return true;
  }

  /** The next Indian date it goes out (for the admin page). */
  private nextOn(r: Row) {
    const now = istNow();
    for (let i = 0; i < 62; i++) {
      const t = istNow(Date.now() + i * 86_400_000);
      if (!this.isDay(r, t)) continue;
      if (i === 0 && (r.last_run_on === now.date || now.minutes > minutesOf(r.send_at) + LATE_MS / 60_000)) continue;
      return t.date;
    }
    return null;
  }

  /** Customers to remind of last week's order today, with what they ordered. */
  private async reorderList(r: Row): Promise<ReorderRow[]> {
    const out: ReorderRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.rpc("auto_push_reorder", { p_pincodes: r.pincodes ?? [] }).range(from, from + 999);
      if (error) throw new BadRequestException(error.message);
      const page = (data ?? []) as ReorderRow[];
      out.push(...page.filter((x) => x.names?.length));
      if (page.length < 1000) return out;
    }
  }

  /** Every customer this push would reach right now. */
  private async audience(r: Row): Promise<string[]> {
    if (r.kind === "reorder") return (await this.reorderList(r)).map((x) => x.user_id);
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db
        .rpc("auto_push_audience", { p_audience: r.audience, p_pincodes: r.pincodes ?? [], p_inactive_days: r.kind === "inactive" ? r.inactive_days : null })
        .range(from, from + 999);
      if (error) throw new BadRequestException(error.message);
      const page = (data ?? []) as { user_id: string }[];
      ids.push(...page.map((x) => x.user_id));
      if (page.length < 1000) return ids;
    }
  }

  private shape(r: Row, reach: number) {
    return {
      kind: r.kind,
      enabled: r.enabled,
      title: r.title,
      body: r.body,
      titleTa: r.title_ta,
      bodyTa: r.body_ta,
      sendAt: r.send_at.slice(0, 5),
      dayOfMonth: r.day_of_month,
      weekday: r.weekday,
      inactiveDays: r.inactive_days,
      audience: r.audience,
      pincodes: r.pincodes ?? [],
      lastSentAt: r.last_sent_at,
      lastSentCount: r.last_sent_count,
      nextOn: r.enabled ? this.nextOn(r) : null,
      reach,
    };
  }

  async list() {
    const rows = await this.rows();
    return Promise.all(rows.map(async (r) => this.shape(r, (await this.audience(r)).length)));
  }

  async save(kind: string, input: AutoPushInput) {
    if (!ORDER.includes(kind as Kind)) throw new NotFoundException("No such notification");
    const { data, error } = await this.db
      .from("auto_pushes")
      .update({
        enabled: input.enabled,
        title: input.title,
        body: input.body,
        title_ta: input.titleTa || null,
        body_ta: input.bodyTa || null,
        send_at: input.sendAt,
        day_of_month: input.dayOfMonth,
        weekday: input.weekday,
        inactive_days: input.inactiveDays,
        audience: input.audience,
        pincodes: [...new Set(input.pincodes)],
      })
      .eq("kind", kind)
      .select("*")
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException("No such notification");
    const r = data as Row;
    return this.shape(r, (await this.audience(r)).length);
  }

  private message(r: Row) {
    return {
      title: r.title,
      body: r.body,
      ta: r.title_ta && r.body_ta ? { title: r.title_ta, body: r.body_ta } : undefined,
      data: { kind: "promo" },
      channelId: "offers" as const,
    };
  }

  /** Send the saved wording to one customer's phone, to see how it looks. Nothing is recorded. */
  async test(kind: string, phone10: string) {
    const r = (await this.rows()).find((x) => x.kind === kind);
    if (!r) throw new NotFoundException("No such notification");
    const { data: p } = await this.db.from("profiles").select("id, role").eq("phone", `91${phone10}`).maybeSingle();
    if (!p) throw new BadRequestException("No customer with this number");
    const msg = this.message(r);
    if (r.kind === "reorder") {
      const d = istNow().weekday;
      Object.assign(msg, { title: fill(r.title, DAY_EN[d], "Chicken curry cut"), body: fill(r.body, DAY_EN[d], "Chicken curry cut") });
      if (msg.ta) msg.ta = { title: fill(msg.ta.title, DAY_TA[d], "கோழி கறி துண்டு"), body: fill(msg.ta.body, DAY_TA[d], "கோழி கறி துண்டு") };
    }
    const res = await this.push.toProfiles([p.id as string], msg);
    if (!res.sent) throw new BadRequestException("This number has no phone with the customer app signed in");
    return { sent: res.sent };
  }

  /** Logged first: one automatic push per customer per day, and "we miss you" once per quiet spell. */
  private async log(kind: Kind, ids: string[]) {
    for (let i = 0; i < ids.length; i += 500) {
      await this.db.from("auto_push_log").insert(ids.slice(i, i + 500).map((customer_id) => ({ kind, customer_id })));
    }
  }

  /** Each customer gets their own line: what they ordered on this day last week. */
  private async sendReorders(r: Row, weekday: number) {
    const list = await this.reorderList(r);
    await this.log("reorder", list.map((x) => x.user_id));
    let sent = 0;
    let failed = 0;
    for (const x of list) {
      const en = itemsLine(x.names ?? [], false);
      const ta = itemsLine(x.names_ta ?? x.names ?? [], true);
      const res = await this.push.toProfiles([x.user_id], {
        title: fill(r.title, DAY_EN[weekday], en),
        body: fill(r.body, DAY_EN[weekday], en),
        ta: r.title_ta && r.body_ta ? { title: fill(r.title_ta, DAY_TA[weekday], ta), body: fill(r.body_ta, DAY_TA[weekday], ta) } : undefined,
        data: { kind: "reorder", orderId: x.order_id },
        channelId: "offers",
      });
      sent += res.sent;
      failed += res.failed;
    }
    await this.db.from("auto_pushes").update({ last_sent_at: new Date().toISOString(), last_sent_count: list.length }).eq("kind", "reorder");
    console.log(`[auto-push] reorder: ${list.length} customers, ${sent} phones sent, ${failed} failed`);
  }

  private async sweep() {
    const now = istNow();
    for (const r of await this.rows()) {
      if (!r.enabled || r.last_run_on === now.date || !this.isDay(r, now)) continue;
      const at = minutesOf(r.send_at);
      if (now.minutes < at || now.minutes > at + LATE_MS / 60_000) continue;
      // Claim today first, so two servers (or a slow tick) never send twice.
      const { data: claimed } = await this.db
        .from("auto_pushes")
        .update({ last_run_on: now.date })
        .eq("kind", r.kind)
        .eq("enabled", true)
        .or(`last_run_on.is.null,last_run_on.lt.${now.date}`)
        .select("kind");
      if (!claimed?.length) continue;
      try {
        if (r.kind === "reorder") {
          await this.sendReorders(r, now.weekday);
          continue;
        }
        const ids = await this.audience(r);
        await this.log(r.kind, ids);
        const res = ids.length ? await this.push.toProfiles(ids, this.message(r)) : { sent: 0, failed: 0 };
        await this.db.from("auto_pushes").update({ last_sent_at: new Date().toISOString(), last_sent_count: ids.length }).eq("kind", r.kind);
        console.log(`[auto-push] ${r.kind}: ${ids.length} customers, ${res.sent} phones sent, ${res.failed} failed`);
      } catch (e) {
        console.warn("[auto-push]", r.kind, (e as Error).message);
      }
    }
  }
}
