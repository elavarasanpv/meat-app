const IST_OFFSET_MIN = 330;

function istParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

function hour12(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h >= 12 ? "PM" : "AM"}`;
}

/** "Today" | "Tomorrow" | "22 Oct" for an ISO timestamp, in IST. */
export function dayLabel(iso: string, t: { today: string; tomorrow: string }): string {
  const a = istParts(iso);
  const now = istParts(new Date().toISOString());
  const dayNum = (p: { y: number; m: number; d: number }) => Date.UTC(p.y, p.m, p.d) / 86_400_000;
  const diff = dayNum(a) - dayNum(now);
  if (diff === 0) return t.today;
  if (diff === 1) return t.tomorrow;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** "5 – 7 PM" for a slot's start/end (IST). */
export function slotWindow(startsAt: string, endsAt: string): string {
  const s = istParts(startsAt).h;
  const e = istParts(endsAt).h;
  const sameHalf = (s >= 12) === (e >= 12);
  const sLabel = sameHalf ? String(s % 12 === 0 ? 12 : s % 12) : hour12(s);
  return `${sLabel} – ${hour12(e)}`;
}

/** "22 Oct, 4:12 PM" in IST. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
