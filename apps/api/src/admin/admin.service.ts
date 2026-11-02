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

  async me(adminId: string, email: string) {
    const { data: profile } = await this.supabase.admin.from("profiles").select("full_name, role").eq("id", adminId).maybeSingle();
    return { id: adminId, email, name: profile?.full_name ?? null, role: profile?.role ?? "admin" };
  }
}
