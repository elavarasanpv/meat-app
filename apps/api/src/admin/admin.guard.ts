import { ForbiddenException } from "@nestjs/common";
import type { SupabaseService } from "../supabase.service";
import { requireUser } from "../auth";

export type AdminUser = { id: string; email: string };

/**
 * Every /admin request passes through this: a valid session whose email is on
 * the admin_emails allowlist. Anyone else gets 403, whatever their token.
 */
export async function requireAdmin(supabase: SupabaseService, authHeader: string | undefined): Promise<AdminUser> {
  const user = await requireUser(supabase, authHeader);
  const email = user.email?.toLowerCase();
  if (!email) throw new ForbiddenException("Admin access is by email account");
  const { data } = await supabase.admin.from("admin_emails").select("email").eq("email", email).maybeSingle();
  if (!data) throw new ForbiddenException("This account is not an admin");
  return { id: user.id, email };
}
