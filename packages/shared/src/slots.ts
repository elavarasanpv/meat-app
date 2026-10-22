import { SLOT_LEAD_MINUTES, SLOT_WINDOWS } from "./constants";

const IST_OFFSET_MIN = 330;

export type DeliverySlot = {
  startsAt: string; // ISO
  endsAt: string;   // ISO
  /** "today" | "tomorrow" */
  day: "today" | "tomorrow";
  /** e.g. "5–7 PM" */
  label: string;
};

function hourLabel(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

/** UTC timestamp for an IST wall-clock hour on a given IST calendar day. */
function istDateAt(istYear: number, istMonth: number, istDay: number, hour: number): Date {
  return new Date(Date.UTC(istYear, istMonth - 1, istDay, hour, 0) - IST_OFFSET_MIN * 60_000);
}

/** Upcoming delivery windows for today and tomorrow (IST), skipping ones too close to now. */
export function upcomingSlots(now: Date = new Date()): DeliverySlot[] {
  // IST calendar date for "now"
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1;
  const d = ist.getUTCDate();
  const cutoff = now.getTime() + SLOT_LEAD_MINUTES * 60_000;

  const out: DeliverySlot[] = [];
  for (const [dayOffset, day] of [[0, "today"], [1, "tomorrow"]] as const) {
    for (const [sh, eh] of SLOT_WINDOWS) {
      const start = istDateAt(y, m, d + dayOffset, sh);
      const end = istDateAt(y, m, d + dayOffset, eh);
      if (start.getTime() < cutoff) continue;
      out.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        day,
        label: `${hourLabel(sh)} – ${hourLabel(eh)}`.replace(" AM –", " –").replace(" PM – ", " – "),
      });
    }
  }
  return out;
}
