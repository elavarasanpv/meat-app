import { Controller, Get, Headers } from "@nestjs/common";
import { SupabaseService } from "../supabase.service";
import { AdminService } from "./admin.service";
import { requireAdmin } from "./admin.guard";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly admin: AdminService,
  ) {}

  /** GET /admin/dashboard — today's numbers, 7-day series, recent orders, who's on duty. */
  @Get("dashboard")
  async dashboard(@Headers("authorization") auth: string | undefined) {
    await requireAdmin(this.supabase, auth);
    return this.admin.dashboard();
  }

  /** GET /admin/me — 200 with the admin's identity, or 403 for everyone else. */
  @Get("me")
  async me(@Headers("authorization") auth: string | undefined) {
    const user = await requireAdmin(this.supabase, auth);
    return this.admin.me(user.id, user.email);
  }
}
