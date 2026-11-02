import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { api, ApiError } from "../lib/api";

export type AdminMe = { id: string; email: string; name: string | null; role: string };

export function useAdminMe() {
  return useQuery<AdminMe>({ queryKey: ["admin", "me"], queryFn: () => api("/admin/me"), retry: false });
}

/**
 * Only signed-in accounts on the admin allowlist get past this. A signed-in
 * non-admin sees a clear refusal with a sign-out, not a broken dashboard.
 */
export function Gate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <AdminCheck />;
}

function AdminCheck() {
  const me = useAdminMe();
  if (me.isLoading) return <Centered>Checking access…</Centered>;
  if (me.isError) {
    const denied = me.error instanceof ApiError && me.error.status === 403;
    return (
      <Centered>
        <div className="text-lg font-bold">{denied ? "This account is not an admin." : "Can't reach the server."}</div>
        <div className="mt-1 text-sm text-muted">{denied ? "Ask the owner to add your email." : "Check the API and try again."}</div>
        <div className="mt-4 flex gap-3 justify-center">
          {!denied && (
            <button onClick={() => me.refetch()} className="rounded-xl bg-primary px-4 py-2 font-bold text-white">
              Retry
            </button>
          )}
          <button onClick={() => void supabase.auth.signOut()} className="rounded-xl border border-line bg-surface px-4 py-2 font-bold">
            Sign out
          </button>
        </div>
      </Centered>
    );
  }
  return <Outlet context={me.data} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">{children}</div>
    </div>
  );
}
