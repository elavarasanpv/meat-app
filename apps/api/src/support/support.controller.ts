import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { createTicketSchema, ticketReplySchema } from "@freshcut/shared";
import type { ZodTypeAny, z } from "zod";
import { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";
import { SupportService } from "./support.service";

function parse<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return r.data;
}

/** Customer-facing support: their tickets, the thread, replies and wallet. */
@Controller("support")
export class SupportController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly support: SupportService,
  ) {}

  @Get("tickets")
  async tickets(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.support.myTickets(user.id);
  }

  @Post("tickets")
  async create(@Headers("authorization") auth: string | undefined, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    return this.support.createTicket(user.id, parse(createTicketSchema, body));
  }

  @Get("tickets/:id")
  async thread(@Headers("authorization") auth: string | undefined, @Param("id") id: string) {
    const user = await requireUser(this.supabase, auth);
    return this.support.thread(user.id, id);
  }

  @Post("tickets/:id/reply")
  async reply(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const user = await requireUser(this.supabase, auth);
    const v = parse(ticketReplySchema, body);
    return this.support.customerReply(user.id, id, v.body, v.photoBase64);
  }

  @Get("wallet")
  async wallet(@Headers("authorization") auth: string | undefined) {
    const user = await requireUser(this.supabase, auth);
    return this.support.wallet(user.id);
  }
}
