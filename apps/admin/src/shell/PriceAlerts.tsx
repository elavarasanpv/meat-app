import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAlerts, type Alert } from "../lib/alerts";
import { IconAlert, IconX } from "../ui/icons";

const SNOOZE_KEY = "tm.price-alerts.snooze";
const HEARD_KEY = "tm.price-alerts.heard";
const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/** Two short beeps, so a new price problem is heard even from another tab. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* no sound */
  }
}

/**
 * A bright strip on every page while a shop's counter (market) price is below
 * what we sell for or what we pay: it stays until the price is fixed (or is
 * hidden for an hour). A new problem also beeps and flashes the tab title.
 */
export function PriceAlertBanner() {
  const { alerts } = useAlerts();
  const risks = alerts.filter((a) => a.kind === "price_risk");
  const [snoozedTill, setSnoozedTill] = useState(() => Number(get(SNOOZE_KEY) ?? 0));
  const [open, setOpen] = useState(false);
  const ids = risks.map((r) => r.id).sort().join(",");
  const newest = useRef("");

  // Beep and flash the title when a problem appears that this browser has not heard yet.
  useEffect(() => {
    if (!risks.length) return;
    const heard = new Set((get(HEARD_KEY) ?? "").split(",").filter(Boolean));
    const fresh = risks.filter((r) => !heard.has(r.id));
    set(HEARD_KEY, risks.map((r) => r.id).join(","));
    if (!fresh.length || newest.current === ids) return;
    newest.current = ids;
    beep();
    setSnoozedTill(0);
    set(SNOOZE_KEY, "0");
  }, [ids]);
  useEffect(() => {
    if (!risks.length || Date.now() < snoozedTill) return;
    const base = document.title.replace(/^⚠ Price alert · /, "");
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `⚠ Price alert · ${base}` : base;
    }, 1200);
    return () => {
      clearInterval(t);
      document.title = base;
    };
  }, [ids, snoozedTill]);

  if (!risks.length || Date.now() < snoozedTill) return null;
  const urgent = risks.some((r) => r.severity === "urgent");
  const first = risks[0];
  const snooze = () => {
    const till = Date.now() + 3600_000;
    set(SNOOZE_KEY, String(till));
    setSnoozedTill(till);
  };

  return (
    <div className={`sticky top-[60px] z-20 border-b text-white shadow-lg ${urgent ? "border-[#8f2a14] bg-gradient-to-r from-[#B8361A] via-[#E4461F] to-[#F2803A]" : "border-[#8a4a07] bg-gradient-to-r from-[#B4620A] to-[#F2A33A]"}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 md:px-6">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40" />
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#B8361A]">
            <IconAlert size={17} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-extrabold leading-tight">
            {risks.length === 1 ? "Price alert: act now" : `${risks.length} price alerts: act now`}
          </div>
          <div className="text-[12.5px] font-semibold leading-snug text-white/95">
            {first.title}. {first.body}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {risks.length > 1 && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg bg-white/15 px-3 py-1.5 text-[12.5px] font-extrabold hover:bg-white/25">
              {open ? "Hide list" : `See all ${risks.length}`}
            </button>
          )}
          <Link to={first.link} className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-extrabold text-[#B8361A] shadow hover:bg-white/90">
            Fix price
          </Link>
          <button type="button" onClick={snooze} title="Hide for 1 hour" aria-label="Hide price alerts for 1 hour" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
            <IconX size={16} />
          </button>
        </div>
      </div>
      {open && risks.length > 1 && (
        <div className="space-y-1.5 px-4 pb-3 md:px-6">
          {risks.map((r: Alert) => (
            <Link key={r.id} to={r.link} onClick={() => setOpen(false)} className="block rounded-lg bg-white/12 px-3 py-2 text-[12.5px] hover:bg-white/20">
              <div className="font-extrabold">{r.title}</div>
              <div className="text-white/90">{r.body}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
