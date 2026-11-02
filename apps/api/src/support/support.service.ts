import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AUTO_CREDIT_COOLDOWN_DAYS, AUTO_CREDIT_MAX, type CreateTicketInput, type TicketResolveInput } from "@freshcut/shared";
import { SupabaseService } from "../supabase.service";
import { PushService } from "../push/push.service";
import type { AdminUser } from "../admin/admin.guard";

type Name = { full_name: string | null; phone: string | null } | null;

const TYPE_LABEL: Record<string, string> = {
  missing_item: "Item missing or less weight",
  quality: "Quality problem",
  late: "Late delivery",
  rider_behaviour: "Rider behaviour",
  charged_wrong: "Charged wrong",
  delivery_failed: "Delivery failed",
  app_issue: "App problem",
  cash_dispute: "Cash dispute",
  other: "Other",
};

/**
 * Support tickets: the customer side (create, read own, reply) and the admin
 * side (queue, reply, resolve). Resolving with a credit writes the wallet
 * ledger. Small missing-item claims with a photo settle themselves.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly push: PushService,
  ) {}

  private get db() {
    return this.supabase.admin;
  }

  private async sign(path: string | null) {
    if (!path) return null;
    const { data } = await this.db.storage.from("order-proofs").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  private async uploadPhoto(ticketId: string, base64: string): Promise<string> {
    const clean = base64.replace(/^data:image\/\w+;base64,/, "");
    const body = Buffer.from(clean, "base64");
    if (body.byteLength > 1_200_000) throw new BadRequestException("Photo too large");
    const path = `support/${ticketId}/${Date.now()}.jpg`;
    const { error } = await this.db.storage.from("order-proofs").upload(path, body, { contentType: "image/jpeg", upsert: true });
    if (error) throw new BadRequestException(error.message);
    return path;
  }

  // ───────────────────────── customer ─────────────────────────

  async myTickets(userId: string) {
    const { data } = await this.db
      .from("tickets")
      .select("id, type, status, body, credit_amount, resolution, created_at, updated_at, orders(display_id)")
      .eq("customer_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((t) => ({
      id: t.id,
      type: t.type,
      typeLabel: TYPE_LABEL[t.type] ?? t.type,
      status: t.status,
      body: t.body,
      creditAmount: t.credit_amount == null ? null : Number(t.credit_amount),
      resolution: t.resolution,
      order: (t.orders as unknown as { display_id: string } | null)?.display_id ?? null,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  }

  async createTicket(userId: string, input: CreateTicketInput, source: "customer" | "shop" | "rider" = "customer") {
    const db = this.db;
    if (input.orderId) {
      const { data: o } = await db.from("orders").select("id, customer_id").eq("id", input.orderId).maybeSingle();
      if (!o) throw new NotFoundException("Order not found");
      if (source === "customer" && o.customer_id !== userId) throw new ForbiddenException("Not your order");
    }
    const { data: t, error } = await db
      .from("tickets")
      .insert({
        customer_id: userId,
        order_id: input.orderId ?? null,
        order_item_id: input.orderItemId ?? null,
        type: input.type,
        body: input.body,
        source,
      })
      .select("id")
      .single();
    if (error) throw new BadRequestException(error.message);

    const photoPath = input.photoBase64 ? await this.uploadPhoto(t.id, input.photoBase64) : null;
    await db.from("ticket_messages").insert({ ticket_id: t.id, sender: source === "customer" ? "customer" : "system", sender_id: userId, body: input.body, photo_path: photoPath });

    const auto = await this.tryAutoCredit(userId, t.id, input, !!photoPath);
    return { id: t.id, ...auto };
  }

  /** Small missing-item claim with a photo on a delivered order: credit instantly, once a week. */
  private async tryAutoCredit(userId: string, ticketId: string, input: CreateTicketInput, hasPhoto: boolean) {
    const db = this.db;
    if (input.type !== "missing_item" || !input.orderId || !input.orderItemId || !hasPhoto) return { autoCredited: false };
    const [{ data: order }, { data: item }, { data: recent }] = await Promise.all([
      db.from("orders").select("status").eq("id", input.orderId).maybeSingle(),
      db.from("order_items").select("id, requested_kg, unit_price_per_kg, unavailable").eq("id", input.orderItemId).eq("order_id", input.orderId).maybeSingle(),
      db
        .from("wallet_entries")
        .select("id")
        .eq("customer_id", userId)
        .eq("reason", "support_credit")
        .gte("created_at", new Date(Date.now() - AUTO_CREDIT_COOLDOWN_DAYS * 86_400_000).toISOString())
        .limit(1),
    ]);
    if (order?.status !== "DELIVERED" || !item || item.unavailable) return { autoCredited: false };
    const amount = Math.round(Number(item.requested_kg) * Number(item.unit_price_per_kg));
    if (amount <= 0 || amount > AUTO_CREDIT_MAX || (recent?.length ?? 0) > 0) return { autoCredited: false };

    await db.from("wallet_entries").insert({ customer_id: userId, amount, reason: "support_credit", ticket_id: ticketId, order_id: input.orderId });
    await db.from("tickets").update({ status: "resolved", resolution: "credit", fault: "shop", credit_amount: amount, resolved_at: new Date().toISOString() }).eq("id", ticketId);
    await db.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender: "system",
      body: `Sorry about that! ₹${amount} has been added to your FreshCut wallet and will be used on your next order.`,
    });
    return { autoCredited: true, amount };
  }

  async thread(userId: string | null, ticketId: string) {
    const db = this.db;
    const { data: t } = await db
      .from("tickets")
      .select("id, customer_id, order_id, type, status, source, fault, resolution, credit_amount, created_at, updated_at, profiles!tickets_customer_id_fkey(full_name, phone), orders(display_id, status, final_amount, est_amount)")
      .eq("id", ticketId)
      .maybeSingle();
    if (!t) throw new NotFoundException("Ticket not found");
    if (userId && t.customer_id !== userId) throw new ForbiddenException("Not your ticket");
    const { data: msgs } = await db.from("ticket_messages").select("id, sender, body, photo_path, created_at").eq("ticket_id", ticketId).order("created_at");
    const o = t.orders as unknown as { display_id: string; status: string; final_amount: number | null; est_amount: number } | null;
    const p = t.profiles as unknown as Name;
    return {
      id: t.id,
      customerId: t.customer_id,
      customer: { name: p?.full_name ?? null, phone: p?.phone ?? null },
      orderId: t.order_id,
      order: o ? { displayId: o.display_id, status: o.status, amount: Number(o.final_amount ?? o.est_amount) } : null,
      type: t.type,
      typeLabel: TYPE_LABEL[t.type] ?? t.type,
      status: t.status,
      source: t.source,
      fault: t.fault,
      resolution: t.resolution,
      creditAmount: t.credit_amount == null ? null : Number(t.credit_amount),
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      messages: await Promise.all(
        (msgs ?? []).map(async (m) => ({ id: m.id, sender: m.sender, body: m.body, photoUrl: await this.sign(m.photo_path), at: m.created_at })),
      ),
    };
  }

  async customerReply(userId: string, ticketId: string, body: string, photoBase64?: string) {
    const db = this.db;
    const { data: t } = await db.from("tickets").select("id, customer_id, status").eq("id", ticketId).maybeSingle();
    if (!t || t.customer_id !== userId) throw new NotFoundException("Ticket not found");
    if (t.status === "closed") throw new BadRequestException("This ticket is closed. Start a new one.");
    const photoPath = photoBase64 ? await this.uploadPhoto(ticketId, photoBase64) : null;
    await db.from("ticket_messages").insert({ ticket_id: ticketId, sender: "customer", sender_id: userId, body, photo_path: photoPath });
    await db.from("tickets").update({ status: "open" }).eq("id", ticketId); // back in the admin queue
    return { sent: true };
  }

  async wallet(userId: string) {
    const { data } = await this.db
      .from("wallet_entries")
      .select("amount, reason, note, created_at, orders(display_id)")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    const entries = (data ?? []).map((e) => ({
      amount: Number(e.amount),
      reason: e.reason,
      note: e.note,
      order: (e.orders as unknown as { display_id: string } | null)?.display_id ?? null,
      at: e.created_at,
    }));
    return { balance: entries.reduce((t, e) => t + e.amount, 0), entries };
  }

  // ───────────────────────── admin ─────────────────────────

  async adminList(filter = "open") {
    const db = this.db;
    let q = db
      .from("tickets")
      .select("id, type, status, source, body, credit_amount, resolution, created_at, updated_at, profiles!tickets_customer_id_fkey(full_name, phone), orders(display_id)")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (filter === "open") q = q.eq("status", "open");
    else if (filter === "waiting") q = q.eq("status", "waiting_customer");
    else if (filter === "done") q = q.in("status", ["resolved", "closed"]);
    const { data } = await q;
    return (data ?? []).map((t) => {
      const p = t.profiles as unknown as Name;
      return {
        id: t.id,
        type: t.type,
        typeLabel: TYPE_LABEL[t.type] ?? t.type,
        status: t.status,
        source: t.source,
        body: t.body,
        creditAmount: t.credit_amount == null ? null : Number(t.credit_amount),
        resolution: t.resolution,
        customer: p?.full_name ?? null,
        phone: p?.phone ?? null,
        order: (t.orders as unknown as { display_id: string } | null)?.display_id ?? null,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });
  }

  /** Open tickets, for the admin notification bell. */
  async openCount() {
    const { data } = await this.db.from("tickets").select("id, type, body, created_at, profiles!tickets_customer_id_fkey(full_name)").eq("status", "open").order("created_at").limit(20);
    return (data ?? []).map((t) => ({
      id: t.id,
      typeLabel: TYPE_LABEL[t.type] ?? t.type,
      body: t.body ?? "",
      customer: (t.profiles as unknown as Name)?.full_name ?? "A customer",
      at: t.created_at,
    }));
  }

  async adminReply(admin: AdminUser, ticketId: string, body: string) {
    const db = this.db;
    const { data: t } = await db.from("tickets").select("id, customer_id, status").eq("id", ticketId).maybeSingle();
    if (!t) throw new NotFoundException("Ticket not found");
    await db.from("ticket_messages").insert({ ticket_id: ticketId, sender: "admin", sender_id: admin.id, body });
    if (t.status === "open") await db.from("tickets").update({ status: "waiting_customer", assigned_admin: admin.id }).eq("id", ticketId);
    void this.push.toProfiles([t.customer_id], { title: "FreshCut support", body: body.slice(0, 120), data: { type: "support", ticketId } });
    return { sent: true };
  }

  async resolve(admin: AdminUser, ticketId: string, input: TicketResolveInput) {
    const db = this.db;
    const { data: t } = await db.from("tickets").select("id, customer_id, order_id, status, resolution").eq("id", ticketId).maybeSingle();
    if (!t) throw new NotFoundException("Ticket not found");
    if (t.status === "resolved" || t.status === "closed") throw new BadRequestException("Already resolved");
    if (input.resolution === "credit" && !(input.amount && input.amount > 0)) throw new BadRequestException("Enter the credit amount");

    if (input.resolution === "credit") {
      const { error } = await db
        .from("wallet_entries")
        .insert({ customer_id: t.customer_id, amount: input.amount, reason: "support_credit", ticket_id: ticketId, order_id: t.order_id, note: input.note ?? null, created_by: admin.id });
      if (error) throw new BadRequestException(error.message);
    }
    const { error } = await db
      .from("tickets")
      .update({
        status: "resolved",
        resolution: input.resolution,
        fault: input.fault,
        credit_amount: input.resolution === "credit" ? input.amount : null,
        resolved_by: admin.id,
        resolved_at: new Date().toISOString(),
        assigned_admin: admin.id,
      })
      .eq("id", ticketId);
    if (error) throw new BadRequestException(error.message);

    const text =
      input.resolution === "credit"
        ? `We've added ₹${input.amount} to your FreshCut wallet. It will be used on your next order.${input.note ? ` ${input.note}` : ""}`
        : input.resolution === "refund_upi"
          ? `We'll send your refund by UPI shortly.${input.note ? ` ${input.note}` : ""}`
          : (input.note ?? "Thanks for telling us. We've looked into it.");
    await db.from("ticket_messages").insert({ ticket_id: ticketId, sender: "admin", sender_id: admin.id, body: text });
    void this.push.toProfiles([t.customer_id], { title: "FreshCut support", body: text.slice(0, 120), data: { type: "support", ticketId } });
    return { resolved: true };
  }

  async close(admin: AdminUser, ticketId: string) {
    const { error } = await this.db.from("tickets").update({ status: "closed", assigned_admin: admin.id }).eq("id", ticketId);
    if (error) throw new BadRequestException(error.message);
    return { closed: true };
  }

  /** Auto-ticket when a delivery fails, so support reaches out instead of waiting. */
  async autoTicketFailedDelivery(orderId: string, reason: string) {
    const db = this.db;
    const { data: o } = await db.from("orders").select("id, customer_id, display_id").eq("id", orderId).maybeSingle();
    if (!o) return;
    const { data: existing } = await db.from("tickets").select("id").eq("order_id", orderId).eq("type", "delivery_failed").maybeSingle();
    if (existing) return;
    const body = `Delivery of ${o.display_id} failed (${reason.replace(/_/g, " ")}). We'll contact the customer.`;
    const { data: t } = await db
      .from("tickets")
      .insert({ customer_id: o.customer_id, order_id: orderId, type: "delivery_failed", body, source: "auto" })
      .select("id")
      .single();
    if (t) await db.from("ticket_messages").insert({ ticket_id: t.id, sender: "system", body });
  }
}
