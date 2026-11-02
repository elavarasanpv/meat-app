import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconPhone, IconSearch } from "../ui/icons";
import { Btn, Chip, Drawer, Empty, ErrorBox, Field, Section, Segments, StatusChip, STATUS, inputCls, inr, when, clock, phone10 } from "../ui/kit";

type Row = {
  id: string;
  displayId: string;
  status: string;
  payment: string;
  amount: number;
  createdAt: string;
  readyBy: string | null;
  late: boolean;
  noShop: boolean;
  customer: string | null;
  customerPhone: string | null;
  pincode: string | null;
  shop: string | null;
  rider: string | null;
};
type Detail = {
  id: string;
  displayId: string;
  status: string;
  payment: string;
  paymentStatus: string;
  amount: number;
  cancelReason: string | null;
  createdAt: string;
  readyBy: string | null;
  customer: { name: string | null; phone: string | null };
  address: { address_text: string; landmark: string | null; pincode: string; lat: number | null; lng: number | null } | null;
  shop: { id: string; name: string; owner: string | null; phone: string | null } | null;
  rider: { id: string; name: string | null; phone: string | null; vehicle: string | null } | null;
  items: { id: string; name: string; unit: string; qty: number; cut: string; size: string | null; unavailable: boolean; price: number }[];
  timeline: { status: string; note: string | null; at: string; by: string | null }[];
  offers: { shop: string; offeredAt: string; respondedAt: string | null; outcome: string; reason: string | null }[];
  photos: { kind: string; at: string; url: string | null }[];
  can: { cancel: boolean; reassignShop: boolean; releaseRider: boolean };
};

const FILTERS = [
  { id: "active", label: "Active" },
  { id: "shop", label: "At shop" },
  { id: "delivery", label: "Delivery" },
  { id: "delivered", label: "Delivered" },
  { id: "problems", label: "Problems" },
  { id: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];
const PAY: Record<string, string> = { cod: "Cash", upi_on_delivery: "UPI at door", prepaid_upi: "Prepaid" };

export function Orders() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) ?? "active");
  const [q, setQ] = useState("");
  const openId = params.get("id");
  const list = useQuery<Row[]>({
    queryKey: ["admin", "orders", filter, q],
    queryFn: () => api(`/admin/orders?filter=${filter}&q=${encodeURIComponent(q)}`),
    refetchInterval: 20_000,
  });
  const open = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("id", id);
    else p.delete("id");
    setParams(p, { replace: true });
  };

  return (
    <div className="pb-6">
      <PageHeader title="Orders" sub="Every order, live. Tap one to see its timeline, photos and actions." />
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 md:px-6">
        <Segments value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ ...f }))} />
        <label className="ml-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-muted">
          <IconSearch size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order ID, e.g. FC-1024" className="w-44 bg-transparent text-[12.5px] outline-none" />
        </label>
      </div>

      <div className="px-4 pt-3 md:px-6">
        <div className="card overflow-hidden p-0">
          <ErrorBox error={list.error} />
          <div className="hidden grid-cols-[1.1fr_1.3fr_1.2fr_1fr_1fr_.8fr] gap-3 border-b border-line bg-surface-2/60 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-muted md:grid">
            <span>Order</span>
            <span>Customer</span>
            <span>Shop / rider</span>
            <span>Status</span>
            <span>Placed</span>
            <span className="text-right">Amount</span>
          </div>
          {list.data?.map((o) => (
            <button key={o.id} onClick={() => open(o.id)} className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5 text-left text-[12.5px] last:border-0 hover:bg-surface-2/50 md:grid-cols-[1.1fr_1.3fr_1.2fr_1fr_1fr_.8fr] md:items-center">
              <span className="font-extrabold">
                {o.displayId}
                {o.noShop && <span className="ml-1.5 chip bg-primary text-white">No shop</span>}
              </span>
              <span className="truncate text-muted md:text-ink">
                {o.customer ?? "Customer"} <span className="text-muted">· {o.pincode}</span>
              </span>
              <span className="hidden truncate md:block">
                {o.shop ?? <span className="text-muted">—</span>}
                {o.rider && <span className="text-muted"> · {o.rider}</span>}
              </span>
              <span>
                <StatusChip status={o.status} late={o.late} />
              </span>
              <span className="text-muted">{when(o.createdAt)}</span>
              <span className="text-right font-extrabold">{inr(o.amount)}</span>
            </button>
          ))}
          {list.data && !list.data.length && <Empty>No orders here.</Empty>}
          {list.isLoading && <Empty>Loading…</Empty>}
        </div>
      </div>
      {openId && <OrderDrawer id={openId} onClose={() => open(null)} />}
    </div>
  );
}

function OrderDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const d = useQuery<Detail>({ queryKey: ["admin", "order", id], queryFn: () => api(`/admin/orders/${id}`), refetchInterval: 15_000 });
  const shops = useQuery<{ id: string; name: string; isOpen: boolean; isActive: boolean; pincodes: string[] }[]>({
    queryKey: ["admin", "shops"],
    queryFn: () => api("/admin/shops"),
    enabled: !!d.data?.can.reassignShop,
  });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [pickShop, setPickShop] = useState("");
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    setCancelling(false);
  };
  const cancel = useMutation({ mutationFn: () => api(`/admin/orders/${id}/cancel`, { method: "POST", body: { reason } }), onSuccess: done });
  const reassign = useMutation({ mutationFn: (dealerId?: string) => api(`/admin/orders/${id}/reassign-shop`, { method: "POST", body: dealerId ? { dealerId } : {} }), onSuccess: done });
  const release = useMutation({ mutationFn: () => api(`/admin/orders/${id}/release-rider`, { method: "POST" }), onSuccess: done });
  const o = d.data;

  return (
    <Drawer
      wide
      onClose={onClose}
      title={o ? <span className="flex items-center gap-2">{o.displayId} <StatusChip status={o.status} /></span> : "Order"}
      sub={o ? `${when(o.createdAt)} · ${PAY[o.payment] ?? o.payment} · ${inr(o.amount)}` : undefined}
      footer={
        o && (o.can.cancel || o.can.releaseRider) ? (
          <>
            {o.can.releaseRider && (
              <Btn busy={release.isPending} onClick={() => confirm("Take this order off the rider? It goes back on offer to nearby riders.") && release.mutate()}>
                Release rider
              </Btn>
            )}
            {o.can.cancel && !cancelling && (
              <Btn kind="danger" onClick={() => setCancelling(true)}>
                Cancel order
              </Btn>
            )}
          </>
        ) : undefined
      }
    >
      <ErrorBox error={d.error ?? cancel.error ?? reassign.error ?? release.error} />
      {!o ? (
        <Empty>Loading…</Empty>
      ) : (
        <div className="space-y-1">
          {cancelling && (
            <div className="mb-4 rounded-xl border border-bad/30 bg-tint/50 p-3">
              <Field label="Why is this order cancelled? The customer sees this.">
                <input autoFocus className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shop closed early, customer asked, …" />
              </Field>
              <div className="mt-2 flex justify-end gap-2">
                <Btn onClick={() => setCancelling(false)}>Keep order</Btn>
                <Btn kind="danger" disabled={reason.trim().length < 3} busy={cancel.isPending} onClick={() => cancel.mutate()}>
                  Cancel order
                </Btn>
              </div>
            </div>
          )}
          {o.cancelReason && <div className="mb-3 rounded-lg bg-tint px-3 py-2 text-[12px] text-bad">Cancelled: {o.cancelReason}</div>}

          <div className="grid gap-3 md:grid-cols-2">
            <Person title="Customer" name={o.customer.name} phone={o.customer.phone}>
              {o.address && (
                <div className="mt-1 text-[12px] text-muted">
                  {o.address.address_text}
                  {o.address.landmark ? `, near ${o.address.landmark}` : ""} · {o.address.pincode}
                  {o.address.lat != null && (
                    <a className="ml-1 font-bold text-primary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${o.address.lat},${o.address.lng}`}>
                      Map ↗
                    </a>
                  )}
                </div>
              )}
            </Person>
            <div className="space-y-3">
              <Person title="Shop" name={o.shop?.name ?? null} phone={o.shop?.phone ?? null} empty="No shop yet" />
              <Person title="Rider" name={o.rider?.name ?? null} phone={o.rider?.phone ?? null} extra={o.rider?.vehicle ?? undefined} empty="No rider yet" />
            </div>
          </div>

          {o.can.reassignShop && (
            <div className="mt-3 rounded-xl border border-line bg-surface p-3">
              <div className="text-[12px] font-bold">Move to another shop</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <select className={`${inputCls} flex-1`} value={pickShop} onChange={(e) => setPickShop(e.target.value)}>
                  <option value="">Next best shop (automatic)</option>
                  {shops.data
                    ?.filter((s) => s.isActive && s.id !== o.shop?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.isOpen ? "· open" : "· closed"} {o.address && !s.pincodes.includes(o.address.pincode) ? "· outside area" : ""}
                      </option>
                    ))}
                </select>
                <Btn kind="primary" busy={reassign.isPending} onClick={() => reassign.mutate(pickShop || undefined)}>
                  Offer
                </Btn>
              </div>
            </div>
          )}

          <Section title={`Items (${o.items.length})`}>
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              {o.items.map((i) => (
                <div key={i.id} className={`flex items-center gap-2 px-3 py-2 text-[12.5px] ${i.unavailable ? "opacity-50 line-through" : ""}`}>
                  <span className="flex-1">
                    <span className="font-bold">{i.name}</span> <span className="text-muted">· {i.cut}{i.size && i.size !== i.cut ? ` · ${i.size}` : ""}</span>
                  </span>
                  <span className="text-muted">
                    {i.qty} {i.unit === "piece" ? "pc" : i.unit} × {inr(i.price)}
                  </span>
                  <span className="w-16 text-right font-bold">{inr(i.qty * i.price)}</span>
                </div>
              ))}
            </div>
          </Section>

          {o.photos.some((p) => p.url) && (
            <Section title="Photos">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {o.photos.map((p, i) =>
                  p.url ? (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer" className="group relative overflow-hidden rounded-lg border border-line">
                      <img src={p.url} alt={p.kind} className="aspect-square w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-ink/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{p.kind}</span>
                    </a>
                  ) : null,
                )}
              </div>
            </Section>
          )}

          <Section title="Timeline">
            <ol className="relative ml-2 border-l-2 border-line pl-4">
              {o.timeline.map((t, i) => (
                <li key={i} className="mb-2.5 text-[12.5px]">
                  <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">{STATUS[t.status]?.label ?? t.status}</span>
                    <span className="text-muted">{clock(t.at)}</span>
                    {t.by && <span className="text-muted">· {t.by}</span>}
                  </div>
                  {t.note && <div className="text-[11.5px] text-muted">{t.note}</div>}
                </li>
              ))}
            </ol>
            {o.readyBy && <div className="text-[11.5px] text-muted">Shop promised it ready by {clock(o.readyBy)}.</div>}
          </Section>

          {o.offers.length > 0 && (
            <Section title="Shop offers">
              <div className="space-y-1">
                {o.offers.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1 font-bold">{a.shop}</span>
                    <span className="text-muted">{clock(a.offeredAt)}</span>
                    <Chip tone={a.outcome === "accepted" ? "ok" : a.outcome === "pending" ? "warn" : "bad"}>{a.outcome}</Chip>
                    {a.reason && <span className="text-muted">{a.reason}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Person({ title, name, phone, extra, empty, children }: { title: string; name: string | null; phone: string | null; extra?: string; empty?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">{title}</div>
      {name || phone ? (
        <div className="mt-0.5 flex items-center gap-2">
          <span className="flex-1 truncate text-[13px] font-bold">
            {name ?? "—"} {extra && <span className="font-normal text-muted">· {extra}</span>}
          </span>
          {phone && (
            <a href={`tel:+91${phone10(phone)}`} className="flex items-center gap-1 rounded-md bg-ok-bg px-2 py-0.5 text-[11.5px] font-bold text-ok">
              <IconPhone size={12} /> {phone10(phone)}
            </a>
          )}
        </div>
      ) : (
        <div className="mt-0.5 text-[12.5px] text-muted">{empty ?? "—"}</div>
      )}
      {children}
    </div>
  );
}
