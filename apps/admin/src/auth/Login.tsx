import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/** Email + password sign-in. Only allowlisted emails pass the Gate afterwards. */
export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setError("Wrong email or password.");
    else nav("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-white">F</div>
          <div>
            <div className="text-lg font-extrabold leading-5">FreshCut Admin</div>
            <div className="text-xs text-muted">Owner &amp; staff only</div>
          </div>
        </div>
        <label className="mt-6 block text-sm font-bold">Email</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-primary"
          placeholder="you@example.com"
        />
        <label className="mt-4 block text-sm font-bold">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-primary"
          placeholder="••••••••"
        />
        {error && <div className="mt-3 rounded-xl bg-tint px-4 py-2 text-sm font-bold text-bad">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-primary py-3 font-extrabold text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="mt-4 text-center text-xs text-muted">New here? Open the invite link you were sent to set a password.</div>
      </form>
    </div>
  );
}
