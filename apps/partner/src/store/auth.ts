import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  ready: boolean;
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
    await supabase.auth.signOut();
  },
}));
