import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Landing page of the invite link (…/set-password#token_hash=…). Verifies the
 * invite, then lets the new admin choose their own password — nobody else
 * ever sees or sends a password.
 */
export function SetPassword() {
  const nav = useNavigate();
  const [stage, setStage] = useState<"verifying" | "form" | "bad-link">("verifying");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const tokenHash = params.get("token_hash");
    const kind = params.get("type") === "recovery" ? "recovery" : "invite";
    (async () => {
      // Already signed in (e.g. Supabase redirect flow) → straight to the form.
      const { data } = await supabase.auth.getSession();
      if (data.session) return setStage("form");
      if (!tokenHash) return setStage("bad-link");
      const { error } = await supabase.auth.verifyOtp({ type: kind, token_hash: tokenHash });
      setStage(error ? "bad-link" : "form");
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("At least 8 characters.");
    if (password !== again) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else nav("/", { replace: true });
  }

  if (stage === "verifying") return <div className="flex min-h-screen items-center justify-center text-muted">Checking your invite…</div>;
  if (stage === "bad-link")
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <div className="text-lg font-bold">This invite link is invalid or has expired.</div>
          <div className="mt-1 text-sm text-muted">Ask the owner to send a fresh one.</div>
        </div>
      </div>
    );

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-line bg-surface p-8 shadow-sm">
        <div className="text-lg font-extrabold">Welcome to FreshCut Admin</div>
        <div className="mt-1 text-sm text-muted">Choose your password.</div>
        <label className="mt-6 block text-sm font-bold">New password</label>
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-primary"
        />
        <label className="mt-4 block text-sm font-bold">Repeat it</label>
        <input
          type="password"
          required
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-primary"
        />
        {error && <div className="mt-3 rounded-xl bg-tint px-4 py-2 text-sm font-bold text-bad">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-primary py-3 font-extrabold text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save & enter"}
        </button>
      </form>
    </div>
  );
}
