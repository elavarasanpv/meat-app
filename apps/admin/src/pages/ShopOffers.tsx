import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shopOfferHeadline, type ShopOfferKind, type ShopOfferScope, SHOP_OFFER_COLORS, SHOP_OFFER_COLOR_KEYS, shopOfferColorKey, shopOfferColors, type ShopOfferColor } from "@thanjozmart/shared";
import { api, upload } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconCheck, IconEdit, IconPlus } from "../ui/icons";
import { imageUrl } from "../ui/ImageField";
import { DatePicker, Select } from "../ui/pickers";
import { Btn, Chip, Drawer, Empty, ErrorBox, Field, Segments, type Tone, inputCls, inr, when } from "../ui/kit";

type State = "waiting" | "rejected" | "off" | "scheduled" | "live" | "ended";
type ShopOffer = {
  id: string;
  dealerId: string;
  shopName: string;
  kind: ShopOfferKind;
  productId: string | null;
  product: { name: string; nameTa: string | null; imagePath: string | null; packSize: string | null; mrp: number | null } | null;
  scope: ShopOfferScope;
  productIds: string[] | null;
  category: { id: string; name: string; nameTa: string | null } | null;
  pct: number | null;
  buyQty: number | null;
  mix?: boolean;
  freeProductId?: string | null;
  freeProduct?: { name: string; nameTa: string | null; imagePath: string | null } | null;
  color?: ShopOfferColor | null;
  freeQty: number | null;
  minOrder: number | null;
  maxDiscount: number | null;
  validDays: number | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  status: "pending" | "approved" | "rejected";
  state: State;
  rejectReason: string | null;
  pushedAt: string | null;
  createdAt: string;
  bannerPath: string | null;
  paidBy: "shop" | "app";
  priceNow: { usual: number; offer: number; shopUsual: number; shopGets: number } | null;
  stats: { orders: number; freeUnits: number; couponsGiven: number; couponsUsed: number; given: number };
};
type Feed = { offers: ShopOffer[]; shops: { id: string; name: string }[] };
type Listing = { master_product_id: string; shop_price: number; selling_price: number; mrp: number | null; is_active: boolean; product: { name: string; pack_size: string | null; mrp: number | null; category_id: string | null } };
type Category = { id: string; parent_id: string | null; name: string };

const STATE: Record<State, { label: string; tone: Tone }> = {
  waiting: { label: "Waiting for you", tone: "warn" },
  rejected: { label: "Rejected", tone: "bad" },
  off: { label: "Switched off", tone: "mute" },
  scheduled: { label: "Scheduled", tone: "info" },
  live: { label: "Live", tone: "ok" },
  ended: { label: "Ended", tone: "mute" },
};
/** Same colours as the shop app and the customer app. */
const LOOK: Record<ShopOfferKind, { from: string; to: string; mark: string; label: string; note: string }> = {
  price: { from: "#E4461F", to: "#F2803A", mark: "%", label: "Price off", note: "A product sells at a lower price" },
  bogo: { from: "#F08A24", to: "#F7B733", mark: "1+1", label: "Buy and get free", note: "Buy some, get some free" },
  free_gift: { from: "#1F8A4C", to: "#49B46E", mark: "🎁", label: "Free gift", note: "A free item on a big order" },
  next_order: { from: "#5B43C9", to: "#8E6BF0", mark: "₹", label: "Next-order coupon", note: "Order today, save on the next one" },
};
const KINDS = Object.keys(LOOK) as ShopOfferKind[];

const pad = (n: number) => String(n).padStart(2, "0");
/** The India date (yyyy-mm-dd) of a moment. */
const istDay = (d: Date) => {
  const t = new Date(d.getTime() + 330 * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** A price or buy-get-free offer on more than one product. */
const isMany = (o: ShopOffer) => (o.kind === "price" || o.kind === "bogo") && o.scope !== "product";
/** What such an offer is on: the category, or how many products. */
const coverText = (o: ShopOffer) => (o.scope === "category" ? o.category?.name ?? "A category" : `${o.productIds?.length ?? 0} products`);

const terms = (o: ShopOffer) => {
  if (o.kind === "price" && isMany(o))
    return o.scope === "category"
      ? `${o.pct}% off the MRP on every product of the shop in ${coverText(o)}, where that makes it cheaper. ${app(o) ? "Thanjoz Mart pays the cut." : "The shop takes the cut."}`
      : `${o.pct}% off the MRP on ${coverText(o)}. ${app(o) ? "Thanjoz Mart pays the cut." : "The shop takes the cut."}`;
  if (o.kind === "bogo" && isMany(o)) return `On ${o.scope === "category" ? `every product in ${coverText(o)}` : coverText(o)}: ${o.mix ? `every ${o.buyQty} bought, in any mix, ${o.freeProduct ? `${o.freeQty} × ${o.freeProduct.name} free.` : `${o.freeQty} more of the lowest-priced one free.`}` : `every ${o.buyQty} bought of one product, ${o.freeQty} more of it free.`} ${app(o) ? "Thanjoz Mart pays the shop for the free ones." : "The shop gives the free ones."}`;
  if (o.kind === "price") return o.priceNow ? `${inr(o.priceNow.usual)} → ${inr(o.priceNow.offer)} for the customer · shop gets ${inr(o.priceNow.shopGets)} (usually ${inr(o.priceNow.shopUsual)})` : "The product is not on sale in this shop now";
  if (o.kind === "bogo") return `Every ${o.buyQty} bought, ${o.freeQty} more free. ${app(o) ? "Thanjoz Mart pays the shop for the free ones." : "The shop gives the free ones."}`;
  if (o.kind === "free_gift") return `${o.freeQty} free on orders of ${inr(o.minOrder ?? 0)} or more. ${app(o) ? "Thanjoz Mart pays the shop for the gift." : "The shop gives the gift."}`;
  return `Order ${inr(o.minOrder ?? 0)} or more today: ${o.pct}% off the next order, up to ${inr(o.maxDiscount ?? 0)}, for ${o.validDays} days. ${app(o) ? "Thanjoz Mart" : "The shop"} pays the discount.`;
};
const app = (o: ShopOffer) => o.paidBy === "app";
const results = (o: ShopOffer) => {
  const s = o.stats;
  if (o.kind === "next_order") return `${s.couponsGiven} coupons given · ${s.couponsUsed} used · ${inr(s.given)} given`;
  if (o.kind === "price") return `${s.orders} ${s.orders === 1 ? "order" : "orders"} · ${inr(s.given)} given`;
  return `${s.orders} ${s.orders === 1 ? "order" : "orders"} · ${s.freeUnits} free items · worth ${inr(s.given)}`;
};

export function ShopOffers() {
  const q = useQuery<Feed>({ queryKey: ["admin", "shop-offers"], queryFn: () => api("/admin/shop-offers"), refetchInterval: 30_000 });
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["admin", "shop-offers"] });
  const [filter, setFilter] = useState<"waiting" | "live" | "scheduled" | "past" | "all">("waiting");
  const [editing, setEditing] = useState<ShopOffer | "new" | null>(null);
  const [rejecting, setRejecting] = useState<ShopOffer | null>(null);
  const [reason, setReason] = useState("");

  const review = useMutation({
    mutationFn: (v: { id: string; approve: boolean; reason?: string }) => api(`/admin/shop-offers/${v.id}/review`, { method: "POST", body: { approve: v.approve, reason: v.reason } }),
    onSuccess: () => {
      setRejecting(null);
      setReason("");
      done();
    },
  });
  const toggle = useMutation({ mutationFn: (o: ShopOffer) => api(`/admin/shop-offers/${o.id}/active`, { method: "POST", body: { active: !o.isActive } }), onSuccess: done });
  const end = useMutation({ mutationFn: (o: ShopOffer) => api(`/admin/shop-offers/${o.id}/end`, { method: "POST" }), onSuccess: done });

  const all = q.data?.offers ?? [];
  const past = (o: ShopOffer) => o.state === "ended" || o.state === "rejected" || o.state === "off";
  const list = all.filter((o) => filter === "all" || (filter === "past" ? past(o) : o.state === filter));
  const count = (f: (o: ShopOffer) => boolean) => (q.data ? all.filter(f).length : undefined);

  return (
    <div className="pb-6">
      <PageHeader
        title="Shop offers"
        sub="Offers grocery shops make for their own customers. The shop pays for its own offers; for an offer you make, you choose who pays. An offer goes live only after you approve it; customers near the shop then get one notification (one per shop per day)."
        actions={
          <Btn kind="primary" onClick={() => setEditing("new")}>
            <IconPlus size={14} /> Offer for a shop
          </Btn>
        }
      />
      <div className="px-4 pt-4 md:px-6">
        <Segments
          value={filter}
          onChange={setFilter}
          items={[
            { id: "waiting", label: "Waiting for you", count: count((o) => o.state === "waiting") },
            { id: "live", label: "Live", count: count((o) => o.state === "live") },
            { id: "scheduled", label: "Scheduled", count: count((o) => o.state === "scheduled") },
            { id: "past", label: "Ended, off or rejected", count: count(past) },
            { id: "all", label: "All", count: q.data ? all.length : undefined },
          ]}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 pt-3 md:grid-cols-2 md:px-6 xl:grid-cols-3">
        <div className="md:col-span-2 xl:col-span-3">
          <ErrorBox error={q.error ?? review.error ?? toggle.error ?? end.error} />
        </div>
        {list.map((o) => {
          const look = { ...LOOK[o.kind], ...shopOfferColors(o.kind, o.color) };
          const many = isMany(o);
          const img = imageUrl(o.bannerPath ?? o.product?.imagePath, true);
          return (
            <div key={o.id} className="card overflow-hidden p-0">
              <div className="relative flex min-h-24 items-center gap-3 overflow-hidden px-4 py-3 text-white" style={{ background: `linear-gradient(120deg, ${look.from}, ${look.to})` }}>
                <div className="pointer-events-none absolute -right-8 -top-14 h-36 w-36 rounded-full border-[16px] border-white/10" />
                <div className="relative min-w-0 flex-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">{look.label}</div>
                  <div className="mt-0.5 text-[17px] font-extrabold leading-tight">{shopOfferHeadline({ ...o, product: null }).en}</div>
                  {many ? (
                    <div className="mt-1 text-[12px] font-bold text-white/90">{coverText(o)}</div>
                  ) : o.product && (
                    <div className="mt-1 text-[12px] font-bold text-white/90">
                      {o.product.name}
                      {o.product.packSize ? ` · ${o.product.packSize}` : ""}
                    </div>
                  )}
                </div>
                {img ? (
                  <img src={img} alt="" className={`relative h-16 w-16 shrink-0 rounded-xl bg-white ${o.bannerPath ? "object-cover" : "object-contain p-1"}`} />
                ) : (
                  <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/20 text-[18px] font-extrabold">{look.mark}</div>
                )}
              </div>
              <div className="space-y-1 px-4 py-3 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={STATE[o.state].tone}>{STATE[o.state].label}</Chip>
                  <span className="font-extrabold">{o.shopName}</span>
                  {app(o) && <Chip tone="info">Thanjoz Mart pays</Chip>}
                </div>
                <div className="font-bold">{terms(o)}</div>
                <div className="text-muted">
                  {when(o.startsAt)} → {when(o.endsAt)}
                </div>
                {o.rejectReason && o.state === "rejected" && <div className="text-bad">Reason given: {o.rejectReason}</div>}
                {o.status === "approved" && (
                  <div>
                    {results(o)}
                    <span className="text-muted"> · {o.pushedAt ? `customers told ${when(o.pushedAt)}` : "no notification sent yet"}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
                {o.state === "waiting" && (
                  <>
                    <Btn kind="primary" busy={review.isPending && review.variables?.id === o.id} onClick={() => review.mutate({ id: o.id, approve: true })}>
                      <IconCheck size={14} /> Approve
                    </Btn>
                    <Btn kind="danger" onClick={() => setRejecting(o)}>
                      Reject
                    </Btn>
                  </>
                )}
                {o.status === "approved" && o.state !== "ended" && (
                  <>
                    <Btn busy={toggle.isPending && toggle.variables?.id === o.id} onClick={() => toggle.mutate(o)}>
                      {o.isActive ? "Switch off" : "Switch on"}
                    </Btn>
                    <Btn
                      kind="danger"
                      busy={end.isPending && end.variables?.id === o.id}
                      onClick={() => {
                        if (window.confirm("End this offer now? It cannot be started again.")) end.mutate(o);
                      }}
                    >
                      End now
                    </Btn>
                  </>
                )}
                {o.state !== "ended" && (
                  <Btn onClick={() => setEditing(o)} className="ml-auto">
                    <IconEdit size={14} /> Change
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {q.data && list.length === 0 && (
        <div className="px-4 pt-3 md:px-6">
          <Empty>{filter === "waiting" ? "No offer is waiting for approval." : "No offers here."}</Empty>
        </div>
      )}

      {rejecting && (
        <Drawer
          title="Reject this offer"
          sub={`${rejecting.shopName} · ${shopOfferHeadline({ ...rejecting, product: null }).en}`}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <Btn onClick={() => setRejecting(null)}>Cancel</Btn>
              <Btn kind="danger" disabled={reason.trim().length < 3} busy={review.isPending} onClick={() => review.mutate({ id: rejecting.id, approve: false, reason: reason.trim() })}>
                Reject
              </Btn>
            </>
          }
        >
          <Field label="Why? The shop sees this." hint="For example: the discount is too big for this product.">
            <textarea className={`${inputCls} min-h-24`} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <div className="mt-3">
            <ErrorBox error={review.error} />
          </div>
        </Drawer>
      )}
      {editing && <Editor offer={editing === "new" ? null : editing} shops={q.data?.shops ?? []} onClose={() => setEditing(null)} onSaved={done} />}
    </div>
  );
}

function Editor({ offer, shops, onClose, onSaved }: { offer: ShopOffer | null; shops: Feed["shops"]; onClose: () => void; onSaved: () => void }) {
  const today = istDay(new Date());
  const [dealerId, setDealerId] = useState(offer?.dealerId ?? "");
  const [kind, setKind] = useState<ShopOfferKind>(offer?.kind ?? "price");
  const [productId, setProductId] = useState(offer?.productId ?? "");
  const [scope, setScope] = useState<ShopOfferScope>(offer?.scope ?? "product");
  const [productIds, setProductIds] = useState<string[]>(offer?.productIds ?? []);
  const [categoryId, setCategoryId] = useState(offer?.category?.id ?? "");
  const [find, setFind] = useState("");
  const [paidBy, setPaidBy] = useState<"shop" | "app">(offer?.paidBy ?? "shop");
  const [mix, setMix] = useState(offer?.mix ?? false);
  const [freeProductId, setFreeProductId] = useState(offer?.freeProductId ?? "");
  const [color, setColor] = useState<ShopOfferColor | null>(offer?.color ?? null);
  const [banner, setBanner] = useState<File | null>(null);
  const [noBanner, setNoBanner] = useState(false);
  const bannerInput = useRef<HTMLInputElement>(null);
  const bannerUrl = useMemo(() => (banner ? URL.createObjectURL(banner) : null), [banner]);
  const appPays = paidBy === "app";
  const [pct, setPct] = useState(offer?.pct ? String(offer.pct) : "");
  const [buyQty, setBuyQty] = useState(String(offer?.buyQty ?? 1));
  const [freeQty, setFreeQty] = useState(String(offer?.freeQty ?? 1));
  const [minOrder, setMinOrder] = useState(offer?.minOrder ? String(offer.minOrder) : "");
  const [maxDiscount, setMaxDiscount] = useState(offer?.maxDiscount ? String(offer.maxDiscount) : "");
  const [validDays, setValidDays] = useState(String(offer?.validDays ?? 7));
  const [from, setFrom] = useState(offer ? istDay(new Date(offer.startsAt)) : today);
  const [till, setTill] = useState(offer ? istDay(new Date(offer.endsAt)) : istDay(new Date(Date.now() + 6 * 86_400_000)));

  const listings = useQuery<Listing[]>({ queryKey: ["admin", "store-products", dealerId], queryFn: () => api(`/admin/catalog/stores/${dealerId}/products`), enabled: !!dealerId });
  const onSale = useMemo(() => (listings.data ?? []).filter((l) => l.is_active), [listings.data]);
  const picked = onSale.find((l) => l.master_product_id === productId);
  const needsProduct = kind !== "next_order";
  // Price and buy-get-free offers can cover one product, several, or a whole category.
  const wide = kind === "price" || kind === "bogo";
  const sc: ShopOfferScope = wide ? scope : "product";
  const cats = useQuery<Category[]>({ queryKey: ["catalog", "categories"], queryFn: () => api("/admin/catalog/categories?vertical=grocery"), enabled: wide });
  /** Categories this shop sells in; a parent stands for its sub-categories too. */
  const catOptions = useMemo(() => {
    const all = cats.data ?? [];
    const own = new Map<string, number>();
    for (const l of onSale) if (l.product.category_id) own.set(l.product.category_id, (own.get(l.product.category_id) ?? 0) + 1);
    const out: { id: string; name: string; n: number; ids: string[] }[] = [];
    for (const top of all.filter((k) => !k.parent_id)) {
      const kids = all.filter((k) => k.parent_id === top.id && own.has(k.id));
      const n = (own.get(top.id) ?? 0) + kids.reduce((s, k) => s + own.get(k.id)!, 0);
      if (!n) continue;
      if (own.has(top.id) || kids.length > 1) out.push({ id: top.id, name: top.name, n, ids: [top.id, ...kids.map((k) => k.id)] });
      for (const k of kids) out.push({ id: k.id, name: `${top.name} › ${k.name}`, n: own.get(k.id)!, ids: [k.id] });
    }
    return out;
  }, [cats.data, onSale]);
  const cat = catOptions.find((o) => o.id === categoryId);
  const covered = useMemo(
    () => (sc === "product" ? (picked ? [picked] : []) : sc === "products" ? onSale.filter((l) => productIds.includes(l.master_product_id)) : cat ? onSale.filter((l) => l.product.category_id && cat.ids.includes(l.product.category_id)) : []),
    [sc, picked, onSale, productIds, cat],
  );
  const shown = useMemo(() => {
    const s = find.trim().toLowerCase();
    return s ? onSale.filter((l) => l.product.name.toLowerCase().includes(s)) : onSale;
  }, [onSale, find]);

  // Price offer: the cut comes off the printed price; whoever pays for the offer takes all of it.
  const priceAt = (l: Listing) => {
    const base = Number(l.mrp ?? l.product.mrp ?? l.selling_price);
    const offerPrice = Math.round((base * (100 - Number(pct))) / 100);
    const shopGets = appPays ? Number(l.shop_price) : Number(l.shop_price) - (Number(l.selling_price) - offerPrice);
    return { usual: Number(l.selling_price), offerPrice, shopGets, bad: offerPrice >= Number(l.selling_price) ? "This is not lower than today's price. Give a bigger discount." : shopGets <= 0 ? "The shop would get nothing. Give a smaller discount." : null };
  };
  const preview = useMemo(() => (kind === "price" && sc === "product" && picked && Number(pct) ? priceAt(picked) : null), [kind, sc, picked, pct, appPays]);
  /** Many products: how many get cheaper, and the first chosen one that cannot take the discount. */
  const spread = useMemo(() => {
    if (kind !== "price" || sc === "product" || !Number(pct) || !covered.length) return null;
    const bad = covered.find((l) => priceAt(l).bad);
    const fits = covered.filter((l) => !priceAt(l).bad).length;
    return { fits, total: covered.length, bad: sc === "products" && bad ? `${bad.product.name}: ${priceAt(bad).bad}` : !fits ? "At this discount no product gets a lower price the shop can give." : null };
  }, [kind, sc, covered, pct, appPays]);

  const save = useMutation({
    mutationFn: async () => {
      const num = (v: string) => (v.trim() ? Number(v) : null);
      const body = {
        kind,
        dealerId: offer ? undefined : dealerId,
        paidBy,
        masterProductId: needsProduct && sc === "product" ? productId || null : null,
        scope: sc,
        productIds: sc === "products" ? covered.map((l) => l.master_product_id) : null,
        categoryId: sc === "category" ? categoryId || null : null,
        pct: kind === "price" || kind === "next_order" ? num(pct) : null,
        buyQty: kind === "bogo" ? num(buyQty) : null,
        mix: kind === "bogo" && sc !== "product" && mix,
        freeProductId: kind === "bogo" && sc !== "product" && mix ? freeProductId || null : null,
        color,
        freeQty: kind === "bogo" || kind === "free_gift" ? num(freeQty) : null,
        minOrder: kind === "free_gift" || kind === "next_order" ? num(minOrder) : null,
        maxDiscount: kind === "next_order" ? num(maxDiscount) : null,
        validDays: kind === "next_order" ? num(validDays) : null,
        // Keep the saved start when the day is unchanged, so a running offer is not restarted.
        startsAt: offer && from === istDay(new Date(offer.startsAt)) ? offer.startsAt : from === today ? new Date().toISOString() : `${from}T00:00:00+05:30`,
        endsAt: `${till}T23:59:59+05:30`,
      };
      const saved = await api<{ id: string }>(offer ? `/admin/shop-offers/${offer.id}` : "/admin/shop-offers", { method: "POST", body });
      if (banner) await upload(`/admin/shop-offers/${saved.id}/image`, banner);
      else if (noBanner && offer?.bannerPath) await api(`/admin/shop-offers/${saved.id}/image`, { method: "DELETE" });
      return saved;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const ready = !!dealerId && (!needsProduct || (sc === "product" ? !!picked : covered.length > 0)) && !preview?.bad && !spread?.bad && till >= from && (!(kind === "bogo" && sc !== "product" && mix) || onSale.some((l) => l.master_product_id === freeProductId));
  const numCls = `${inputCls} w-28`;

  return (
    <Drawer
      title={offer ? "Change the offer" : "Offer for a shop"}
      sub={offer ? offer.shopName : "An offer you make is approved at once. Choose who pays for it."}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!ready} busy={save.isPending} onClick={() => save.mutate()}>
            {offer ? "Save" : "Make it live"}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        {!offer && (
          <Field label="Shop">
            <Select
              value={dealerId}
              onChange={(v) => {
                setDealerId(v);
                setProductId("");
                setProductIds([]);
                setCategoryId("");
              }}
              options={shops.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Choose the grocery shop"
            />
          </Field>
        )}
        <Field
          label="Who pays for it"
          hint={appPays ? "Thanjoz Mart pays: the shop is paid its usual amount, as if there were no offer." : "The shop pays: the cut, the free items or the coupon come off the shop's amount."}
        >
          <Segments
            value={paidBy}
            onChange={setPaidBy}
            items={[
              { id: "shop", label: "The shop" },
              { id: "app", label: "Thanjoz Mart" },
            ]}
          />
        </Field>
        <div>
          <div className="text-[11.5px] font-bold text-muted">Kind of offer</div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${kind === k ? "border-primary bg-primary/5 ring-2 ring-primary/15" : "border-line bg-surface"}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${LOOK[k].from}, ${LOOK[k].to})` }}>
                  {LOOK[k].mark}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-extrabold">{LOOK[k].label}</span>
                  <span className="block text-[11px] text-muted">{LOOK[k].note}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11.5px] font-bold text-muted">Card colour</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {SHOP_OFFER_COLOR_KEYS.map((k) => {
              const on = shopOfferColorKey(kind, color) === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  aria-pressed={on}
                  title={k}
                  onClick={() => setColor(k)}
                  className={`h-8 w-8 rounded-full transition ${on ? "ring-2 ring-ink ring-offset-2" : "ring-1 ring-line"}`}
                  style={{ background: `linear-gradient(135deg, ${SHOP_OFFER_COLORS[k].from}, ${SHOP_OFFER_COLORS[k].to})` }}
                />
              );
            })}
          </div>
          <div className="mt-1 text-[11px] text-muted">The colour of the offer card customers see. The sticker on it takes the same colour.</div>
        </div>

        {wide && (
          <div>
            <div className="text-[11.5px] font-bold text-muted">Offer on</div>
            <div className="mt-1">
              <Segments
                value={sc}
                onChange={setScope}
                items={[
                  { id: "product", label: "One product" },
                  { id: "products", label: "Several products" },
                  { id: "category", label: "A category" },
                ]}
              />
            </div>
          </div>
        )}
        {sc === "category" && (
          <Field label="Category" hint={!dealerId ? "Choose the shop first." : cat ? `${cat.n} ${cat.n === 1 ? "product" : "products"} of this shop today. Products added later get the offer too.` : "Only categories this shop sells in are listed."}>
            <Select value={cat ? categoryId : ""} onChange={setCategoryId} options={catOptions.map((o) => ({ value: o.id, label: o.name, note: `${o.n} ${o.n === 1 ? "product" : "products"}` }))} placeholder="Choose a category" />
          </Field>
        )}
        {sc === "products" && (
          <Field label={`Products${covered.length ? ` · ${covered.length} chosen` : ""}`} hint={!dealerId ? "Choose the shop first." : listings.isLoading ? "Loading the shop's products…" : undefined}>
            <input className={inputCls} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search the shop's products" />
            <div className="mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-line">
              {shown.map((l) => {
                const on = productIds.includes(l.master_product_id);
                return (
                  <label key={l.master_product_id} className={`flex cursor-pointer items-start gap-2 border-b border-line px-2.5 py-1.5 text-[12.5px] last:border-b-0 ${on ? "bg-primary/5" : ""}`}>
                    <input type="checkbox" className="mt-0.5 accent-[#E4461F]" checked={on} onChange={() => setProductIds((ids) => (on ? ids.filter((i) => i !== l.master_product_id) : [...ids, l.master_product_id]))} />
                    <span className="min-w-0">
                      <span className="block font-bold">
                        {l.product.name}
                        {l.product.pack_size ? ` · ${l.product.pack_size}` : ""}
                      </span>
                      <span className="block text-[11px] text-muted">
                        Customer {inr(l.selling_price)} · shop {inr(l.shop_price)}
                        {l.mrp ?? l.product.mrp ? ` · MRP ${inr(Number(l.mrp ?? l.product.mrp))}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
              {dealerId && listings.data && !shown.length && <div className="px-2.5 py-2 text-[12px] text-muted">Nothing matches.</div>}
            </div>
          </Field>
        )}
        {needsProduct && sc === "product" && (
          <Field label={kind === "free_gift" ? "The free item" : "Product"} hint={!dealerId ? "Choose the shop first." : listings.isLoading ? "Loading the shop's products…" : undefined}>
            <Select
              value={picked ? productId : ""}
              onChange={setProductId}
              options={onSale.map((l) => ({
                value: l.master_product_id,
                label: `${l.product.name}${l.product.pack_size ? ` · ${l.product.pack_size}` : ""}`,
                note: `Customer ${inr(l.selling_price)} · shop ${inr(l.shop_price)}${l.mrp ?? l.product.mrp ? ` · MRP ${inr(Number(l.mrp ?? l.product.mrp))}` : ""}`,
              }))}
              placeholder="Choose a product the shop sells"
            />
          </Field>
        )}

        {kind === "price" && (
          <>
            <Field label="Discount %" hint="Taken off the MRP (or today's price when there is no MRP).">
              <input className={numCls} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="20" />
            </Field>
            {preview && (
              <div className={`rounded-xl border px-3 py-2 text-[12.5px] ${preview.bad ? "border-bad/40 bg-bad/5" : "border-line bg-surface"}`}>
                <div>
                  Customer pays <b>{inr(preview.offerPrice)}</b> <span className="text-muted line-through">{inr(preview.usual)}</span>
                </div>
                <div>
                  Shop gets <b>{inr(preview.shopGets)}</b> <span className="text-muted">(usually {inr(Number(picked?.shop_price ?? 0))})</span>
                </div>
                {preview.bad && <div className="mt-1 font-bold text-bad">{preview.bad}</div>}
              </div>
            )}
            {spread && (
              <div className={`rounded-xl border px-3 py-2 text-[12.5px] ${spread.bad ? "border-bad/40 bg-bad/5" : "border-line bg-surface"}`}>
                <div>
                  <b>
                    {spread.fits} of {spread.total}
                  </b>{" "}
                  products get a lower price.{spread.fits < spread.total && sc === "category" ? " The others stay at today's price." : ""}
                </div>
                {spread.bad && <div className="mt-1 font-bold text-bad">{spread.bad}</div>}
              </div>
            )}
          </>
        )}
        {kind === "bogo" && (
          <div className="flex flex-wrap gap-3">
            <Field label="Customer buys">
              <input className={numCls} inputMode="numeric" value={buyQty} onChange={(e) => setBuyQty(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Gets free">
              <input className={numCls} inputMode="numeric" value={freeQty} onChange={(e) => setFreeQty(e.target.value.replace(/\D/g, ""))} />
            </Field>
            {sc !== "product" && (
              <Field label="How to count" hint={mix ? `Any ${buyQty || "…"} of these products together bring ${freeQty || "…"} of the free item you choose below.` : `${buyQty || "…"} of the same product bring ${freeQty || "…"} more of that product free.`}>
                <Segments
                  value={mix ? "any" : "same"}
                  onChange={(v) => setMix(v === "any")}
                  items={[
                    { id: "same", label: "Same product" },
                    { id: "any", label: "Any mix" },
                  ]}
                />
              </Field>
            )}
          </div>
        )}
        {kind === "bogo" && sc !== "product" && mix && (
          <Field label="The free item" hint={!dealerId ? "Choose the shop first." : "The customer gets this product free, whichever of the offer's products they mix."}>
            <Select
              value={onSale.some((l) => l.master_product_id === freeProductId) ? freeProductId : ""}
              onChange={setFreeProductId}
              options={onSale.map((l) => ({
                value: l.master_product_id,
                label: `${l.product.name}${l.product.pack_size ? ` · ${l.product.pack_size}` : ""}`,
                note: `Customer ${inr(l.selling_price)} · shop ${inr(l.shop_price)}`,
              }))}
              placeholder="Choose the product given free"
            />
          </Field>
        )}
        {kind === "free_gift" && (
          <div className="flex flex-wrap gap-3">
            <Field label="How many free">
              <input className={numCls} inputMode="numeric" value={freeQty} onChange={(e) => setFreeQty(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="On orders of ₹ or more">
              <input className={numCls} inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/\D/g, ""))} placeholder="500" />
            </Field>
          </div>
        )}
        {kind === "next_order" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order today of ₹ or more">
              <input className={inputCls} inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/\D/g, ""))} placeholder="300" />
            </Field>
            <Field label="% off the next order">
              <input className={inputCls} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ""))} placeholder="50" />
            </Field>
            <Field label="Saves at most ₹">
              <input className={inputCls} inputMode="numeric" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value.replace(/\D/g, ""))} placeholder="100" />
            </Field>
            <Field label="Coupon lasts (days)">
              <input className={inputCls} inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <DatePicker value={from} onChange={setFrom} min={offer ? undefined : today} />
          </Field>
          <Field label="Last day" error={till < from ? "Must be on or after the start" : null}>
            <DatePicker value={till} onChange={setTill} min={from} />
          </Field>
        </div>
        <Field label="Banner picture (optional)" hint="Shown on the offer card in the customer app. Without one, the product's photo is used. A square picture works best.">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2">
            {(() => {
              const url = bannerUrl ?? (noBanner ? null : imageUrl(offer?.bannerPath, true));
              return url ? <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-line/50 text-[10.5px] font-bold text-muted">Product photo</div>;
            })()}
            <input
              ref={bannerInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) (setBanner(f), setNoBanner(false));
                e.target.value = "";
              }}
            />
            <Btn onClick={() => bannerInput.current?.click()}>{banner || (offer?.bannerPath && !noBanner) ? "Change" : "Choose picture"}</Btn>
            {(banner || (offer?.bannerPath && !noBanner)) && (
              <Btn
                onClick={() => {
                  setBanner(null);
                  setNoBanner(true);
                }}
              >
                Remove
              </Btn>
            )}
          </div>
        </Field>
        <ErrorBox error={save.error} />
      </div>
    </Drawer>
  );
}
