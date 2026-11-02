import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Bars } from "../ui/charts";
import { IconEdit, IconPhone } from "../ui/icons";
import { Chip, Empty, ErrorBox, Modal, Section, Segments, StatusChip, inr, phone10, when } from "../ui/kit";

type Stats = {
  id: string;
  name: string;
  owner: string | null;
  phone: string | null;
  isActive: boolean;
  isOpen: boolean;
  since: string;
  pincodes: string[];
  totals: { orders: number; delivered: number; cancelled: number; failed: number; sales: number; paidToShop: number; margin: number };
  offers: { offered: number; accepted: number; declined: number; missed: number; acceptRate: number | null; avgAcceptSecs: number | null };
  prep: { avgMinutes: number | null; fastest: number | null; slowest: number | null; onTimePct: number | null; counted: number };
  days: { date: string; orders: number; sales: number }[];
  topProducts: { name: string; unit: string; qty: number; orders: number }[];
  recent: { id: string; displayId: string; status: string; amount: number; createdAt: string; customer: string | null; items: number }[];
};

const secs = (s: number | null) => (s == null ? "—" : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);
const mins = (m: number | null) => (m == null ? "—" : m < 1 ? "under 1 min" : m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`);
const pct = (p: number | null) => (p == null ? "—" : `${p}%`);
const tone = (p: number | null, good: number, ok: number) => (p == null ? "text-muted" : p >= good ? "text-ok" : p >= ok ? "text-warn" : "text-bad");

/** One shop's last 30 days: speed, reliability, money, products and orders. */
export function ShopDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  const q = useQuery<Stats>({ queryKey: ["admin", "shop-stats", id], queryFn: () => api(`/admin/shops/${id}/stats`) });
  const [chart, setChart] = useState<"orders" | "sales">("orders");
  const d = q.data;
  const labels = (d?.days ?? []).map((x, i, a) => (i === 0 || i === a.length - 1 || i % 7 === 0 ? String(Number(x.date.slice(8))) : ""));

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {d?.name ?? "Shop"}
          {d && (!d.isActive ? <Chip tone="mute">Inactive</Chip> : d.isOpen ? <Chip tone="ok">Open</Chip> : <Chip tone="bad">Closed</Chip>)}
        </span>
      }
      sub={d ? `${d.owner ?? "Owner"} · ${phone10(d.phone)} · delivers to ${d.pincodes.join(", ") || "no pincodes"} · last 30 days` : "Loading…"}
      aside={
        <div className="hidden gap-1.5 sm:flex">
          {d?.phone && (
            <a href={`tel:+91${phone10(d.phone)}`} aria-label="Call" title="Call" className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:border-primary hover:text-primary">
              <IconPhone size={14} />
            </a>
          )}
          <button onClick={onEdit} aria-label="Edit" title="Edit shop" className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:border-primary hover:text-primary">
            <IconEdit size={14} />
          </button>
        </div>
      }
    >
      <div className="space-y-5 p-4 md:p-5">
        <ErrorBox error={q.error} />
        {!d && !q.error && <Empty>Loading…</Empty>}
        {d && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Kpi label="Typical cutting time" value={mins(d.prep.avgMinutes)} hint={d.prep.counted ? `fastest ${mins(d.prep.fastest)} · slowest ${mins(d.prep.slowest)}` : "no packed orders yet"} cls="bg-[#FBEBD6]" />
              <Kpi label="Ready on time" value={pct(d.prep.onTimePct)} valueCls={tone(d.prep.onTimePct, 90, 70)} hint="packed by the time they promised" cls="bg-[#DDF3E6]" />
              <Kpi label="Accepts orders" value={pct(d.offers.acceptRate)} valueCls={tone(d.offers.acceptRate, 90, 70)} hint={`${d.offers.accepted} of ${d.offers.offered} offers · avg ${secs(d.offers.avgAcceptSecs)}`} cls="bg-[#DFEAFB]" />
              <Kpi label="Your margin" value={inr(d.totals.margin)} hint={`on ${inr(d.totals.sales)} delivered`} cls="bg-[#E8E5FA]" />
            </div>

            <section className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-extrabold">{chart === "orders" ? `${d.totals.orders} orders` : `${inr(d.totals.sales)} delivered`}</div>
                  <div className="text-[11px] text-muted">per day, last 30 days</div>
                </div>
                <Segments value={chart} onChange={setChart} items={[{ id: "orders", label: "Orders" }, { id: "sales", label: "Sales" }]} />
              </div>
              <Bars values={d.days.map((x) => (chart === "orders" ? x.orders : x.sales))} labels={labels} color={chart === "orders" ? "#E4461F" : "#1E8A4F"} height={120} format={(v) => (chart === "orders" ? `${v} orders` : inr(v))} />
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Outcomes">
                <div className="space-y-2 rounded-xl border border-line p-3">
                  <Bar label="Delivered" n={d.totals.delivered} of={d.totals.orders} color="#1E8A4F" />
                  <Bar label="Cancelled" n={d.totals.cancelled} of={d.totals.orders} color="#6E625B" />
                  <Bar label="Failed / returned" n={d.totals.failed} of={d.totals.orders} color="#B23A5C" />
                  <Bar label="Declined offers" n={d.offers.declined} of={d.offers.offered} color="#2F6FD1" />
                  <Bar label="Missed offers (no answer)" n={d.offers.missed} of={d.offers.offered} color="#B4620A" />
                </div>
              </Section>
              <Section title="Top products">
                <div className="divide-y divide-line rounded-xl border border-line">
                  {d.topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tint text-[10.5px] font-extrabold text-primary">{i + 1}</span>
                      <span className="flex-1 truncate font-bold">{p.name}</span>
                      <span className="text-muted">{p.orders} orders</span>
                      <span className="w-16 text-right font-extrabold tabular-nums">
                        {p.qty} {p.unit === "piece" ? "pc" : p.unit}
                      </span>
                    </div>
                  ))}
                  {!d.topProducts.length && <Empty>No orders yet.</Empty>}
                </div>
              </Section>
            </div>

            <Section title={`Recent orders (${d.recent.length})`} right={<Link to="/orders?filter=all" className="text-[11.5px] font-bold text-primary">All orders →</Link>}>
              <div className="divide-y divide-line rounded-xl border border-line">
                {d.recent.map((o) => (
                  <Link key={o.id} to={`/orders?filter=all&id=${o.id}`} className="flex items-center gap-3 px-3 py-2 text-[12.5px] hover:bg-surface-2/60">
                    <span className="w-28 shrink-0 font-extrabold">{o.displayId}</span>
                    <span className="hidden flex-1 truncate text-muted sm:block">
                      {o.customer ?? "Customer"} · {o.items} item{o.items === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto sm:ml-0">
                      <StatusChip status={o.status} />
                    </span>
                    <span className="hidden w-28 text-right text-[11.5px] text-muted md:block">{when(o.createdAt)}</span>
                    <span className="w-16 text-right font-extrabold tabular-nums">{inr(o.amount)}</span>
                  </Link>
                ))}
                {!d.recent.length && <Empty>No orders in the last 30 days.</Empty>}
              </div>
            </Section>
            <div className="text-[11px] text-muted">
              Paid to the shop for delivered orders: {inr(d.totals.paidToShop)}. Shop on FreshCut since {new Date(d.since).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
            </div>
          </>
        )}
      </div>
    </Modal>
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
