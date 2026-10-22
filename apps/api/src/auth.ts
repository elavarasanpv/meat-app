import { UnauthorizedException } from "@nestjs/common";
import type { SupabaseService } from "./supabase.service";

/** Resolve the calling user from an Authorization: Bearer <jwt> header, or throw 401. */
export async function requireUser(supabase: SupabaseService, authHeader: string | undefined) {
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new UnauthorizedException();
  const user = await supabase.userFromToken(token);
  if (!user) throw new UnauthorizedException();
  return user;
}
