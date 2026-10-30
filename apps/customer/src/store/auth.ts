import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  ready: boolean; // true once the stored session has been checked
  init: () => () => void;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  session: null,
  ready: false,
  init: () => {
    supabase.auth.getSession().then(({ data }) => set({ session: data.session, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => set({ session }));
    return () => data.subscription.unsubscribe();
  },
  signOut: async () => {
    // Stop delivery alerts on this phone for the account that's leaving.
    await import("@/lib/push").then((m) => m.unregisterPush()).catch(() => {});
    await supabase.auth.signOut();
    set({ session: null });
  },
}));

/** Indian mobile → E.164 (+91XXXXXXXXXX). Accepts 10 digits with optional 0/91 prefix. */
export function toE164India(input: string): string | null {
  const digits = input.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
