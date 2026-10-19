import { Injectable } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService {
  /** service_role client — bypasses RLS; use only inside validated API logic. */
  readonly admin: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
    this.admin = createClient(url, key, { auth: { persistSession: false } });
  }

  /** Resolve the calling user from a Bearer token (used by auth guard). */
  async userFromToken(token: string) {
    const { data, error } = await this.admin.auth.getUser(token);
    if (error) return null;
    return data.user;
  }
}
