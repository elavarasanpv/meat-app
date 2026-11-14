import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AdminMe } from "../auth/Gate";
import { api } from "../lib/api";
import { PageHeader, displayName } from "../shell/Shell";
import { Bars, Donut, FlowChart } from "../ui/charts";
import { Chip, ago } from "../ui/kit";
import { IconArrowUp, IconCheck, IconClock, IconMap, IconRider, IconShop, IconX } from "../ui/icons";

type Order = { id: string; displayId: string; status: string; amount: number; createdAt: string; customer: string | null; shop: string | null };
type Dashboard = {
  today: { orders: number; sales: number; cost: number; margin: number; ordersVsYesterday: number | null; salesVsYesterday: number | null };
  days: { date: string; orders: number; sales: number; cost: number; margin: number }[];
  week: { delivered: number; failed: number; cancelled: number; open: number };
  stage: Record<string, number>;
  attention: { late: number; unassigned: number };
  onDuty: { ridersOnline: number; riders: number; shopsOpen: number; shops: number; cashOutstanding: number; cashByRider: { id: string; name: string; cash: number }[] };
  shops: { id: string; name: string; isOpen: boolean; todayOrders: number }[];
  active: (Order & { readyBy: string | null; rider: string | null })[];
  recent: Order[];
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const short = (n: number) => (n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `₹${Math.round(n)}`);
const DAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const dayLabel = (iso: string) => DAY[new Date(iso + "T00:00:00").getDay()];
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" }> = {
  PLACED: { label: "Placed", tone: "info" },
  DEALER_ASSIGNED: { label: "Offered", tone: "warn" },
  ACCEPTED: { label: "Preparing", tone: "info" },
  PACKING: { label: "Cutting", tone: "warn" },
  PACKED: { label: "Packed", tone: "ok" },
  RIDER_ASSIGNED: { label: "Rider assigned", tone: "info" },
  PICKED_UP: { label: "Picked up", tone: "info" },
  OUT_FOR_DELIVERY: { label: "On the way", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
  DELIVERY_FAILED: { label: "Failed", tone: "bad" },
  RETURNED: { label: "Returned", tone: "bad" },
  REFUNDED: { label: "Refunded", tone: "bad" },
};
const tone = (t: "ok" | "warn" | "bad" | "info") =>
  t === "ok" ? "bg-ok-bg text-ok" : t === "warn" ? "bg-warn-bg text-warn" : t === "bad" ? "bg-tint text-bad" : "bg-[#DFEAFB] text-[#2F6FD1]";

type PriceChange = { id: number; kind: "sell" | "shop"; product: string; pincode: string | null; shop: string | null; from: number | null; to: number; by: string | null; at: string; profitNow: number | null; marginPctNow: number | null };

export function Dashboard() {
  const me = useOutletContext<AdminMe>();
  const q = useQuery<Dashboard>({ queryKey: ["admin", "dashboard"], queryFn: () => api("/admin/dashboard"), refetchInterval: 30_000 });
  const priceChanges = useQuery<PriceChange[]>({ queryKey: ["admin", "price-history"], queryFn: () => api("/admin/pricing/history"), refetchInterval: 60_000 });
  const d = q.data;
  const days = d?.days ?? [];
  const weekOrders = days.reduce((s, x) => s + x.orders, 0);
  const weekSales = days.reduce((s, x) => s + x.sales, 0);
  const weekMargin = days.reduce((s, x) => s + x.margin, 0);
  const closed = d ? d.week.delivered + d.week.failed + d.week.cancelled : 0;
  const successPct = closed ? (d!.week.delivered / closed) * 100 : 0;
  const maxShop = Math.max(1, ...(d?.shops.map((s) => s.todayOrders) ?? [1]));

  return (
    <div className="pb-6">
      <PageHeader
        title={`Hello ${displayName(me).split(" ")[0]} 👋`}
        sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) + " · live, refreshes every 30 s"}
        actions={
          <Link to="/orders" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-bold hover:bg-surface-2">
            All orders →
          </Link>
        }
      />
      {q.isError && <div className="mx-4 mt-4 rounded-xl bg-tint p-3 text-[12px] font-bold text-bad md:mx-6">Couldn't load: {String((q.error as Error).message)}</div>}
      {d && (d.attention.unassigned > 0 || d.attention.late > 0) && (
        <div className="mx-4 mt-4 flex flex-wrap gap-2 md:mx-6">
          {d.attention.unassigned > 0 && <Link to="/orders" className="chip bg-primary text-white">⚠ {d.attention.unassigned} order{d.attention.unassigned > 1 ? "s" : ""} with no shop</Link>}
          {d.attention.late > 0 && <Link to="/orders" className="chip bg-warn text-white">⏰ {d.attention.late} running late</Link>}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-4 md:px-6 lg:grid-cols-3">
        {/* Row 1 */}
        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Orders this week</div><div className="card-sub">per day · Indian days</div></div>
            <span className="chip bg-surface-2 text-muted">7 days</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold">{weekOrders}</span>
            <Delta v={d?.today.ordersVsYesterday ?? null} suffix="today vs yesterday" />
          </div>
          <div className="mt-3">
            <Bars values={days.map((x) => x.orders)} labels={days.map((x) => dayLabel(x.date))} format={(v) => `${v} orders`} />
          </div>
        </section>

        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Delivery success</div><div className="card-sub">closed orders, last 7 days</div></div>
            <span className="chip bg-surface-2 text-muted">Weekly</span>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <Donut pct={successPct} label="delivered" />
            <div className="flex-1 space-y-1.5 text-[12px]">
              <Row dot="#1E8A4F" label="Delivered" value={d?.week.delivered ?? 0} />
              <Row dot="#B8361A" label="Failed / returned" value={d?.week.failed ?? 0} />
              <Row dot="#B4620A" label="Cancelled" value={d?.week.cancelled ?? 0} />
              <Row dot="#2F6FD1" label="Still open" value={d?.week.open ?? 0} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Shops today</div><div className="card-sub">orders handled · open now</div></div>
            <span className="chip bg-surface-2 text-muted">{d ? `${d.onDuty.shopsOpen}/${d.onDuty.shops} open` : "—"}</span>
          </div>
          <div className="mt-3 space-y-2">
            {(d?.shops ?? []).slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-[12px]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.isOpen ? "bg-ok" : "bg-line"}`} />
                <span className="w-28 truncate font-bold">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${(s.todayOrders / maxShop) * 100}%` }} />
                </div>
                <span className="w-6 text-right font-bold">{s.todayOrders}</span>
              </div>
            ))}
            {d && !d.shops.length && <div className="text-[12px] text-muted">No shops enrolled yet.</div>}
          </div>
        </section>

        {/* Row 2 */}
        <section className="card lg:col-span-2">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Live orders</div><div className="card-sub">everything between placed and delivered</div></div>
            <div className="flex flex-wrap justify-end gap-1">
              {d && Object.entries(d.stage).map(([s, n]) => (
                <span key={s} className={`chip ${tone(STATUS[s]?.tone ?? "info")}`}>{STATUS[s]?.label ?? s} {n}</span>
              ))}
            </div>
          </div>
          <div className="mt-3 divide-y divide-line">
            {(d?.active ?? []).slice(0, 8).map((o) => {
              const st = STATUS[o.status] ?? { label: o.status, tone: "info" as const };
              const late = o.readyBy && ["ACCEPTED", "PACKING"].includes(o.status) && new Date(o.readyBy).getTime() < Date.now();
              return (
                <Link key={o.id} to={`/orders?id=${o.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-[12px] hover:bg-surface-2/60">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{o.displayId} <span className="font-normal text-muted">· {o.customer ?? "Customer"}</span></div>
                    <div className="truncate text-[11px] text-muted">{o.shop ?? "No shop yet"}{o.rider ? ` · ${o.rider}` : ""} · {when(o.createdAt)}</div>
                  </div>
                  <span className={`chip ${late ? "bg-bad text-white" : tone(st.tone)}`}>{late ? "Late" : st.label}</span>
                  <span className="w-20 text-right text-[11px] text-muted">{o.readyBy ? `ready ${clock(o.readyBy)}` : "—"}</span>
                  <span className="w-16 text-right font-extrabold">{inr(o.amount)}</span>
                </Link>
              );
            })}
            {d && !d.active.length && <div className="py-6 text-center text-[12px] text-muted">Nothing in progress right now.</div>}
          </div>
        </section>

        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">On duty</div><div className="card-sub">right now</div></div>
            <Link to="/riders" className="chip bg-tint text-primary"><IconMap size={12} /> Live map</Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Mini icon={<IconRider size={18} />} label="Riders online" value={d ? `${d.onDuty.ridersOnline}/${d.onDuty.riders}` : "—"} cls="bg-ok-bg text-ok" />
            <Mini icon={<IconShop size={18} />} label="Shops open" value={d ? `${d.onDuty.shopsOpen}/${d.onDuty.shops}` : "—"} cls="bg-tint text-primary" />
          </div>
          <div className="mt-3 card-title text-[13px]">Cash with riders</div>
          <div className="text-xl font-extrabold text-primary">{d ? inr(d.onDuty.cashOutstanding) : "—"}</div>
          <div className="mt-1 space-y-1 text-[12px]">
            {d?.onDuty.cashByRider.map((r) => (
              <div key={r.id} className="flex justify-between"><span className="text-muted">{r.name}</span><span className="font-bold">{inr(r.cash)}</span></div>
            ))}
            {d && !d.onDuty.cashByRider.length && <span className="text-muted">All handed over.</span>}
          </div>
        </section>

        {/* Row 3 */}
        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Sales</div><div className="card-sub">last 7 days</div></div>
            <Link to="/cash" className="text-[11px] font-bold text-primary">See more</Link>
          </div>
          <div className="mt-2 text-2xl font-extrabold">{inr(weekSales)}</div>
          <div className="mt-2">
            <Bars values={days.map((x) => x.sales)} labels={days.map((x) => dayLabel(x.date))} color="#1E8A4F" height={90} format={short} />
          </div>
          <div className="mt-3 divide-y divide-line rounded-lg border border-line">
            {[["Shops", "/shops"], ["Riders", "/riders"], ["Cash hand-overs", "/cash"]].map(([l, to]) => (
              <Link key={to} to={to} className="flex items-center justify-between px-3 py-2 text-[12px] font-bold hover:bg-surface-2">{l}<span className="text-muted">›</span></Link>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Money overview</div><div className="card-sub">this week</div></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Money label="Sales" value={weekSales} cls="bg-[#FBF3D6]" />
            <Money label="Shop cost" value={weekSales - weekMargin} cls="bg-[#E3F3EA]" />
            <Money label="Your margin" value={weekMargin} cls="bg-[#E8E5FA]" />
            <Money label="Cash held" value={d?.onDuty.cashOutstanding ?? 0} cls="bg-[#FDE6DF]" />
          </div>
          <div className="mt-3 card-title text-[13px]">Recent activity</div>
          <div className="mt-1 divide-y divide-line">
            {(d?.recent ?? []).slice(0, 4).map((o) => {
              const st = STATUS[o.status] ?? { label: o.status, tone: "info" as const };
              const col = st.tone === "ok" ? "text-ok" : st.tone === "bad" ? "text-bad" : "text-warn";
              return (
                <div key={o.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                  <span className="w-24 truncate font-bold">{o.customer ?? o.displayId}</span>
                  <span className="flex-1 truncate text-muted">{o.displayId}</span>
                  <span className="text-muted">{when(o.createdAt)}</span>
                  <span className={`w-16 text-right font-bold ${col}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Price changes</div><div className="card-sub">selling and shop prices · latest first</div></div>
            <Link to="/pricing" className="text-[11px] font-bold text-primary">Pricing</Link>
          </div>
          <div className="mt-2 divide-y divide-line">
            {(priceChanges.data ?? []).slice(0, 6).map((c) => {
              const up = c.from != null && c.to > c.from;
              const dir = c.from == null ? "" : up ? "▲" : "▼";
              const dirCls = c.kind === "sell" ? (up ? "text-ok" : "text-bad") : up ? "text-bad" : "text-ok";
              return (
                <div key={c.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                  <Chip tone={c.kind === "sell" ? "info" : "warn"}>{c.kind === "sell" ? "Selling" : "Shop"}</Chip>
                  <span className="min-w-0 flex-1 truncate">
                    <b>{c.product}</b>
                    <span className="text-muted"> {c.kind === "sell" ? (c.pincode ? `· ${c.pincode}` : "· default") : c.shop ? `· ${c.shop}` : ""}</span>
                  </span>
                  <span className="whitespace-nowrap font-bold tabular-nums">
                    {c.from != null ? <span className="text-muted">₹{c.from} → </span> : null}₹{c.to} <span className={dirCls}>{dir}</span>
                  </span>
                  <span className="hidden w-24 whitespace-nowrap text-right text-[11px] text-muted sm:inline">
                    {c.profitNow != null ? `profit ₹${c.profitNow}` : ""}
                  </span>
                  <span className="w-14 whitespace-nowrap text-right text-[11px] text-muted">{ago(c.at)}</span>
                </div>
              );
            })}
            {priceChanges.data && !priceChanges.data.length && <div className="py-3 text-[12px] text-muted">No price changes yet. Set prices on the Pricing page.</div>}
          </div>
        </section>

        <section className="card">
          <div className="flex items-start justify-between">
            <div><div className="card-title">Sales vs margin</div><div className="card-sub">per day</div></div>
          </div>
          <div className="mt-2">
            {days.length ? (
              <FlowChart
                height={150}
                labels={days.map((x) => dayLabel(x.date))}
                series={[
                  { name: "Sales", values: days.map((x) => x.sales), color: "#1C1715", format: short },
                  { name: "Margin", values: days.map((x) => x.margin), color: "#E4461F", dashed: true, format: short },
                ]}
              />
            ) : (
              <div className="h-[150px] animate-pulse rounded-xl bg-surface-2" />
            )}
          </div>
          <div className="mt-2 divide-y divide-line">
            {(d?.recent ?? []).slice(0, 3).map((o) => {
              const st = STATUS[o.status] ?? { label: o.status, tone: "info" as const };
              return (
                <div key={o.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone(st.tone)}`}>
                    {st.tone === "ok" ? <IconCheck size={13} /> : st.tone === "bad" ? <IconX size={13} /> : <IconClock size={13} />}
                  </span>
                  <span className="flex-1 truncate">{o.displayId} · {st.label}</span>
                  <span className="font-bold">{inr(o.amount)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Delta({ v, suffix }: { v: number | null; suffix: string }) {
  if (v == null) return <span className="text-[11px] text-muted">{suffix}: no data</span>;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-bold ${v >= 0 ? "text-ok" : "text-bad"}`}>
      <IconArrowUp size={11} className={v < 0 ? "rotate-180" : ""} />{Math.abs(v)}% <span className="font-normal text-muted">{suffix}</span>
    </span>
  );
}
function Row({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      <span className="flex-1 text-muted">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
function Mini({ icon, label, value, cls }: { icon: React.ReactNode; label: string; value: string; cls: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl p-2.5 ${cls}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface">{icon}</div>
      <div className="leading-tight"><div className="text-[10.5px] opacity-80">{label}</div><div className="text-[15px] font-extrabold">{value}</div></div>
    </div>
  );
}
function Money({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl p-3 ${cls}`}>
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className="text-[17px] font-extrabold">{inr(value)}</div>
    </div>
  );
}
