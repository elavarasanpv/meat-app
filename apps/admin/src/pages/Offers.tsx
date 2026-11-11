import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconCheck, IconEdit, IconPlus } from "../ui/icons";
import { TimePicker } from "../ui/TimePicker";
import { Check, DatePicker, PhotoPicker, Select } from "../ui/pickers";
import { Btn, Chip, Drawer, Empty, ErrorBox, Field, Section, Segments, type Tone, inputCls, inr, when } from "../ui/kit";

type Offer = {
  id: string;
  kind: "banner" | "coupon";
  code: string | null;
  title: string;
  titleTa: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  tint: string | null;
  discountType: "percent" | "flat";
  discountValue: number;
  maxDiscount: number | null;
  minOrder: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  productIds: string[] | null;
  pincodes: string[] | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sort: number;
  shopSharePct: number;
  firstOrderOnly: boolean;
  perCustomerLimit: number | null;
  totalLimit: number | null;
  status: "live" | "scheduled" | "ended" | "paused";
  stats: { n: number; discount: number; shopShare: number };
};
type Catalog = {
  products: { id: string; name: string; category: string; sub: string | null; categoryId: string; subcategoryId: string | null }[];
  categories: { id: string; name: string }[];
  subcategories: { id: string; categoryId: string; name: string }[];
  pincodes: { pincode: string; area: string | null }[];
};

const STATUS: Record<Offer["status"], { label: string; tone: Tone }> = {
  live: { label: "Live", tone: "ok" },
  scheduled: { label: "Scheduled", tone: "info" },
  ended: { label: "Ended", tone: "mute" },
  paused: { label: "Paused", tone: "warn" },
};
/** Bold card colours (white text goes on top), matching the customer app. */
const TINTS = ["#E4461F", "#B8361A", "#1E8A4F", "#1C1715", "#2F6FD1", "#7A3E9D"];
const darken = (hex: string, by: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - by)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
const cardBg = (tint: string | null) => `linear-gradient(135deg, ${tint ?? "#E4461F"}, ${darken(tint ?? "#E4461F", 0.28)})`;
const pillText = (o: Pick<Offer, "discountType" | "discountValue">) => (o.discountType === "percent" ? `${o.discountValue}% OFF` : `${inr(o.discountValue)} OFF`);

const describe = (o: Pick<Offer, "discountType" | "discountValue" | "maxDiscount" | "minOrder">) =>
  `${o.discountType === "percent" ? `${o.discountValue}% off` : `${inr(o.discountValue)} off`}${o.maxDiscount ? ` · up to ${inr(o.maxDiscount)}` : ""}${o.minOrder ? ` · above ${inr(o.minOrder)}` : ""}`;

export function Offers() {
  const q = useQuery<Offer[]>({ queryKey: ["admin", "offers"], queryFn: () => api("/admin/offers"), refetchInterval: 30_000 });
  const [filter, setFilter] = useState<"all" | "live" | "scheduled" | "ended">("all");
  const [editing, setEditing] = useState<Offer | "banner" | "coupon" | null>(null);
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (o: Offer) => api(`/admin/offers/${o.id}/active`, { method: "POST", body: { active: !o.isActive } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "offers"] }),
  });
  const list = (q.data ?? []).filter((o) => filter === "all" || o.status === filter || (filter === "ended" && o.status === "paused"));

  return (
    <div className="pb-6">
      <PageHeader
        title="Offers & coupons"
        sub="Banner offers apply by themselves; coupons need their code. Only the best single discount applies to an order."
        actions={
          <div className="flex w-full gap-2 sm:w-auto">
            <Btn onClick={() => setEditing("coupon")}>
              <IconPlus size={14} /> Coupon
            </Btn>
            <Btn kind="primary" onClick={() => setEditing("banner")}>
              <IconPlus size={14} /> Banner offer
            </Btn>
          </div>
        }
      />
      <div className="grid gap-4 px-4 pt-4 md:px-6 xl:grid-cols-2">
        <HeadlineCard />
        <AnnounceCard offers={q.data ?? []} />
      </div>
      <div className="px-4 pt-4 md:px-6">
        <Segments
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: "All", count: q.data?.length },
            { id: "live", label: "Live", count: q.data?.filter((o) => o.status === "live").length },
            { id: "scheduled", label: "Scheduled", count: q.data?.filter((o) => o.status === "scheduled").length },
            { id: "ended", label: "Ended or paused", count: q.data?.filter((o) => o.status === "ended" || o.status === "paused").length },
          ]}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 pt-3 md:grid-cols-2 md:px-6 xl:grid-cols-3">
        <div className="md:col-span-2 xl:col-span-3">
          <ErrorBox error={q.error ?? toggle.error} />
        </div>
        {list.map((o) => (
          <div key={o.id} className="card overflow-hidden p-0">
            <div className="relative flex h-28 items-center gap-3 overflow-hidden px-4 text-white" style={{ background: cardBg(o.tint) }}>
              <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full border-[18px] border-white/10" />
              <div className="relative min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Chip tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Chip>
                  {o.kind === "banner" && <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">Banner</span>}
                </div>
                <div className="mt-1 truncate font-extrabold uppercase tracking-wide">{o.title}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="rounded-md bg-white px-2 py-0.5 text-[12px] font-extrabold" style={{ color: o.tint ?? "#E4461F" }}>{pillText(o)}</span>
                  {o.kind === "coupon" && <span className="rounded-md border border-dashed border-white/80 px-1.5 py-0.5 font-mono text-[11px] font-extrabold tracking-wider">{o.code}</span>}
                </div>
              </div>
              {o.imageUrl && <img src={o.imageUrl} alt="" className="relative h-24 w-28 shrink-0 object-contain object-bottom" />}
            </div>
            <div className="space-y-1 px-4 py-3 text-[12px]">
              <div className="font-bold">{describe(o)}</div>
              <div className="text-muted">
                {when(o.startsAt)} → {when(o.endsAt)}
              </div>
              <div className="text-muted">
                Shop pays <b className="text-ink">{o.shopSharePct}%</b> · FreshCut <b className="text-ink">{100 - o.shopSharePct}%</b>
                {o.firstOrderOnly && " · first order only"}
              </div>
              <div>
                <b>{o.stats.n}</b> {o.stats.n === 1 ? "order" : "orders"} · <b>{inr(o.stats.discount)}</b> given
                {o.stats.n > 0 && <span className="text-muted"> (shop {inr(o.stats.shopShare)}, us {inr(o.stats.discount - o.stats.shopShare)})</span>}
              </div>
              <div className="flex gap-2 pt-1.5">
                <Btn onClick={() => setEditing(o)}>
                  <IconEdit size={13} /> Edit
                </Btn>
                {o.status !== "ended" && (
                  <Btn kind={o.isActive ? "danger" : "ghost"} busy={toggle.isPending && toggle.variables?.id === o.id} onClick={() => toggle.mutate(o)}>
                    {o.isActive ? "Pause" : "Resume"}
                  </Btn>
                )}
              </div>
            </div>
          </div>
        ))}
        {q.data && !list.length && (
          <div className="card md:col-span-2 xl:col-span-3">
            <Empty>No offers here yet. Create a banner offer like “20% off chicken today”, or a coupon like FIRST50.</Empty>
          </div>
        )}
      </div>
      {editing && <OfferForm offer={typeof editing === "string" ? null : editing} kind={typeof editing === "string" ? editing : editing.kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ───────────────────────── form ─────────────────────────

type Form = {
  kind: "banner" | "coupon";
  code: string;
  title: string;
  titleTa: string;
  subtitle: string;
  imageUrl: string | null;
  imageBase64: string | null;
  imageName: string | null;
  tint: string;
  discountType: "percent" | "flat";
  discountValue: string;
  maxDiscount: string;
  minOrder: string;
  scope: "all" | "category" | "subcategory" | "products";
  categoryId: string;
  subcategoryId: string;
  productIds: string[];
  pincodes: string[];
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  shopSharePct: string;
  firstOrderOnly: boolean;
  perCustomerLimit: string;
  totalLimit: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 15) * 15)}`;
const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

function fromOffer(o: Offer | null, kind: "banner" | "coupon"): Form {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 45, 0, 0);
  const s = o ? new Date(o.startsAt) : now;
  const e = o ? new Date(o.endsAt) : kind === "coupon" ? new Date(now.getTime() + 30 * 86_400_000) : end;
  return {
    kind,
    code: o?.code ?? "",
    title: o?.title ?? "",
    titleTa: o?.titleTa ?? "",
    subtitle: o?.subtitle ?? "",
    imageUrl: o?.imageUrl ?? null,
    imageName: null,
    imageBase64: null,
    tint: o?.tint ?? TINTS[0],
    discountType: o?.discountType ?? "percent",
    discountValue: o ? String(o.discountValue) : "",
    maxDiscount: o?.maxDiscount ? String(o.maxDiscount) : "",
    minOrder: o?.minOrder ? String(o.minOrder) : "",
    scope: o?.productIds?.length ? "products" : o?.subcategoryId ? "subcategory" : o?.categoryId ? "category" : "all",
    categoryId: o?.categoryId ?? "",
    subcategoryId: o?.subcategoryId ?? "",
    productIds: o?.productIds ?? [],
    pincodes: o?.pincodes ?? [],
    startDate: localDate(s),
    startTime: localTime(s),
    endDate: localDate(e),
    endTime: localTime(e),
    shopSharePct: o ? String(o.shopSharePct) : "50",
    firstOrderOnly: o?.firstOrderOnly ?? false,
    perCustomerLimit: o?.perCustomerLimit ? String(o.perCustomerLimit) : "",
    totalLimit: o?.totalLimit ? String(o.totalLimit) : "",
  };
}

function OfferForm({ offer, kind, onClose }: { offer: Offer | null; kind: "banner" | "coupon"; onClose: () => void }) {
  const qc = useQueryClient();
  const catalog = useQuery<Catalog>({ queryKey: ["admin", "catalog"], queryFn: () => api("/admin/catalog"), staleTime: 300_000 });
  const [f, setF] = useState<Form>(() => fromOffer(offer, kind));
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const subs = useMemo(() => (catalog.data?.subcategories ?? []).filter((s) => !f.categoryId || s.categoryId === f.categoryId), [catalog.data, f.categoryId]);

  const save = useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>(offer ? `/admin/offers/${offer.id}` : "/admin/offers", { method: offer ? "PATCH" : "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "offers"] });
      onClose();
    },
  });

  async function pickImage(file: File) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // PNG keeps the cut-out edge; photos go as JPEG to stay small.
    const url = file.type === "image/png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.82);
    // the full data URL goes up so the API knows whether it is a PNG
    set({ imageBase64: url, imageUrl: url, imageName: file.name });
  }

  function submit() {
    setError(null);
    const value = Number(f.discountValue);
    if (!(value > 0)) return setError("Enter the discount.");
    if (f.kind === "coupon" && !/^[A-Z0-9]{3,20}$/.test(f.code)) return setError("Coupon code: 3 to 20 letters or digits, like FIRST50.");
    if (f.scope === "category" && !f.categoryId) return setError("Pick a category.");
    if (f.scope === "subcategory" && !f.subcategoryId) return setError("Pick a sub-category.");
    if (f.scope === "products" && !f.productIds.length) return setError("Tick at least one product.");
    const startsAt = toIso(f.startDate, f.startTime);
    const endsAt = toIso(f.endDate, f.endTime);
    if (new Date(endsAt) <= new Date(startsAt)) return setError("The end must be after the start.");
    save.mutate({
      kind: f.kind,
      code: f.kind === "coupon" ? f.code : null,
      title: f.title.trim(),
      titleTa: f.titleTa.trim() || null,
      subtitle: f.subtitle.trim() || null,
      imageBase64: f.imageBase64,
      removeImage: !!offer?.imageUrl && !f.imageUrl,
      tint: f.tint,
      discountType: f.discountType,
      discountValue: value,
      maxDiscount: f.maxDiscount ? Number(f.maxDiscount) : null,
      minOrder: f.minOrder ? Number(f.minOrder) : null,
      categoryId: f.scope === "category" || f.scope === "subcategory" ? f.categoryId || null : null,
      subcategoryId: f.scope === "subcategory" ? f.subcategoryId : null,
      productIds: f.scope === "products" ? f.productIds : null,
      pincodes: f.pincodes.length ? f.pincodes : null,
      startsAt,
      endsAt,
      shopSharePct: Math.max(0, Math.min(100, Number(f.shopSharePct) || 0)),
      firstOrderOnly: f.firstOrderOnly,
      perCustomerLimit: f.perCustomerLimit ? Number(f.perCustomerLimit) : null,
      totalLimit: f.totalLimit ? Number(f.totalLimit) : null,
    });
  }

  const num = (v: string) => v.replace(/[^\d.]/g, "");
  const example = Number(f.discountValue) > 0 ? (f.discountType === "percent" ? Math.min(Math.round((1000 * Number(f.discountValue)) / 100), Number(f.maxDiscount) || Infinity) : Number(f.discountValue)) : 0;
  const shopPart = Math.round((example * (Number(f.shopSharePct) || 0)) / 100);

  return (
    <Drawer
      wide
      title={offer ? `Edit ${offer.kind === "coupon" ? "coupon" : "offer"}` : f.kind === "coupon" ? "New coupon" : "New banner offer"}
      sub={f.kind === "coupon" ? "Customers type the code in the cart." : "Shows on the home screen and applies by itself."}
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto self-center text-[12px] font-bold text-bad">{error}</span>}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" busy={save.isPending} disabled={f.title.trim().length < 3} onClick={submit}>
            {offer ? "Save changes" : "Create"}
          </Btn>
        </>
      }
    >
      <ErrorBox error={save.error} />

      {/* live preview of the customer banner */}
      <div className="relative mb-4 flex h-32 items-center gap-3 overflow-hidden rounded-2xl px-4 text-white" style={{ background: cardBg(f.tint) }}>
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[20px] border-white/10" />
        <div className="relative min-w-0 flex-1">
          <div className="truncate text-[17px] font-extrabold uppercase tracking-wide">{f.title || "Offer title"}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-white px-2.5 py-1 text-[13px] font-extrabold" style={{ color: f.tint }}>
              {pillText({ discountType: f.discountType, discountValue: Number(f.discountValue) || 0 })}
            </span>
            {f.kind === "coupon" && <span className="rounded-md border border-dashed border-white/80 px-2 py-1 font-mono text-[11px] font-extrabold tracking-wider">{f.code || "CODE"}</span>}
          </div>
          <div className="mt-1.5 truncate text-[11.5px] text-white/85">{f.subtitle || [Number(f.maxDiscount) ? `up to ${inr(Number(f.maxDiscount))}` : null, Number(f.minOrder) ? `above ${inr(Number(f.minOrder))}` : null].filter(Boolean).join(" · ")}</div>
          <span className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-ink">{f.kind === "coupon" ? "Apply code" : "Shop now"}</span>
        </div>
        {f.imageUrl && <img src={f.imageUrl} alt="" className="relative h-28 w-32 object-contain object-bottom" />}
      </div>

      <Section title="What customers see">
        <div className="grid gap-3 sm:grid-cols-2">
          {f.kind === "coupon" && (
            <Field label="Coupon code" hint="Letters and digits only, e.g. FIRST50">
              <input className={`${inputCls} font-mono uppercase`} value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="FIRST50" />
            </Field>
          )}
          <Field label="Title">
            <input className={inputCls} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={f.kind === "coupon" ? "₹50 off your first order" : "20% off all chicken today"} />
          </Field>
          <Field label="Title in Tamil (optional)">
            <input className={inputCls} value={f.titleTa} onChange={(e) => set({ titleTa: e.target.value })} placeholder="இன்று சிக்கனுக்கு 20% தள்ளுபடி" />
          </Field>
          <Field label="Short line (optional)" hint="Leave empty to show the discount automatically">
            <input className={inputCls} value={f.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Fresh from shops near you" />
          </Field>
        </div>
        <div className="mt-3 grid gap-3">
          <Field label="Photo" hint="A transparent PNG works best">
            <PhotoPicker url={f.imageUrl} name={f.imageName} onPick={(file) => void pickImage(file)} onRemove={() => set({ imageUrl: null, imageBase64: null, imageName: null })} />
          </Field>
          <Field label="Card colour">
            <div className="flex items-center gap-2 py-1">
              {TINTS.map((t) => (
                <button key={t} type="button" onClick={() => set({ tint: t })} aria-label={`Tint ${t}`} aria-pressed={f.tint === t} className={`flex h-7 w-7 items-center justify-center rounded-full text-white transition ring-2 ring-offset-2 ring-offset-ground ${f.tint === t ? "ring-ink" : "ring-transparent hover:ring-line"}`} style={{ background: t }}>
                  {f.tint === t && <IconCheck size={13} />}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Discount">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <Select
              label="Discount type"
              value={f.discountType}
              onChange={(discountType) => set({ discountType })}
              options={[
                { value: "percent", label: "Percent off" },
                { value: "flat", label: "Flat ₹ off" },
              ]}
            />
          </Field>
          <Field label={f.discountType === "percent" ? "Percent" : "Rupees off"}>
            <input className={inputCls} inputMode="decimal" value={f.discountValue} onChange={(e) => set({ discountValue: num(e.target.value) })} placeholder={f.discountType === "percent" ? "20" : "50"} />
          </Field>
          {f.discountType === "percent" && (
            <Field label="Max discount ₹ (optional)">
              <input className={inputCls} inputMode="decimal" value={f.maxDiscount} onChange={(e) => set({ maxDiscount: num(e.target.value) })} placeholder="150" />
            </Field>
          )}
          <Field label="Minimum order ₹ (optional)">
            <input className={inputCls} inputMode="decimal" value={f.minOrder} onChange={(e) => set({ minOrder: num(e.target.value) })} placeholder="1000" />
          </Field>
        </div>
      </Section>

      <Section title="Applies to">
        <Segments
          value={f.scope}
          onChange={(scope) => set({ scope })}
          items={[
            { id: "all", label: "Everything" },
            { id: "category", label: "A category" },
            { id: "subcategory", label: "A sub-category" },
            { id: "products", label: "Chosen products" },
          ]}
        />
        <div className="mt-3">
          {(f.scope === "category" || f.scope === "subcategory") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Select label="Category" value={f.categoryId} onChange={(categoryId) => set({ categoryId, subcategoryId: "" })} options={(catalog.data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              </Field>
              {f.scope === "subcategory" && (
                <Field label="Sub-category">
                  <Select label="Sub-category" value={f.subcategoryId} onChange={(subcategoryId) => set({ subcategoryId })} options={subs.map((x) => ({ value: x.id, label: x.name }))} placeholder={f.categoryId ? "Choose…" : "Pick a category first"} />
                </Field>
              )}
            </div>
          )}
          {f.scope === "products" && (
            <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
              {catalog.data?.products.map((p) => (
                <Check key={p.id} className="rounded-lg px-2 py-1.5 hover:bg-surface-2" checked={f.productIds.includes(p.id)} onChange={(on) => set({ productIds: on ? [...f.productIds, p.id] : f.productIds.filter((x) => x !== p.id) })}>
                  <span className="block truncate">{p.name}</span>
                </Check>
              ))}
            </div>
          )}
          {f.scope === "all" && <div className="text-[12px] text-muted">Every product in the order counts towards the discount.</div>}
        </div>
      </Section>

      <Section title="When">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <div className="flex flex-wrap gap-2">
              <DatePicker label="Start date" value={f.startDate} onChange={(startDate) => set({ startDate })} />
              <TimePicker label="Start time" value={f.startTime} onChange={(startTime) => set({ startTime })} />
            </div>
          </Field>
          <Field label="Ends">
            <div className="flex flex-wrap gap-2">
              <DatePicker label="End date" value={f.endDate} min={f.startDate} onChange={(endDate) => set({ endDate })} />
              <TimePicker label="End time" value={f.endTime} onChange={(endTime) => set({ endTime })} />
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Where (optional)">
        <div className="flex flex-wrap gap-1.5">
          {catalog.data?.pincodes.map((p) => {
            const on = f.pincodes.includes(p.pincode);
            return (
              <button key={p.pincode} type="button" aria-pressed={on} onClick={() => set({ pincodes: on ? f.pincodes.filter((x) => x !== p.pincode) : [...f.pincodes, p.pincode] })} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-bold transition ${on ? "border-primary bg-tint text-primary" : "border-line bg-surface text-muted hover:border-muted/50 hover:text-ink"}`}>
                {on && <IconCheck size={12} />}
                {p.pincode} {p.area && <span className="font-normal">· {p.area}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-[11px] text-muted">{f.pincodes.length ? `Only in ${f.pincodes.length} pincode(s).` : "Nothing ticked means every pincode."}</div>
      </Section>

      <Section title="Who pays for the discount">
        <div className="grid gap-3">
          <Field label="Shop's share %">
            <div className="flex items-center gap-3">
              <div className="flex h-[34px] w-28 shrink-0 items-center overflow-hidden rounded-lg border border-line bg-surface transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <input className="h-full w-full min-w-0 bg-transparent px-2.5 text-right text-[13px] font-bold tabular-nums outline-none" inputMode="numeric" value={f.shopSharePct} onChange={(e) => set({ shopSharePct: num(e.target.value).slice(0, 3) })} />
                <span className="flex h-full items-center border-l border-line bg-surface-2 px-2.5 text-[12.5px] font-extrabold text-ink">%</span>
              </div>
              <span className="text-[12px] text-muted">
                FreshCut covers the other <b className="text-ink">{Math.max(0, 100 - (Number(f.shopSharePct) || 0))}%</b>.
              </span>
            </div>
          </Field>
          <div className="rounded-xl bg-surface-2/70 px-3 py-2 text-[12px] leading-relaxed text-muted">
            {example > 0 ? (
              <>
                On a ₹1,000 order the customer saves <b className="text-ink">{inr(example)}</b>: the shop gives <b className="text-ink">{inr(shopPart)}</b>, FreshCut gives <b className="text-ink">{inr(example - shopPart)}</b>.
              </>
            ) : (
              "Enter a discount to see the split."
            )}
          </div>
        </div>
      </Section>

      <Section title="Limits">
        <div className="grid gap-3 sm:grid-cols-3">
          <Check className="sm:col-span-3" checked={f.firstOrderOnly} onChange={(firstOrderOnly) => set({ firstOrderOnly })}>
            Only on a customer's first order
          </Check>
          <Field label="Uses per customer" hint={f.kind === "coupon" ? "Empty = once" : "Empty = unlimited"}>
            <input className={inputCls} inputMode="numeric" value={f.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: num(e.target.value) })} />
          </Field>
          <Field label="Total uses (optional)" hint="Stops after this many orders">
            <input className={inputCls} inputMode="numeric" value={f.totalLimit} onChange={(e) => set({ totalLimit: num(e.target.value) })} />
          </Field>
        </div>
      </Section>
    </Drawer>
  );
}

// ───────────────────────── home headline ─────────────────────────

type Headline = { id: string; title: string; titleTa: string | null; subtitle: string | null; subtitleTa: string | null; startsAt: string; endsAt: string; isActive: boolean; status: Offer["status"] };

/** The daily lines the customer app rotates by itself when no headline is set (Sunday first). */
const DAILY = ["Sunday special, machi!", "Fresh week, fresh cuts", "Picked just for you", "Midweek cravings sorted", "Offers you can't miss!", "Friday feast loading…", "Weekend grill goals"];

function HeadlineCard() {
  const qc = useQueryClient();
  const q = useQuery<Headline[]>({ queryKey: ["admin", "headlines"], queryFn: () => api("/admin/headlines") });
  const [editing, setEditing] = useState<Headline | "new" | null>(null);
  const toggle = useMutation({
    mutationFn: (h: Headline) => api(`/admin/headlines/${h.id}/active`, { method: "POST", body: { active: !h.isActive } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "headlines"] }),
  });
  const live = q.data?.find((h) => h.status === "live");
  const today = DAILY[new Date().getDay()];

  return (
    <section className="card">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="card-title">Home headline</div>
          <div className="card-sub">The title above the offers and suggestions on the customer home screen.</div>
        </div>
        <Btn kind="primary" onClick={() => setEditing("new")}>
          <IconPlus size={14} /> Special headline
        </Btn>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-2/70 px-3 py-2.5">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">Showing now</span>
        <span className="truncate text-[15px] font-extrabold">{live ? live.title : today}</span>
        <span className="ml-auto shrink-0">{live ? <Chip tone="ok">Your headline · until {when(live.endsAt)}</Chip> : <Chip tone="mute">Daily line</Chip>}</span>
      </div>
      {!!q.data?.length && (
        <div className="mt-3 divide-y divide-line rounded-xl border border-line">
          {q.data.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
              <Chip tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Chip>
              <span className="min-w-0 flex-1 truncate font-bold">{h.title}</span>
              <span className="text-[11px] text-muted">
                {when(h.startsAt)} → {when(h.endsAt)}
              </span>
              <Btn onClick={() => setEditing(h)}>
                <IconEdit size={13} />
              </Btn>
              {h.status !== "ended" && (
                <Btn kind={h.isActive ? "danger" : "ghost"} busy={toggle.isPending && toggle.variables?.id === h.id} onClick={() => toggle.mutate(h)}>
                  {h.isActive ? "Pause" : "Resume"}
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted">Without a special headline the app shows a different line each day: {DAILY.join(" · ")}</div>
      {editing && <HeadlineForm h={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

type Broadcast = { id: string; title: string; body: string; titleTa: string | null; bodyTa: string | null; audience: "customers" | "shops" | "riders" | "all"; offerId: string | null; offerTitle: string | null; sent: number; failed: number; at: string; by: string | null };
const AUDIENCE: Record<Broadcast["audience"], string> = { customers: "Customers", shops: "Shops", riders: "Riders", all: "Everyone" };

/** Promo push: "Sunday special", a new offer, a notice to shops or riders. Goes to every phone in the audience. */
function AnnounceCard({ offers }: { offers: Offer[] }) {
  const qc = useQueryClient();
  const history = useQuery<Broadcast[]>({ queryKey: ["admin", "broadcasts"], queryFn: () => api("/admin/broadcasts") });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [titleTa, setTitleTa] = useState("");
  const [bodyTa, setBodyTa] = useState("");
  const [audience, setAudience] = useState<Broadcast["audience"]>("customers");
  const [offerId, setOfferId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<{ sent: number; failed: number } | null>(null);
  const send = useMutation({
    mutationFn: () => api<{ sent: number; failed: number }>("/admin/broadcasts", { method: "POST", body: { title, body, titleTa: titleTa || null, bodyTa: bodyTa || null, audience, offerId: offerId || null } }),
    onSuccess: (r) => {
      setDone(r);
      setConfirm(false);
      setTitle(""); setBody(""); setTitleTa(""); setBodyTa(""); setOfferId("");
      void qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
    },
  });
  const live = offers.filter((o) => o.status === "live" || o.status === "scheduled");
  // picking an offer prefills the text; the admin can still edit it
  const pickOffer = (id: string) => {
    setOfferId(id);
    const o = offers.find((x) => x.id === id);
    if (o && !title) { setTitle(o.title.slice(0, 60)); setBody(`${describe(o)} · Open FreshCut to order`.slice(0, 140)); }
  };
  const ready = title.trim().length >= 3 && body.trim().length >= 3;

  return (
    <section className="card">
      <div className="card-title">Announce</div>
      <div className="card-sub">A push notification to every phone in the audience: a Sunday special, a new offer, or a notice to shops or riders.</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Title (English)" hint={`${title.length}/60`}>
          <input className={inputCls} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday special: 20% off mutton" />
        </Field>
        <Field label="Title (Tamil)" hint="optional · shown to Tamil users">
          <input className={inputCls} maxLength={80} value={titleTa} onChange={(e) => setTitleTa(e.target.value)} placeholder="ஞாயிறு சிறப்பு: ஆட்டிறைச்சிக்கு 20% தள்ளுபடி" />
        </Field>
        <Field label="Message (English)" hint={`${body.length}/140`}>
          <textarea className={`${inputCls} min-h-[64px]`} maxLength={140} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Today only. Order before 7 PM for evening delivery." />
        </Field>
        <Field label="Message (Tamil)" hint="optional">
          <textarea className={`${inputCls} min-h-[64px]`} maxLength={180} value={bodyTa} onChange={(e) => setBodyTa(e.target.value)} placeholder="இன்று மட்டும். மாலை டெலிவரிக்கு 7 மணிக்குள் ஆர்டர் செய்யுங்கள்." />
        </Field>
        <Select label="Send to" value={audience} onChange={setAudience} options={(Object.keys(AUDIENCE) as Broadcast["audience"][]).map((a) => ({ value: a, label: AUDIENCE[a] }))} />
        <Select label="Opens this offer when tapped" value={offerId} onChange={pickOffer} placeholder="Just open the app" options={live.map((o) => ({ value: o.id, label: `${o.title}${o.kind === "coupon" ? ` (${o.code})` : ""}` }))} />
      </div>
      {/* phone-style preview */}
      <div className="mt-3 flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-extrabold text-white">F</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted">FreshCut · now</div>
          <div className="truncate text-[13px] font-extrabold">{title || "Title"}</div>
          <div className="line-clamp-2 text-[12px]">{body || "Message"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirm ? (
          <>
            <span className="text-[12px] font-bold">Send to all {AUDIENCE[audience].toLowerCase()} now?</span>
            <Btn kind="primary" busy={send.isPending} onClick={() => send.mutate()}>Yes, send</Btn>
            <Btn onClick={() => setConfirm(false)}>Cancel</Btn>
          </>
        ) : (
          <Btn kind="primary" disabled={!ready} onClick={() => { setDone(null); setConfirm(true); }}>Send notification</Btn>
        )}
        {done && <Chip tone="ok">Sent to {done.sent} phone{done.sent === 1 ? "" : "s"}{done.failed ? ` · ${done.failed} failed` : ""}</Chip>}
      </div>
      <ErrorBox error={send.error} />
      {!!history.data?.length && (
        <div className="mt-3 divide-y divide-line rounded-xl border border-line">
          {history.data.slice(0, 6).map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
              <Chip tone="mute">{AUDIENCE[b.audience]}</Chip>
              <span className="min-w-0 flex-1 truncate"><b>{b.title}</b> <span className="text-muted">· {b.body}</span></span>
              <span className="shrink-0 text-[11px] text-muted">{b.sent} sent · {when(b.at)}{b.by ? ` · ${b.by}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HeadlineForm({ h, onClose }: { h: Headline | null; onClose: () => void }) {
  const qc = useQueryClient();
  const now = new Date();
  const s0 = h ? new Date(h.startsAt) : now;
  const e0 = h ? new Date(h.endsAt) : new Date(now.getTime() + 86_400_000);
  const [title, setTitle] = useState(h?.title ?? "");
  const [titleTa, setTitleTa] = useState(h?.titleTa ?? "");
  const [subtitle, setSubtitle] = useState(h?.subtitle ?? "");
  const [subtitleTa, setSubtitleTa] = useState(h?.subtitleTa ?? "");
  const [sd, setSd] = useState(localDate(s0));
  const [st, setSt] = useState(localTime(s0));
  const [ed, setEd] = useState(localDate(e0));
  const [et, setEt] = useState(localTime(e0));
  const save = useMutation({
    mutationFn: () =>
      api(h ? `/admin/headlines/${h.id}` : "/admin/headlines", {
        method: h ? "PATCH" : "POST",
        body: { title: title.trim(), titleTa: titleTa.trim() || null, subtitle: subtitle.trim() || null, subtitleTa: subtitleTa.trim() || null, startsAt: toIso(sd, st), endsAt: toIso(ed, et), isActive: h?.isActive ?? true },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "headlines"] });
      onClose();
    },
  });
  return (
    <Drawer
      title={h ? "Edit headline" : "Special headline"}
      sub="Shown instead of the daily line while it runs."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" busy={save.isPending} disabled={title.trim().length < 3} onClick={() => save.mutate()}>
            {h ? "Save" : "Create"}
          </Btn>
        </>
      }
    >
      <ErrorBox error={save.error} />
      <div className="mb-4 rounded-2xl bg-[#FBF7F3] px-4 py-3">
        <div className="text-[18px] font-extrabold">{title || "New Year special 🎉"}</div>
        {(subtitle || !title) && <div className="text-[12px] text-muted">{subtitle || "Fresh cuts for the party, delivered before midnight"}</div>}
      </div>
      <Section title="Words">
        <div className="grid gap-3">
          <Field label="Headline" hint="Up to 60 characters. Emojis are fine.">
            <input className={inputCls} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New Year special 🎉" />
          </Field>
          <Field label="Headline in Tamil (optional)">
            <input className={inputCls} maxLength={80} value={titleTa} onChange={(e) => setTitleTa(e.target.value)} placeholder="புத்தாண்டு ஸ்பெஷல் 🎉" />
          </Field>
          <Field label="Small line under it (optional)">
            <input className={inputCls} maxLength={80} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Fresh cuts for the party, delivered before midnight" />
          </Field>
          <Field label="Small line in Tamil (optional)">
            <input className={inputCls} maxLength={100} value={subtitleTa} onChange={(e) => setSubtitleTa(e.target.value)} />
          </Field>
        </div>
      </Section>
      <Section title="When">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <div className="flex flex-wrap gap-2">
              <DatePicker label="Start date" value={sd} onChange={setSd} />
              <TimePicker label="Start time" value={st} onChange={setSt} />
            </div>
          </Field>
          <Field label="Ends">
            <div className="flex flex-wrap gap-2">
              <DatePicker label="End date" value={ed} min={sd} onChange={setEd} />
              <TimePicker label="End time" value={et} onChange={setEt} />
            </div>
          </Field>
        </div>
      </Section>
    </Drawer>
  );
}
