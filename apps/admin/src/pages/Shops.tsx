import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconEdit, IconPhone, IconPlus } from "../ui/icons";
import { MapPin, parseLatLng } from "../ui/MapPin";
import { ShopDetail } from "./ShopDetail";
import { TimePicker, formatTime } from "../ui/TimePicker";
import { Btn, Chip, Drawer, Empty, ErrorBox, Field, Section, inputCls, inr, phone10 } from "../ui/kit";

type Shop = {
  id: string;
  name: string;
  owner: string | null;
  phone: string | null;
  isActive: boolean;
  isOpen: boolean;
  closedUntil: string | null;
  hours: [string, string][];
  weeklyOff: number | null;
  hasPin: boolean;
  pincodes: string[];
  products: number;
  todayOrders: number;
  todaySales: number;
};
export type Catalog = {
  products: { id: string; name: string; nameTa: string | null; unit: string; sellingPrice: number; category: string; sub: string | null }[];
  pincodes: { pincode: string; area: string | null; lat: number | null; lng: number | null; zone: string | null }[];
};
type ShopDetail = {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string;
  fssaiNo: string | null;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
  openWindows: [string, string][];
  weeklyOff: number | null;
  pincodes: string[];
  products: { productId: string; pricePerKg: number | null }[];
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function Shops() {
  const shops = useQuery<Shop[]>({ queryKey: ["admin", "shops"], queryFn: () => api("/admin/shops"), refetchInterval: 30_000 });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <div className="pb-6">
      <PageHeader
        title="Shops"
        sub="Who sells, where they deliver, when they're open and what they're paid."
        actions={
          <Btn kind="primary" onClick={() => setEditing("new")}>
            <IconPlus size={14} /> Enrol shop
          </Btn>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 pt-4 md:grid-cols-2 md:px-6 xl:grid-cols-3">
        <div className="md:col-span-2 xl:col-span-3">
          <ErrorBox error={shops.error} />
        </div>
        {shops.data?.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => setViewing(s.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setViewing(s.id))}
            className={`card cursor-pointer outline-none transition hover:border-primary/40 hover:shadow-md focus-visible:border-primary ${s.isActive ? "" : "opacity-60"}`}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold">{s.name}</div>
                <div className="truncate text-[12px] text-muted">
                  {s.owner ?? "Owner"} · {phone10(s.phone)}
                </div>
              </div>
              {!s.isActive ? <Chip tone="mute">Inactive</Chip> : s.isOpen ? <Chip tone="ok">Open</Chip> : <Chip tone="bad">Closed</Chip>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Orders today" value={String(s.todayOrders)} />
              <Stat label="Delivered ₹" value={inr(s.todaySales)} />
              <Stat label="Products" value={String(s.products)} />
            </div>
            <div className="mt-3 space-y-1 text-[12px]">
              <div className="text-muted">
                <span className="font-bold text-ink">Hours</span> {s.hours.map((w) => `${formatTime(w[0])}–${formatTime(w[1])}`).join(", ")}
                {s.weeklyOff != null && ` · off ${DAYS[s.weeklyOff]}`}
              </div>
              <div className="flex flex-wrap gap-1">
                {s.pincodes.map((p) => (
                  <span key={p} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold">
                    {p}
                  </span>
                ))}
                {!s.pincodes.length && <span className="text-bad">No delivery pincodes, gets no orders</span>}
              </div>
              {!s.hasPin && <div className="font-bold text-warn">No map pin yet</div>}
            </div>
            <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Btn onClick={() => setEditing(s.id)}>
                <IconEdit size={13} /> Edit
              </Btn>
              {s.phone && (
                <a href={`tel:+91${phone10(s.phone)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold hover:bg-surface-2">
                  <IconPhone size={13} /> Call
                </a>
              )}
              <button onClick={() => setViewing(s.id)} className="ml-auto text-[12px] font-extrabold text-primary">
                View details →
              </button>
            </div>
          </div>
        ))}
        {shops.data && !shops.data.length && (
          <div className="card md:col-span-2 xl:col-span-3">
            <Empty>No shops yet. Enrol the first one.</Empty>
          </div>
        )}
      </div>
      {editing && <ShopForm id={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && <ShopDetail id={viewing} onClose={() => setViewing(null)} onEdit={() => (setViewing(null), setEditing(viewing))} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/70 px-2 py-1.5">
      <div className="text-[14px] font-extrabold">{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
    </div>
  );
}

type Form = {
  phone: string;
  ownerName: string;
  shopName: string;
  fssaiNo: string;
  pin: { lat: number; lng: number } | null;
  pincodes: string[];
  openWindows: [string, string][];
  weeklyOff: number | null;
  prices: Record<string, string>;
  isActive: boolean;
};
const blank: Form = { phone: "", ownerName: "", shopName: "", fssaiNo: "", pin: null, pincodes: [], openWindows: [["06:00", "13:00"], ["16:00", "20:00"]], weeklyOff: null, prices: {}, isActive: true };

function ShopForm({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const catalog = useQuery<Catalog>({ queryKey: ["admin", "catalog"], queryFn: () => api("/admin/catalog"), staleTime: 300_000 });
  const detail = useQuery<ShopDetail>({ queryKey: ["admin", "shop", id], queryFn: () => api(`/admin/shops/${id}`), enabled: !!id });
  const [form, setForm] = useState<Form | null>(id ? null : blank);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (id && detail.data && !form) {
    const d = detail.data;
    setForm({
      phone: d.phone,
      ownerName: d.ownerName,
      shopName: d.shopName,
      fssaiNo: d.fssaiNo ?? "",
      pin: d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null,
      pincodes: d.pincodes,
      openWindows: d.openWindows,
      weeklyOff: d.weeklyOff,
      prices: Object.fromEntries(d.products.map((p) => [p.productId, p.pricePerKg == null ? "" : String(p.pricePerKg)])),
      isActive: d.isActive,
    });
  }

  const groups = useMemo(() => {
    const m = new Map<string, Catalog["products"]>();
    for (const p of catalog.data?.products ?? []) {
      const k = p.sub ? `${p.category} · ${p.sub}` : p.category;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [catalog.data]);
  const center = useMemo(() => {
    const c = catalog.data?.pincodes.find((p) => p.lat != null);
    return c ? { lat: c.lat!, lng: c.lng! } : { lat: 8.2555, lng: 77.6655 };
  }, [catalog.data]);

  const save = useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>(id ? `/admin/shops/${id}` : "/admin/shops", { method: id ? "PATCH" : "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    },
  });

  if (!form) return <Drawer title="Edit shop" onClose={onClose}><ErrorBox error={detail.error} /><Empty>Loading…</Empty></Drawer>;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const chosen = Object.keys(form.prices);

  function submit() {
    setError(null);
    if (!/^[6-9]\d{9}$/.test(form!.phone.replace(/\D/g, "").slice(-10))) return setError("Enter the owner's 10-digit mobile number.");
    if (!form!.pin) return setError("Set the shop's location on the map.");
    if (!form!.pincodes.length) return setError("Pick at least one pincode the shop delivers to.");
    const products = Object.entries(form!.prices).map(([productId, v]) => ({ productId, pricePerKg: Number(v) }));
    if (products.some((p) => !(p.pricePerKg > 0))) return setError("Every ticked product needs the shop's price.");
    save.mutate({
      phone: form!.phone,
      ownerName: form!.ownerName,
      shopName: form!.shopName,
      fssaiNo: form!.fssaiNo || null,
      lat: form!.pin.lat,
      lng: form!.pin.lng,
      pincodes: form!.pincodes,
      openWindows: form!.openWindows,
      weeklyOff: form!.weeklyOff,
      products,
      isActive: form!.isActive,
    });
  }

  return (
    <Drawer
      wide
      title={id ? `Edit ${form.shopName || "shop"}` : "Enrol a shop"}
      sub="The owner signs in to the FreshCut Partner app with this mobile number (OTP)."
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto self-center text-[12px] font-bold text-bad">{error}</span>}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" busy={save.isPending} onClick={submit}>
            {id ? "Save changes" : "Enrol shop"}
          </Btn>
        </>
      }
    >
      <ErrorBox error={save.error} />
      <Section title="Shop and owner">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shop name">
            <input className={inputCls} value={form.shopName} onChange={(e) => set({ shopName: e.target.value })} placeholder="Murugan Chicken Centre" />
          </Field>
          <Field label="Owner name">
            <input className={inputCls} value={form.ownerName} onChange={(e) => set({ ownerName: e.target.value })} placeholder="Murugan" />
          </Field>
          <Field label="Owner mobile (login)" hint="10 digits. This is the Partner app login.">
            <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-primary">
              <span className="pl-2.5 text-[13px] text-muted">+91</span>
              <input className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "") })} placeholder="9876543210" />
            </div>
          </Field>
          <Field label="FSSAI number (optional)">
            <input className={inputCls} value={form.fssaiNo} onChange={(e) => set({ fssaiNo: e.target.value })} placeholder="12345678901234" />
          </Field>
        </div>
        {id && (
          <label className="mt-3 flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
            Active. Untick to stop all new orders to this shop.
          </label>
        )}
      </Section>

      <Section title="Location" right={form.pin && <span className="text-[11px] text-muted">{form.pin.lat}, {form.pin.lng}</span>}>
        <MapPin value={form.pin} center={center} onChange={(pin) => set({ pin })} />
        <div className="mt-2 flex gap-2">
          <input className={inputCls} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Or paste a Google Maps link / 8.2555, 77.6655" />
          <Btn
            onClick={() => {
              const p = parseLatLng(paste);
              if (p) {
                set({ pin: p });
                setPaste("");
                setError(null);
              } else setError("Couldn't read a location from that. Use a full maps link or 'lat, lng'.");
            }}
          >
            Use
          </Btn>
        </div>
        <div className="mt-1 text-[11px] text-muted">Tap the map or drag the pin onto the shop. Riders navigate here for pickup.</div>
      </Section>

      <Section title="Delivers to (pincodes)">
        <div className="flex flex-wrap gap-1.5">
          {catalog.data?.pincodes.map((p) => {
            const on = form.pincodes.includes(p.pincode);
            return (
              <button
                key={p.pincode}
                onClick={() => set({ pincodes: on ? form.pincodes.filter((x) => x !== p.pincode) : [...form.pincodes, p.pincode] })}
                className={`rounded-lg border px-2.5 py-1 text-[12px] font-bold transition ${on ? "border-primary bg-tint text-primary" : "border-line bg-surface text-muted hover:text-ink"}`}
              >
                {p.pincode} {p.area && <span className="font-normal">· {p.area}</span>}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Opening hours">
        <div className="space-y-2">
          {form.openWindows.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <TimePicker label="Opens at" value={w[0]} onChange={(v) => set({ openWindows: form.openWindows.map((x, j) => (j === i ? [v, x[1]] : x)) })} />
              <span className="text-muted">to</span>
              <TimePicker label="Closes at" value={w[1]} onChange={(v) => set({ openWindows: form.openWindows.map((x, j) => (j === i ? [x[0], v] : x)) })} />
              {form.openWindows.length > 1 && (
                <button className="text-[12px] font-bold text-bad" onClick={() => set({ openWindows: form.openWindows.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            {form.openWindows.length < 4 && (
              <button className="text-[12px] font-bold text-primary" onClick={() => set({ openWindows: [...form.openWindows, ["17:00", "20:00"]] })}>
                + Add a time window
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title={`Products and shop price (${chosen.length})`}>
        <div className="mb-2 text-[11.5px] text-muted">Tick what the shop sells and enter what we pay the shop. Customers see the selling price. The difference is our margin.</div>
        <div className="space-y-3">
          {groups.map(([g, items]) => (
            <div key={g} className="rounded-xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                <span className="text-[12px] font-extrabold">{g}</span>
                <button
                  className="text-[11.5px] font-bold text-primary"
                  onClick={() => {
                    const all = items.every((p) => p.id in form.prices);
                    const next = { ...form.prices };
                    for (const p of items) {
                      if (all) delete next[p.id];
                      else if (!(p.id in next)) next[p.id] = "";
                    }
                    set({ prices: next });
                  }}
                >
                  {items.every((p) => p.id in form.prices) ? "Untick all" : "Tick all"}
                </button>
              </div>
              {items.map((p) => (
                <ProductRow
                  key={p.id}
                  p={p}
                  price={form.prices[p.id]}
                  onToggle={(on) => {
                    const next = { ...form.prices };
                    if (on) next[p.id] = "";
                    else delete next[p.id];
                    set({ prices: next });
                  }}
                  onPrice={(v) => set({ prices: { ...form.prices, [p.id]: v } })}
                />
              ))}
            </div>
          ))}
        </div>
      </Section>
    </Drawer>
  );
}

/**
 * One product in the shop form. The row keeps the same height ticked or not
 * (the price area is always reserved), so ticking never shifts the list.
 */
function ProductRow({ p, price, onToggle, onPrice }: { p: Catalog["products"][number]; price: string | undefined; onToggle: (on: boolean) => void; onPrice: (v: string) => void }) {
  const on = price !== undefined;
  const unit = p.unit === "piece" ? "pc" : p.unit;
  const cost = Number(price);
  const hasCost = on && price !== "" && cost > 0;
  const margin = hasCost ? p.sellingPrice - cost : 0;
  const pct = hasCost ? Math.round((margin / p.sellingPrice) * 100) : 0;
  const inputRef = useRef<HTMLInputElement>(null);
  const toggle = () => {
    onToggle(!on);
    if (!on) requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div
      role="checkbox"
      aria-checked={on}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && e.target === e.currentTarget) {
          e.preventDefault();
          toggle();
        }
      }}
      className={`flex h-[64px] cursor-pointer select-none items-center gap-3 border-b border-line px-3 outline-none transition-colors last:border-0 focus-visible:bg-tint/40 ${on ? "bg-tint/35" : "hover:bg-surface-2/60"}`}
    >
      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors ${on ? "border-primary bg-primary text-white" : "border-line bg-surface"}`}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className={on ? "opacity-100" : "opacity-0"}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] ${on ? "font-extrabold" : "font-bold"}`}>{p.name}</div>
        <div className="truncate text-[11.5px] text-muted">
          Customer pays <span className="font-bold text-ink">{inr(p.sellingPrice)}</span> / {unit}
        </div>
      </div>
      <div className={`w-[132px] shrink-0 sm:w-[150px] ${on ? "" : "invisible max-sm:hidden"}`} onClick={(e) => e.stopPropagation()}>
        <label className="block">
          <span className="sr-only">Shop price for {p.name}, rupees per {unit}</span>
          <div className={`flex h-8 items-center rounded-lg border bg-surface transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 ${on && !hasCost ? "border-warn/60" : "border-line"}`}>
            <span className="flex h-full items-center rounded-l-lg border-r border-line bg-surface-2 px-2 text-[12.5px] font-extrabold text-ink">₹</span>
            <input
              ref={inputRef}
              tabIndex={on ? 0 : -1}
              className="w-full min-w-0 bg-transparent px-2 text-right text-[13px] font-bold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/60"
              inputMode="decimal"
              value={price ?? ""}
              onChange={(e) => onPrice(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
              placeholder="Shop price"
            />
            <span className="pr-2 text-[11px] text-muted">/{unit}</span>
          </div>
        </label>
        <div className={`mt-0.5 h-4 text-right text-[10.5px] font-bold ${!hasCost ? "text-warn" : margin < 0 ? "text-bad" : "text-ok"}`}>
          {!hasCost ? "Enter what we pay the shop" : margin < 0 ? `Loss ${inr(-margin)} per ${unit}` : `Margin ${inr(margin)} (${pct}%)`}
        </div>
      </div>
    </div>
  );
}
