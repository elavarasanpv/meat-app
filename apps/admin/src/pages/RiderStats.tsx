import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Bars } from "../ui/charts";
import { Empty, ErrorBox, Section, Segments, clock, inr, when } from "../ui/kit";

type Stats = {
  id: string;
  name: string;
  since: string;
  lateAfterMin: number;
  offers: { responded: number; accepted: number; declined: number; lost: number; acceptRate: number | null; avgGrabSecs: number | null };
  deliveries: { delivered: number; failed: number; returned: number; reordered: number; late: number; onTimePct: number | null; successPct: number | null; typicalMin: number | null; slowestMin: number | null; failReasons: Record<string, number> };
  work: { trips: number; km: number; onlineHours: number; cashCollected: number; cashInHand: number; handovers: number; mismatches: number };
  days: { date: string; delivered: number; failed: number; km: number }[];
  trips: { id: string; startedAt: string; endedAt: string | null; km: number | null; shop: string | null; stops: { orderId: string; displayId: string; outcome: "delivered" | "failed" | "returned" | "open"; minutes: number | null; reordered: boolean }[] }[];
};

const REASON: Record<string, string> = { no_answer: "Customer didn't answer", refused: "Customer refused", wrong_address: "Wrong address", other: "Other" };
const pct = (p: number | null) => (p == null ? "—" : `${p}%`);
const mins = (m: number | null) => (m == null ? "—" : m < 1 ? "under 1 min" : `${m} min`);
const secs = (s: number | null) => (s == null ? "—" : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);
const tone = (p: number | null, good: number, ok: number) => (p == null ? "text-muted" : p >= good ? "text-ok" : p >= ok ? "text-warn" : "text-bad");
const OUTCOME = {
  delivered: "bg-ok-bg text-ok",
  failed: "bg-[#FBEAF0] text-[#B23A5C]",
  returned: "bg-[#EDEAE6] text-muted",
  open: "bg-[#DFEAFB] text-[#2F6FD1]",
} as const;

/** A rider's last 30 days: offers, delivery speed, failures, km, hours and cash. */
export function RiderStats({ id }: { id: string }) {
  const q = useQuery<Stats>({ queryKey: ["admin", "rider-stats", id], queryFn: () => api(`/admin/riders/${id}/stats`) });
  const [chart, setChart] = useState<"delivered" | "km">("delivered");
  const d = q.data;
  if (q.error) return <div className="p-5"><ErrorBox error={q.error} /></div>;
  if (!d) return <Empty>Loading…</Empty>;
  const labels = d.days.map((x, i, a) => (i === 0 || i === a.length - 1 || i % 7 === 0 ? String(Number(x.date.slice(8))) : ""));
  const reasons = Object.entries(d.deliveries.failReasons).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5 p-4 md:p-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Accepts offers" value={pct(d.offers.acceptRate)} valueCls={tone(d.offers.acceptRate, 80, 60)} hint={`${d.offers.accepted} taken · ${d.offers.declined} declined · grabs in ${secs(d.offers.avgGrabSecs)}`} cls="bg-[#DFEAFB]" />
        <Kpi label="On time" value={pct(d.deliveries.onTimePct)} valueCls={tone(d.deliveries.onTimePct, 90, 75)} hint={`${d.deliveries.late} over ${d.lateAfterMin} min from pickup`} cls="bg-[#DDF3E6]" />
        <Kpi label="Typical delivery" value={mins(d.deliveries.typicalMin)} hint={`pickup to door · slowest ${mins(d.deliveries.slowestMin)}`} cls="bg-[#FBEBD6]" />
        <Kpi label="Delivered first try" value={pct(d.deliveries.successPct)} valueCls={tone(d.deliveries.successPct, 95, 85)} hint={`${d.deliveries.delivered} delivered · ${d.deliveries.failed} failed`} cls="bg-[#E8E5FA]" />
      </div>

      <section className="rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-extrabold">{chart === "delivered" ? `${d.deliveries.delivered} deliveries` : `${d.work.km} km ridden`}</div>
            <div className="text-[11px] text-muted">per day, last 30 days</div>
          </div>
          <Segments value={chart} onChange={setChart} items={[{ id: "delivered", label: "Deliveries" }, { id: "km", label: "Km" }]} />
        </div>
        <Bars values={d.days.map((x) => (chart === "delivered" ? x.delivered : x.km))} labels={labels} color={chart === "delivered" ? "#E4461F" : "#5B4BC9"} height={110} format={(v) => (chart === "delivered" ? `${v} delivered` : `${v} km`)} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Offers">
          <div className="space-y-2 rounded-xl border border-line p-3">
            <Bar label="Accepted" n={d.offers.accepted} of={d.offers.responded} color="#1E8A4F" />
            <Bar label="Declined" n={d.offers.declined} of={d.offers.responded} color="#C62828" />
            <Bar label="Another rider was faster" n={d.offers.lost} of={d.offers.responded} color="#B4620A" />
            <div className="pt-1 text-[11px] text-muted">Offers the rider simply let pass aren't counted.</div>
          </div>
        </Section>
        <Section title="Deliveries">
          <div className="space-y-2 rounded-xl border border-line p-3">
            <Bar label="On time" n={d.deliveries.delivered - d.deliveries.late} of={d.deliveries.delivered} color="#1E8A4F" />
            <Bar label={`Late (over ${d.lateAfterMin} min)`} n={d.deliveries.late} of={d.deliveries.delivered} color="#B4620A" />
            <Bar label="Failed at the door" n={d.deliveries.failed} of={d.deliveries.delivered + d.deliveries.failed} color="#B23A5C" />
            <Bar label="Changed the stop order" n={d.deliveries.reordered} of={d.deliveries.delivered + d.deliveries.failed} color="#5B4BC9" />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Why deliveries failed">
          <div className="divide-y divide-line rounded-xl border border-line">
            {reasons.map(([r, n]) => (
              <div key={r} className="flex justify-between px-3 py-2 text-[12.5px]">
                <span>{REASON[r] ?? r}</span>
                <span className="font-extrabold">{n}</span>
              </div>
            ))}
            {!reasons.length && <Empty>No failed deliveries.</Empty>}
            {d.deliveries.returned > 0 && <div className="px-3 py-2 text-[11.5px] text-muted">{d.deliveries.returned} parcel{d.deliveries.returned > 1 ? "s" : ""} taken back to the shop.</div>}
          </div>
        </Section>
        <Section title="Work and cash">
          <div className="grid grid-cols-2 gap-2">
            <Mini label="Trips" value={String(d.work.trips)} />
            <Mini label="Online" value={`${d.work.onlineHours} h`} />
            <Mini label="Cash collected" value={inr(d.work.cashCollected)} />
            <Mini label="Cash in hand" value={inr(d.work.cashInHand)} accent={d.work.cashInHand > 0} />
            <Mini label="Hand-overs" value={String(d.work.handovers)} />
            <Mini label="Cash mismatches" value={String(d.work.mismatches)} bad={d.work.mismatches > 0} />
          </div>
        </Section>
      </div>

      <Section title={`Recent trips (${d.trips.length})`}>
        <div className="divide-y divide-line rounded-xl border border-line">
          {d.trips.map((t) => (
            <div key={t.id} className="px-3 py-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="font-extrabold">{when(t.startedAt)}</span>
                <span className="text-muted">
                  from {t.shop ?? "shop"} · {t.stops.length} stop{t.stops.length === 1 ? "" : "s"}
                  {t.km != null ? ` · ${t.km} km` : ""}
                  {t.endedAt ? ` · back ${clock(t.endedAt)}` : " · in progress"}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {t.stops.map((s) => (
                  <Link key={s.orderId} to={`/orders?filter=all&id=${s.orderId}`} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${OUTCOME[s.outcome]}`}>
                    {s.displayId}
                    {s.minutes != null && <span className={s.minutes > d.lateAfterMin ? "text-warn" : "opacity-70"}>· {mins(s.minutes)}</span>}
                    {s.outcome !== "delivered" && <span className="opacity-70">· {s.outcome}</span>}
                    {s.reordered && <span title="Rider changed the order of stops">↕</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {!d.trips.length && <Empty>No trips in the last 30 days.</Empty>}
        </div>
      </Section>
      <div className="text-[11px] text-muted">Riding with FreshCut since {new Date(d.since).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Delivery time runs from pickup at the shop to handover.</div>
    </div>
  );
}

function Kpi({ label, value, hint, cls, valueCls = "" }: { label: string; value: string; hint: string; cls: string; valueCls?: string }) {
  return (
    <div className={`rounded-xl p-3 ${cls}`}>
      <div className="text-[10.5px] font-bold text-muted">{label}</div>
      <div className={`text-[20px] font-extrabold leading-tight tabular-nums ${valueCls}`}>{value}</div>
      <div className="mt-0.5 text-[10.5px] text-muted">{hint}</div>
    </div>
  );
}
function Bar({ label, n, of, color }: { label: string; n: number; of: number; color: string }) {
  const w = of ? Math.max(n ? 3 : 0, (n / of) * 100) : 0;
  return (
    <div className="text-[12px]">
      <div className="mb-0.5 flex justify-between">
        <span>{label}</span>
        <span className="font-extrabold tabular-nums">
          {n}
          <span className="font-normal text-muted"> / {of}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}
function Mini({ label, value, accent, bad }: { label: string; value: string; accent?: boolean; bad?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2/70 px-3 py-2">
      <div className={`text-[14px] font-extrabold tabular-nums ${accent ? "text-primary" : bad ? "text-bad" : ""}`}>{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
    </div>
  );
}
