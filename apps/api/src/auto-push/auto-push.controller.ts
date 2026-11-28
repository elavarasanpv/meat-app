import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import type { z } from "zod";
import { autoPushSchema, autoPushTestSchema } from "@thanjozmart/shared";
import { SupabaseService } from "../supabase.service";
import { requireAdmin } from "../admin/admin.guard";
import { AutoPushService } from "./auto-push.service";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}

/** The admin sets up the automatic customer pushes. */
@Controller("admin/auto-pushes")
export class AutoPushController {
  constructor(
    private readonly auto: AutoPushService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get()
  async list(@Headers("authorization") auth: string | undefined) {
    await requireAdmin(this.supabase, auth);
    return this.auto.list();
  }

  @Post(":kind")
  async save(@Headers("authorization") auth: string | undefined, @Param("kind") kind: string, @Body() body: unknown) {
    await requireAdmin(this.supabase, auth);
    return this.auto.save(kind, parse(autoPushSchema, body));
  }

  /** POST /admin/auto-pushes/:kind/test — the saved wording, to one phone number. */
  @Post(":kind/test")
  async test(@Headers("authorization") auth: string | undefined, @Param("kind") kind: string, @Body() body: unknown) {
    await requireAdmin(this.supabase, auth);
    return this.auto.test(kind, parse(autoPushTestSchema, body).phone);
  }
}
