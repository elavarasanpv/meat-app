import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import rider from "@freshcut/assets/images/icon-rider.png";
import goat from "@freshcut/assets/images/animal-goat.png";
import hen from "@freshcut/assets/images/animal-country-hen.png";

const SLIDES = [
  { text: "Fresh meat, cut your way — at the door in minutes.", img: rider, alt: "Delivery rider", mask: true },
  { text: "Every order weighed on the scale, with the photo to prove it.", img: goat, alt: "Goat" },
  { text: "Country chicken, mutton and eggs from shops next door.", img: hen, alt: "Country hen" },
];

/** Split sign-in: warm panel with the brand story on the left, the form on the right. */
export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4500);
    return () => clearInterval(h);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setError("Wrong email or password.");
    else nav("/", { replace: true });
  }

  const field =
    "mt-1 w-full border-0 border-b-2 border-line bg-transparent px-1 py-2.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-primary";

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_-10%_-10%,#ffb48a_0%,transparent_60%),radial-gradient(900px_500px_at_110%_110%,#ff9e6b_0%,transparent_55%),linear-gradient(135deg,#f58a3a,#e4461f)] p-3 md:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-6xl overflow-hidden rounded-[28px] bg-surface shadow-2xl md:min-h-[calc(100vh-3rem)] md:grid-cols-2">
        {/* Story panel */}
        <div className="relative hidden bg-[linear-gradient(160deg,#f7a65e_0%,#ee6a35_55%,#e4461f_100%)] p-8 md:block">
          <div className="flex h-full flex-col rounded-3xl border border-white/30 bg-white/15 p-8 backdrop-blur-md">
            <p className="text-3xl font-extrabold leading-tight text-white drop-shadow-sm">{SLIDES[slide].text}</p>
            <div className="relative mt-auto flex items-end justify-center">
              <img
                src={SLIDES[slide].img}
                alt={SLIDES[slide].alt}
                className={`h-[300px] w-auto object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.25)] ${SLIDES[slide].mask ? "brightness-0 invert" : ""}`}
              />
            </div>
            <div className="mt-8 flex gap-2">
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} className={`h-2 rounded-full bg-white transition-all ${i === slide ? "w-10" : "w-2 opacity-60"}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="flex items-center justify-center p-8 md:p-12">
          <form onSubmit={submit} className="w-full max-w-sm">
            <h1 className="text-center text-4xl font-extrabold tracking-tight">Welcome!</h1>
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-extrabold text-white">F</div>
              <span className="text-xl font-bold">FreshCut</span>
              <span className="rounded-full bg-tint px-2 py-0.5 text-xs font-bold text-primary">Admin</span>
            </div>

            <label className="mt-10 block text-sm text-muted">Email</label>
            <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
            <label className="mt-6 block text-sm text-muted">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} placeholder="••••••••" />

            {error && <div className="mt-4 rounded-xl bg-tint px-4 py-2 text-sm font-bold text-bad">{error}</div>}

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="mt-8 w-full rounded-full bg-primary py-3.5 font-extrabold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark disabled:bg-surface-2 disabled:text-muted disabled:shadow-none"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="mt-6 text-center text-xs text-muted">
              Admin access is by invitation only. <span className="underline decoration-dotted">Privacy</span> · <span className="underline decoration-dotted">Terms</span>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
