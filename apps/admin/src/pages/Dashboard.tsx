import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AdminMe } from "../auth/Gate";
import { api } from "../lib/api";
import { PageHeader, displayName } from "../shell/Shell";
import { FlowChart, Sparkline } from "../ui/charts";
import { IconArrowUp, IconCheck, IconClock, IconMap, IconOrders, IconRider, IconShop, IconX } from "../ui/icons";

type Dashboard = {
  today: { orders: number; sales: number; cost: number; margin: number; ordersVsYesterday: number | null; salesVsYesterday: number | null };
  days: { date: string; orders: number; sales: number; cost: number; margin: number }[];
  stage: Record<string, number>;
  attention: { late: number; unassigned: number };
  onDuty: { ridersOnline: number; riders: number; shopsOpen: number; shops: number; cashOutstanding: number; cashByRider: { id: string; name: string; cash: number }[] };
  recent: { id: string; displayId: string; status: string; amount: number; createdAt: string; customer: string | null; shop: string | null }[];
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${DAY[d.getDay()]}`;
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" }> = {
  PLACED: { label: "Placed", tone: "info" },
  DEALER_ASSIGNED: { label: "Offered to shop", tone: "warn" },
  ACCEPTED: { label: "Preparing", tone: "info" },
  PACKING: { label: "Cutting", tone: "warn" },
  PACKED: { label: "Packed", tone: "ok" },
  RIDER_ASSIGNED: { label: "Rider assigned", tone: "info" },
  PICKED_UP: { label: "Picked up", tone: "info" },
  OUT_FOR_DELIVERY: { label: "On the way", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
  DELIVERY_FAILED: { label: "Delivery failed", tone: "bad" },
  RETURNED: { label: "Returned", tone: "bad" },
  REFUNDED: { label: "Refunded", tone: "bad" },
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Dashboard() {
  const me = useOutletContext<AdminMe>();
  const q = useQuery<Dashboard>({ queryKey: ["admin", "dashboard"], queryFn: () => api("/admin/dashboard"), refetchInterval: 30_000 });
  const d = q.data;
  const days = d?.days ?? [];
  const active = d ? Object.values(d.stage).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="pb-8">
      <PageHeader title={<>Hello {displayName(me).split(" ")[0]} 👋</>} sub={`${greeting()} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`} />

      {q.isError && <div className="mx-5 mt-6 rounded-2xl bg-tint p-4 font-bold text-bad md:mx-8">Couldn't load the dashboard. {String((q.error as Error).message)}</div>}

      <div className="grid gap-5 px-5 pt-6 md:px-8 xl:grid-cols-[1fr_360px]">
        {/* ── Left column ── */}
        <div className="min-w-0 space-y-6">
          {/* Hero card */}
          <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white/70">Sales today</div>
                <div className="mt-2 text-4xl font-extrabold tracking-tight md:text-5xl">{d ? inr(d.today.sales) : "—"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-white/10 px-2.5 py-1 font-bold">{d?.today.orders ?? 0} orders</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 font-bold">Margin {d ? inr(d.today.margin) : "—"}</span>
                  {d?.today.salesVsYesterday != null && (
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-bold ${d.today.salesVsYesterday >= 0 ? "bg-ok/25 text-emerald-300" : "bg-bad/30 text-orange-200"}`}>
                      <IconArrowUp size={14} className={d.today.salesVsYesterday < 0 ? "rotate-180" : ""} />
                      {Math.abs(d.today.salesVsYesterday)}% vs yesterday
                    </span>
                  )}
                </div>
              </div>
              <div className="hidden sm:block">
                <Sparkline values={days.map((x) => x.sales)} color="#5DCAA5" width={150} height={56} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/orders" className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-ink hover:bg-tint">
                <IconOrders size={18} /> {active} live order{active === 1 ? "" : "s"}
              </Link>
              <Link to="/riders" className="flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-white/10">
                <IconMap size={18} /> Live map
              </Link>
            </div>
            {d && (d.attention.late > 0 || d.attention.unassigned > 0) && (
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                {d.attention.unassigned > 0 && (
                  <Link to="/orders" className="rounded-full bg-primary px-3 py-1.5 font-bold">⚠ {d.attention.unassigned} order{d.attention.unassigned > 1 ? "s" : ""} no shop accepted</Link>
                )}
                {d.attention.late > 0 && (
                  <Link to="/orders" className="rounded-full bg-warn px-3 py-1.5 font-bold">⏰ {d.attention.late} running late</Link>
                )}
              </div>
            )}
          </section>

          {/* Stat tiles */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Last 7 days</h2>
              <span className="text-sm text-muted">Indian days · live</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Tile label="Orders" value={String(days.reduce((s, x) => s + x.orders, 0))} delta={d?.today.ordersVsYesterday ?? null} color="#1E8A4F" bg="bg-ok-bg" values={days.map((x) => x.orders)} />
              <Tile label="Shop cost" value={inr(days.reduce((s, x) => s + x.cost, 0))} delta={null} color="#B4620A" bg="bg-warn-bg" values={days.map((x) => x.cost)} />
              <Tile label="Your margin" value={inr(days.reduce((s, x) => s + x.margin, 0))} delta={null} color="#2F6FD1" bg="bg-[#DFEAFB]" values={days.map((x) => x.margin)} />
            </div>
          </section>

          {/* Flow chart */}
          <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <h2 className="text-lg font-extrabold">Order flow</h2>
              <Legend color="#1C1715" label="Sales" />
              <Legend color="#E4461F" label="Margin" dashed />
            </div>
            {days.length ? (
              <FlowChart
                labels={days.map((x) => dayLabel(x.date))}
                series={[
                  { name: "Sales", values: days.map((x) => x.sales), color: "#1C1715", format: inr },
                  { name: "Margin", values: days.map((x) => x.margin), color: "#E4461F", dashed: true, format: inr },
                ]}
              />
            ) : (
              <div className="h-[220px] animate-pulse rounded-2xl bg-surface-2" />
            )}
          </section>

          {/* Stage strip */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-line bg-surface p-5">
              <h3 className="font-extrabold">Live orders by stage</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {d && Object.entries(d.stage).length ? (
                  Object.entries(d.stage).map(([s, n]) => (
                    <span key={s} className={`rounded-full px-3 py-1.5 text-sm font-bold ${toneClass(STATUS[s]?.tone ?? "info")}`}>
                      {STATUS[s]?.label ?? s} · {n}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted">Nothing in progress right now.</span>
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-5">
              <h3 className="font-extrabold">Cash with riders</h3>
              <div className="mt-1 text-2xl font-extrabold text-primary">{d ? inr(d.onDuty.cashOutstanding) : "—"}</div>
              <div className="mt-2 space-y-1 text-sm">
                {d?.onDuty.cashByRider.map((r) => (
                  <div key={r.id} className="flex justify-between"><span className="text-muted">{r.name}</span><span className="font-bold">{inr(r.cash)}</span></div>
                ))}
                {d && !d.onDuty.cashByRider.length && <span className="text-muted">All handed over.</span>}
              </div>
            </div>
          </section>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Recent orders</h2>
              <Link to="/orders" className="text-sm font-bold text-primary">View all</Link>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {(d?.recent ?? []).map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, tone: "info" as const };
                return (
                  <li key={o.id} className="flex items-center gap-3 py-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass(st.tone)}`}>
                      {st.tone === "ok" ? <IconCheck size={18} /> : st.tone === "bad" ? <IconX size={18} /> : <IconClock size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{o.customer ?? o.displayId}</div>
                      <div className="truncate text-xs text-muted">{o.displayId} · {st.label} · {when(o.createdAt)}</div>
                    </div>
                    <div className="font-extrabold">{inr(o.amount)}</div>
                  </li>
                );
              })}
              {d && !d.recent.length && <li className="py-6 text-center text-sm text-muted">No orders yet.</li>}
            </ul>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">On duty</h2>
              <Link to="/riders" className="text-sm font-bold text-primary">View all</Link>
            </div>
            <div className="mt-3 space-y-3">
              <DutyCard icon={<IconRider size={22} />} label="Riders online" value={d ? `${d.onDuty.ridersOnline} / ${d.onDuty.riders}` : "—"} bg="bg-ok-bg" fg="text-ok" />
              <DutyCard icon={<IconShop size={22} />} label="Shops open" value={d ? `${d.onDuty.shopsOpen} / ${d.onDuty.shops}` : "—"} bg="bg-tint" fg="text-primary" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function toneClass(t: "ok" | "warn" | "bad" | "info") {
  return t === "ok" ? "bg-ok-bg text-ok" : t === "warn" ? "bg-warn-bg text-warn" : t === "bad" ? "bg-tint text-bad" : "bg-[#DFEAFB] text-[#2F6FD1]";
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted">
      <span className="inline-block h-0 w-6 border-t-[3px]" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />
      {label}
    </span>
  );
}

function Tile({ label, value, delta, color, bg, values }: { label: string; value: string; delta: number | null; color: string; bg: string; values: number[] }) {
  return (
    <div className={`rounded-3xl p-5 ${bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-muted">{label}</span>
        <span className="text-muted">⋮</span>
      </div>
      <div className="mt-2 -mb-1">
        <Sparkline values={values} color={color} width={140} height={44} />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-extrabold">{value}</span>
        {delta != null && (
          <span className={`mb-1 flex items-center gap-0.5 text-xs font-bold ${delta >= 0 ? "text-ok" : "text-bad"}`}>
            <IconArrowUp size={12} className={delta < 0 ? "rotate-180" : ""} />{Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}

function DutyCard({ icon, label, value, bg, fg }: { icon: React.ReactNode; label: string; value: string; bg: string; fg: string }) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl p-4 ${bg}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-surface ${fg}`}>{icon}</div>
      <div className="flex-1">
        <div className="text-sm text-muted">{label}</div>
        <div className="text-xl font-extrabold">{value}</div>
      </div>
    </div>
  );
}
