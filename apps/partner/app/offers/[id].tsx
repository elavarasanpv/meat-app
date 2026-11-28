import { useEffect, useMemo, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { SHOP_OFFER_COLORS, SHOP_OFFER_COLOR_KEYS, shopOfferColorKey, type ShopOfferColor } from "@thanjozmart/shared";
import { OFFER_LOOK, OfferTicket } from "@/components/OfferTicket";
import { useCatalogCategories, useMyListings, useOfferActions, useShopOffers, type MyListing, type OfferKind, type OfferScope, type ShopOfferInput } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { productImage } from "@/lib/images";
import { PhotoError, pickProductPhoto, type PickedPhoto } from "@/lib/productPhoto";
import { Btn, Chip, Txt, useC } from "@/ui";

const KINDS: OfferKind[] = ["price", "bogo", "free_gift", "next_order"];
const RUN_DAYS = [1, 3, 7, 15, 30];
const IST = 5.5 * 3600_000;
const DAY = 24 * 3600_000;

/** Midnight (India time) of the day `ms` falls on, as a UTC instant. */
const istMidnight = (ms: number) => Math.floor((ms + IST) / DAY) * DAY - IST;
const whole = (s: string) => {
  const n = Number(s.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};
const digits = (s: string) => s.replace(/[^0-9]/g, "");
const show = (n: number | null | undefined) => (n == null ? "" : String(Number(n)));

type Errors = Partial<Record<"product" | "pct" | "buy" | "free" | "freeItem" | "minOrder" | "maxDiscount" | "validDays", string>>;
const SCOPES: { key: OfferScope; label: TKey }[] = [{ key: "product", label: "offerOne" }, { key: "products", label: "offerMany" }, { key: "category", label: "offerCat" }];
/** A price offer on one listing: the % is off the MRP; the shop's amount drops by the same rupees as the customer's price. */
const priceAt = (l: MyListing, pct: number) => {
  const usual = Number(l.selling_price);
  const base = Number(l.mrp ?? usual);
  const offer = Math.round((base * (100 - pct)) / 100);
  return { usual, offer, shopUsual: Number(l.shop_price), shopGets: Number(l.shop_price) - (usual - offer) };
};

function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string } & React.ComponentProps<typeof TextInput>) {
  const c = useC();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt bold size={14}>{label}</Txt>
      <TextInput
        allowFontScaling={false}
        placeholderTextColor={c.muted}
        keyboardType="number-pad"
        {...input}
        onChangeText={(s) => input.onChangeText?.(digits(s))}
        style={{ minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: error ? c.danger : c.border, backgroundColor: c.surface, fontFamily: "Manrope_700Bold", fontSize: 17, color: c.ink }}
      />
      {error ? <Txt size={13} color={c.danger}>{error}</Txt> : hint ? <Txt size={13} muted>{hint}</Txt> : null}
    </View>
  );
}

/** Make an offer, or change one. `id` is "new" or the offer id. Saving sends it for approval. */
export default function OfferForm() {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const offers = useShopOffers(!isNew);
  const listings = useMyListings();
  const cats = useCatalogCategories();
  const act = useOfferActions();
  const existing = isNew ? undefined : offers.data?.find((o) => o.id === id);

  const [kind, setKind] = useState<OfferKind>("price");
  const [productId, setProductId] = useState<string | null>(null);
  const [scope, setScope] = useState<OfferScope>("product");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [pct, setPct] = useState("");
  const [buy, setBuy] = useState("1");
  const [mix, setMix] = useState(false);
  /** Any-mix offers: the product the customer gets free. */
  const [freeId, setFreeId] = useState<string | null>(null);
  const [pickingFree, setPickingFree] = useState(false);
  const [qFree, setQFree] = useState("");
  const [color, setColor] = useState<ShopOfferColor | null>(null);
  const [free, setFree] = useState("1");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [validDays, setValidDays] = useState("7");
  const [startsTomorrow, setStartsTomorrow] = useState(false);
  const [days, setDays] = useState(7);
  /** Editing: keep the offer's own dates until the shop picks new ones. */
  const [keepDates, setKeepDates] = useState(!isNew);
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [banner, setBanner] = useState<PickedPhoto | null>(null);
  const [noBanner, setNoBanner] = useState(false);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (loaded || !existing) return;
    setKind(existing.kind);
    setProductId(existing.productId);
    setScope(existing.scope ?? "product");
    setProductIds(existing.productIds ?? []);
    setCategoryId(existing.category?.id ?? null);
    setPct(show(existing.pct));
    if (existing.buyQty) setBuy(show(existing.buyQty));
    setMix(!!existing.mix);
    setFreeId(existing.freeProductId ?? null);
    setColor(existing.color ? shopOfferColorKey(existing.kind, existing.color) : null);
    if (existing.freeQty) setFree(show(existing.freeQty));
    setMinOrder(show(existing.minOrder));
    setMaxDiscount(show(existing.maxDiscount));
    if (existing.validDays) setValidDays(show(existing.validDays));
    setLoaded(true);
  }, [existing, loaded]);

  const active = useMemo(() => (listings.data ?? []).filter((l) => l.is_active), [listings.data]);
  const listing = productId ? (listings.data ?? []).find((l) => l.master_product_id === productId) : undefined;
  const nameOf = (l: MyListing) => (lang === "ta" && l.product.name_ta ? l.product.name_ta : l.product.name);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = s ? active.filter((l) => `${l.product.name} ${l.product.name_ta ?? ""} ${l.product.brand ?? ""}`.toLowerCase().includes(s)) : active;
    return rows.slice(0, 8);
  }, [active, q]);

  const freeItem = freeId ? active.find((l) => l.master_product_id === freeId) : undefined;
  const freeFound = useMemo(() => {
    const s = qFree.trim().toLowerCase();
    const rows = s ? active.filter((l) => `${l.product.name} ${l.product.name_ta ?? ""} ${l.product.brand ?? ""}`.toLowerCase().includes(s)) : active;
    return rows.slice(0, 8);
  }, [active, qFree]);

  const needsProduct = kind !== "next_order";
  // Price and buy-get-free offers can cover one product, several, or a whole category.
  const wide = kind === "price" || kind === "bogo";
  const sc: OfferScope = wide ? scope : "product";
  /** Categories the shop sells in: each sub-category, and a parent where it holds more than one of them. */
  const catOptions = useMemo(() => {
    const all = cats.data ?? [];
    const own = new Map<string, number>();
    for (const l of active) if (l.product.category_id) own.set(l.product.category_id, (own.get(l.product.category_id) ?? 0) + 1);
    const out: { id: string; name: string; n: number; ids: string[] }[] = [];
    const label = (k: { name: string; name_ta: string | null }) => (lang === "ta" && k.name_ta ? k.name_ta : k.name);
    for (const top of all.filter((k) => !k.parent_id)) {
      const kids = all.filter((k) => k.parent_id === top.id && own.has(k.id));
      const n = (own.get(top.id) ?? 0) + kids.reduce((s, k) => s + own.get(k.id)!, 0);
      if (!n) continue;
      if (own.has(top.id) || kids.length > 1) out.push({ id: top.id, name: label(top), n, ids: [top.id, ...kids.map((k) => k.id)] });
      for (const k of kids) out.push({ id: k.id, name: label(k), n: own.get(k.id)!, ids: [k.id] });
    }
    return out;
  }, [cats.data, active, lang]);
  const cat = catOptions.find((o) => o.id === categoryId);
  /** The listings the offer covers. */
  const covered = useMemo(() => {
    if (sc === "product") return listing ? [listing] : [];
    if (sc === "products") return productIds.map((i) => (listings.data ?? []).find((l) => l.master_product_id === i)).filter((l): l is MyListing => !!l);
    return cat ? active.filter((l) => l.product.category_id && cat.ids.includes(l.product.category_id)) : [];
  }, [sc, listing, productIds, listings.data, cat, active]);
  const manyFound = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = s ? active.filter((l) => `${l.product.name} ${l.product.name_ta ?? ""} ${l.product.brand ?? ""}`.toLowerCase().includes(s)) : active;
    // chosen ones stay on top, so the shop sees its list
    return [...rows.filter((l) => productIds.includes(l.master_product_id)), ...rows.filter((l) => !productIds.includes(l.master_product_id))].slice(0, s ? 30 : Math.max(12, productIds.length + 6));
  }, [active, q, productIds]);
  const toggle = (mid: string) => {
    setProductIds((ids) => (ids.includes(mid) ? ids.filter((i) => i !== mid) : [...ids, mid]));
    setErrors({});
  };
  const dates = useMemo(() => {
    if (keepDates && existing) return { startsAt: existing.startsAt, endsAt: existing.endsAt };
    const now = Date.now();
    const start = startsTomorrow ? istMidnight(now) + DAY : now;
    // ends at the close of the last day, India time
    const end = istMidnight(start) + days * DAY - 60_000;
    return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
  }, [keepDates, existing, startsTomorrow, days]);
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

  const p = whole(pct);
  const price = useMemo(() => (kind === "price" && sc === "product" && listing && p && p <= 99 ? priceAt(listing, p) : null), [kind, sc, listing, p]);
  /** Price offer on many products: how many really get cheaper. */
  const cheaper = useMemo(() => {
    if (kind !== "price" || sc === "product" || !p || p > 99) return null;
    return covered.filter((l) => {
      const x = priceAt(l, p);
      return x.offer < x.usual && x.shopGets > 0;
    }).length;
  }, [kind, sc, covered, p]);

  const check = (): Errors => {
    const e: Errors = {};
    if (needsProduct && sc === "product" && !listing) e.product = t("offerErrPick");
    if (sc === "products" && !covered.length) e.product = t("offerErrPickMany");
    if (sc === "category" && !cat) e.product = t("offerPickCat");
    if (kind === "price") {
      if (!p || p > 99) e.pct = t("offerErrPct");
      else if (sc === "category") {
        if (cat && !cheaper) e.pct = t("offerErrNone");
      } else {
        // each chosen product must be able to take the discount
        for (const l of covered) {
          const x = priceAt(l, p);
          const bad = x.offer >= x.usual ? t("offerErrNotLower") : x.shopGets <= 0 ? t("offerErrTooMuch") : null;
          if (!bad) continue;
          e.pct = covered.length > 1 ? `${nameOf(l)}: ${bad}` : bad;
          break;
        }
      }
    }
    if (kind === "bogo") {
      const b = whole(buy);
      const f = whole(free);
      if (!b || b > 10) e.buy = t("offerErrQty");
      if (!f || f > 10) e.free = t("offerErrQty");
      if (sc !== "product" && mix && !freeItem) e.freeItem = t("offerErrFreeItem");
    }
    if (kind === "free_gift") {
      const f = whole(free);
      if (!f || f > 5) e.free = t("offerErrGiftQty");
      if (!whole(minOrder)) e.minOrder = t("offerErrAmount");
    }
    if (kind === "next_order") {
      if (!p || p > 100) e.pct = t("offerErrPct");
      if (!whole(minOrder)) e.minOrder = t("offerErrAmount");
      if (!whole(maxDiscount)) e.maxDiscount = t("offerErrAmount");
      const v = whole(validDays);
      if (!v || v > 60) e.validDays = t("offerErrDays");
    }
    return e;
  };
  const err = (k: keyof Errors) => errors[k];

  const pickBanner = async (from: "camera" | "gallery") => {
    setChoosing(true);
    try {
      const ph = await pickProductPhoto(from);
      if (ph) {
        setBanner(ph);
        setNoBanner(false);
      }
    } catch (x) {
      Alert.alert(t(x instanceof PhotoError && x.code === "denied" ? "cameraDenied" : x instanceof PhotoError ? "pErrPhotoBig" : "error"));
    } finally {
      setChoosing(false);
    }
  };
  const savedBanner = noBanner ? null : existing?.bannerPath ?? null;

  const save = async () => {
    const e = check();
    setErrors(e);
    setFailed(null);
    if (Object.keys(e).length) return;
    const input: ShopOfferInput = {
      kind,
      masterProductId: needsProduct && sc === "product" ? productId : null,
      scope: sc,
      productIds: sc === "products" ? covered.map((l) => l.master_product_id) : null,
      categoryId: sc === "category" ? categoryId : null,
      pct: kind === "price" || kind === "next_order" ? p : null,
      buyQty: kind === "bogo" ? whole(buy) : null,
      mix: kind === "bogo" && sc !== "product" && mix,
      freeProductId: kind === "bogo" && sc !== "product" && mix ? freeItem?.master_product_id ?? null : null,
      color,
      freeQty: kind === "bogo" || kind === "free_gift" ? whole(free) : null,
      minOrder: kind === "free_gift" || kind === "next_order" ? whole(minOrder) : null,
      maxDiscount: kind === "next_order" ? whole(maxDiscount) : null,
      validDays: kind === "next_order" ? whole(validDays) : null,
      ...dates,
    };
    setBusy(true);
    try {
      const saved = await act.save(input, isNew ? undefined : id);
      let pictureFailed = false;
      try {
        if (banner) await act.setBanner(saved.id, banner);
        else if (noBanner && existing?.bannerPath) await act.removeBanner(saved.id);
      } catch {
        pictureFailed = true;
      }
      await act.done();
      Alert.alert(t("offers"), t(pictureFailed ? "offerPicFailed" : "offerSent"));
      router.back();
    } catch (x) {
      setFailed(x instanceof Error && x.message ? x.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const facts = {
    kind,
    pct: p,
    buyQty: whole(buy),
    freeQty: whole(free),
    mix: kind === "bogo" && sc !== "product" && mix,
    color,
    minOrder: whole(minOrder),
    maxDiscount: whole(maxDiscount),
    product: needsProduct && sc === "product" && listing ? { name: listing.product.name, nameTa: listing.product.name_ta, imagePath: listing.product.image_path, packSize: listing.product.pack_size } : null,
    scope: sc,
    productIds: sc === "products" ? covered.map((l) => l.master_product_id) : null,
    category: sc === "category" && cat ? { name: cat.name, nameTa: null } : null,
    bannerUri: banner?.uri ?? null,
    bannerPath: savedBanner,
  };
  const shopPrice = listing ? Number(listing.shop_price) : 0;
  const cost =
    kind === "bogo" && sc !== "product" ? t("offerCostFree")
    : kind === "bogo" && listing && whole(free) ? `${t("offerYouGive")}: ₹${shopPrice * whole(free)!} ${t("offerPerSet")}`
    : kind === "free_gift" && listing && whole(free) ? `${t("offerYouGive")}: ₹${shopPrice * whole(free)!} ${t("offerPerGift")}`
    : kind === "next_order" && whole(maxDiscount) ? `${t("offerYouGive")}: ${t("offerUpTo")} ₹${whole(maxDiscount)} ${t("offerPerCoupon")}`
    : null;

  const missing = !isNew && offers.isSuccess && !existing;
  const card = { padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 14 } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView edges={["top"]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="chevronLeft" color={c.ink} size={26} />
          </Pressable>
          <Txt bold size={22} style={{ flex: 1 }}>{t(isNew ? "offerNew" : "offerEdit")}</Txt>
        </View>
      </SafeAreaView>
      {missing ? (
        <Txt muted style={{ textAlign: "center", margin: 32 }}>{t("error")}</Txt>
      ) : !loaded ? null : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {/* kind */}
            <View style={{ gap: 8 }}>
              <Txt bold size={14}>{t("offerKind")}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {KINDS.map((k) => {
                  const on = kind === k;
                  const look = OFFER_LOOK[k];
                  return (
                    <Pressable key={k} onPress={() => { setKind(k); setErrors({}); setFailed(null); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ width: "48%", flexGrow: 1, padding: 12, borderRadius: 18, borderWidth: 2, borderColor: on ? look.from : c.border, backgroundColor: c.surface, gap: 6 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: look.from, alignItems: "center", justifyContent: "center" }}>
                        <Txt bold size={k === "bogo" ? 13 : 17} color="#FFFFFF">{look.mark}</Txt>
                      </View>
                      <Txt bold size={14}>{t(`ok_${k}` as TKey)}</Txt>
                      <Txt size={12} muted>{t(`ok_${k}_d` as TKey)}</Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* card colour */}
            <View style={{ gap: 8 }}>
              <Txt bold size={14}>{t("offerColor")}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {SHOP_OFFER_COLOR_KEYS.map((k) => {
                  const on = shopOfferColorKey(kind, color) === k;
                  return (
                    <Pressable key={k} onPress={() => setColor(k)} hitSlop={4} accessibilityRole="button" accessibilityLabel={k} accessibilityState={{ selected: on }}
                      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: on ? c.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: SHOP_OFFER_COLORS[k].from }} />
                    </Pressable>
                  );
                })}
              </View>
              <Txt size={12} muted>{t("offerColorHint")}</Txt>
            </View>

            {/* product */}
            {needsProduct ? (
              <View style={card}>
                <Txt bold size={14}>{t(kind === "free_gift" ? "offerGiftProduct" : wide ? "offerOn" : "offerProduct")}</Txt>
                {wide ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {SCOPES.map((s) => <Chip key={s.key} label={t(s.label)} selected={sc === s.key} onPress={() => { setScope(s.key); setQ(""); setErrors({}); setFailed(null); }} />)}
                  </View>
                ) : null}
                {sc === "category" ? (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {catOptions.map((o) => <Chip key={o.id} label={`${o.name} (${o.n})`} selected={categoryId === o.id} onPress={() => { setCategoryId(o.id); setErrors({}); }} />)}
                    </View>
                    {cats.isSuccess && listings.isSuccess && !catOptions.length ? <Txt size={13} muted>{t("stockNoMatch")}</Txt> : null}
                    {cat ? <Txt size={13} muted>{t("offerCatNote")}</Txt> : null}
                    {err("product") ? <Txt size={13} color={c.danger}>{err("product")}</Txt> : null}
                  </View>
                ) : sc === "products" ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      allowFontScaling={false}
                      value={q}
                      onChangeText={setQ}
                      placeholder={t("offerSearch")}
                      placeholderTextColor={c.muted}
                      style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: err("product") ? c.danger : c.border, backgroundColor: c.ground, fontFamily: "Manrope_500Medium", fontSize: 15, color: c.ink }}
                    />
                    {productIds.length ? <Txt bold size={13} color={c.primary}>{covered.length} {t("offerChosen")}</Txt> : null}
                    {manyFound.map((l) => {
                      const on = productIds.includes(l.master_product_id);
                      return (
                        <Pressable key={l.master_product_id} onPress={() => toggle(l.master_product_id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 14, backgroundColor: on ? c.tintSoft : pressed ? c.surface2 : c.surface })}>
                          <Thumb l={l} />
                          <View style={{ flex: 1 }}>
                            <Txt bold size={14}>{nameOf(l)}</Txt>
                            <Txt size={12} muted>{[l.product.pack_size, `₹${Number(l.selling_price)}`].filter(Boolean).join(" · ")}</Txt>
                          </View>
                          <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.surface, alignItems: "center", justifyContent: "center" }}>
                            {on ? <Icon name="check" color="#FFFFFF" size={18} strokeWidth={3} /> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                    {listings.isSuccess && !manyFound.length ? <Txt size={13} muted>{t("stockNoMatch")}</Txt> : null}
                    {err("product") ? <Txt size={13} color={c.danger}>{err("product")}</Txt> : null}
                  </View>
                ) : listing && !picking ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Thumb l={listing} />
                    <View style={{ flex: 1 }}>
                      <Txt bold size={15}>{nameOf(listing)}</Txt>
                      <Txt size={13} muted>{[listing.product.pack_size, listing.mrp ? `MRP ₹${Number(listing.mrp)}` : null, `₹${Number(listing.selling_price)}`].filter(Boolean).join(" · ")}</Txt>
                    </View>
                    <Pressable onPress={() => setPicking(true)} hitSlop={8} accessibilityRole="button"><Txt bold size={14} color={c.primary}>{t("offerChange")}</Txt></Pressable>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      allowFontScaling={false}
                      value={q}
                      onChangeText={setQ}
                      placeholder={t("offerSearch")}
                      placeholderTextColor={c.muted}
                      style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: err("product") ? c.danger : c.border, backgroundColor: c.ground, fontFamily: "Manrope_500Medium", fontSize: 15, color: c.ink }}
                    />
                    {found.map((l) => (
                      <Pressable key={l.master_product_id} onPress={() => { setProductId(l.master_product_id); setPicking(false); setQ(""); setErrors({}); }}
                        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 14, backgroundColor: pressed ? c.surface2 : c.surface })}>
                        <Thumb l={l} />
                        <View style={{ flex: 1 }}>
                          <Txt bold size={14}>{nameOf(l)}</Txt>
                          <Txt size={12} muted>{[l.product.pack_size, `₹${Number(l.selling_price)}`].filter(Boolean).join(" · ")}</Txt>
                        </View>
                      </Pressable>
                    ))}
                    {listings.isSuccess && !found.length ? <Txt size={13} muted>{t("stockNoMatch")}</Txt> : null}
                    {err("product") ? <Txt size={13} color={c.danger}>{err("product")}</Txt> : null}
                  </View>
                )}
              </View>
            ) : null}

            {/* the numbers */}
            <View style={card}>
              {kind === "price" ? (
                <>
                  <Field label={t("offerPct")} hint={t("offerPctHint")} value={pct} onChangeText={setPct} maxLength={2} error={err("pct")} />
                  {price && !err("pct") ? (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: c.tintSoft, gap: 2 }}>
                        <Txt size={12} muted>{t("offerCustomerPays")}</Txt>
                        <Txt bold size={20} color={c.primary}>₹{price.offer}</Txt>
                        <Txt size={12} muted>{t("offerWas")} ₹{price.usual}</Txt>
                      </View>
                      <View style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: c.successBg, gap: 2 }}>
                        <Txt size={12} muted>{t("offerYouGet")}</Txt>
                        <Txt bold size={20} color={c.success}>₹{price.shopGets}</Txt>
                        <Txt size={12} muted>{t("offerWas")} ₹{price.shopUsual}</Txt>
                      </View>
                    </View>
                  ) : null}
                  {cheaper != null && covered.length && !err("pct") ? (
                    <View style={{ padding: 12, borderRadius: 14, backgroundColor: cheaper ? c.successBg : c.surface2, gap: 2 }}>
                      <Txt bold size={15} color={cheaper ? c.success : c.ink}>{cheaper} / {covered.length} {t("offerCheaperOf")}</Txt>
                      {cheaper < covered.length && sc === "category" ? <Txt size={13} muted>{t("offerRestSame")}</Txt> : null}
                    </View>
                  ) : null}
                </>
              ) : null}
              {kind === "bogo" ? (
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Field label={t("offerBuy")} value={buy} onChangeText={setBuy} maxLength={2} error={err("buy")} />
                  <Field label={t("offerFree")} value={free} onChangeText={setFree} maxLength={2} error={err("free")} />
                </View>
              ) : null}
              {kind === "bogo" && sc !== "product" ? (
                <View style={{ gap: 8 }}>
                  <Txt bold size={14}>{t("offerCount")}</Txt>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <Chip label={t("offerCountSame")} selected={!mix} onPress={() => setMix(false)} />
                    <Chip label={t("offerCountAny")} selected={mix} onPress={() => setMix(true)} />
                  </View>
                  <Txt size={13} muted>{t(mix ? "offerCountAnyHint" : "offerCountSameHint")}</Txt>
                </View>
              ) : null}
              {kind === "bogo" && sc !== "product" && mix ? (
                <View style={{ gap: 8 }}>
                  <Txt bold size={14}>{t("offerFreeItem")}</Txt>
                  {freeItem && !pickingFree ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Thumb l={freeItem} />
                      <View style={{ flex: 1 }}>
                        <Txt bold size={15}>{nameOf(freeItem)}</Txt>
                        <Txt size={13} muted>{[freeItem.product.pack_size, `₹${Number(freeItem.selling_price)}`].filter(Boolean).join(" · ")}</Txt>
                      </View>
                      <Pressable onPress={() => setPickingFree(true)} hitSlop={8} accessibilityRole="button"><Txt bold size={14} color={c.primary}>{t("offerChange")}</Txt></Pressable>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        allowFontScaling={false}
                        value={qFree}
                        onChangeText={setQFree}
                        placeholder={t("offerSearch")}
                        placeholderTextColor={c.muted}
                        style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: err("freeItem") ? c.danger : c.border, backgroundColor: c.ground, fontFamily: "Manrope_500Medium", fontSize: 15, color: c.ink }}
                      />
                      {freeFound.map((l) => (
                        <Pressable key={l.master_product_id} onPress={() => { setFreeId(l.master_product_id); setPickingFree(false); setQFree(""); setErrors({}); }}
                          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 14, backgroundColor: pressed ? c.surface2 : c.surface })}>
                          <Thumb l={l} />
                          <View style={{ flex: 1 }}>
                            <Txt bold size={14}>{nameOf(l)}</Txt>
                            <Txt size={12} muted>{[l.product.pack_size, `₹${Number(l.selling_price)}`].filter(Boolean).join(" · ")}</Txt>
                          </View>
                        </Pressable>
                      ))}
                      {listings.isSuccess && !freeFound.length ? <Txt size={13} muted>{t("stockNoMatch")}</Txt> : null}
                    </View>
                  )}
                  {err("freeItem") ? <Txt size={13} color={c.danger}>{err("freeItem")}</Txt> : null}
                </View>
              ) : null}
              {kind === "free_gift" ? (
                <>
                  <Field label={t("offerMinOrder")} hint={t("offerMinOrderHint")} value={minOrder} onChangeText={setMinOrder} maxLength={5} error={err("minOrder")} />
                  <Field label={t("offerGiftQty")} value={free} onChangeText={setFree} maxLength={1} error={err("free")} />
                </>
              ) : null}
              {kind === "next_order" ? (
                <>
                  <Field label={t("offerMinOrder")} hint={t("offerMinOrderHint")} value={minOrder} onChangeText={setMinOrder} maxLength={5} error={err("minOrder")} />
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Field label={t("offerPct")} value={pct} onChangeText={setPct} maxLength={3} error={err("pct")} />
                    <Field label={t("offerMaxDiscount")} value={maxDiscount} onChangeText={setMaxDiscount} maxLength={4} error={err("maxDiscount")} />
                  </View>
                  <Field label={t("offerValidDays")} value={validDays} onChangeText={setValidDays} maxLength={2} error={err("validDays")} />
                </>
              ) : null}
              {cost ? <Txt size={13} muted>{cost}</Txt> : null}
            </View>

            {/* dates */}
            <View style={card}>
              <View style={{ gap: 8 }}>
                <Txt bold size={14}>{t("offerStarts")}</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {existing ? <Chip label={t("offerKeepDates")} selected={keepDates} onPress={() => setKeepDates(true)} /> : null}
                  <Chip label={t("offerNow")} selected={!keepDates && !startsTomorrow} onPress={() => { setKeepDates(false); setStartsTomorrow(false); }} />
                  <Chip label={t("offerTomorrow")} selected={!keepDates && startsTomorrow} onPress={() => { setKeepDates(false); setStartsTomorrow(true); }} />
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <Txt bold size={14}>{t("offerRunsFor")}</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {RUN_DAYS.map((d) => <Chip key={d} label={`${d} ${t(d === 1 ? "offerDay" : "offerDays")}`} selected={!keepDates && days === d} onPress={() => { setKeepDates(false); setDays(d); }} />)}
                </View>
              </View>
              <Txt size={13} muted>{dayLabel(dates.startsAt)} {t("offerTill")} {dayLabel(dates.endsAt)}</Txt>
            </View>

            {/* the offer's own picture */}
            <View style={card}>
              <View style={{ gap: 4 }}>
                <Txt bold size={14}>{t("offerPic")}</Txt>
                <Txt size={13} muted>{t("offerPicHint")}</Txt>
              </View>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                <View style={{ width: 96, height: 96, borderRadius: 18, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.ground, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {banner || savedBanner ? <Image source={banner ? { uri: banner.uri } : productImage("", savedBanner)!} resizeMode="cover" style={{ width: 96, height: 96 }} /> : <Icon name="camera" color={c.muted} size={30} />}
                </View>
                <View style={{ flex: 1, gap: 10 }}>
                  <Btn label={t("pCamera")} icon="camera" kind="outline" onPress={() => pickBanner("camera")} disabled={choosing || busy} />
                  <Btn label={t("pGallery")} kind="soft" onPress={() => pickBanner("gallery")} disabled={choosing || busy} />
                </View>
              </View>
              {banner || savedBanner ? (
                <Pressable onPress={() => { setBanner(null); setNoBanner(true); }} hitSlop={8} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
                  <Txt bold size={14} color={c.danger}>{t("offerPicRemove")}</Txt>
                </Pressable>
              ) : null}
            </View>

            {/* preview */}
            <View style={{ gap: 8 }}>
              <Txt bold size={14}>{t("offerPreview")}</Txt>
              <OfferTicket o={facts} sub={`${t("offerTill")} ${dayLabel(dates.endsAt)}`} />
              <Txt size={13} muted>{t("offerWaitNote")}</Txt>
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: c.ground, borderTopWidth: 1, borderTopColor: c.border }}>
            {failed ? <Txt size={14} color={c.danger} style={{ textAlign: "center" }}>{failed}</Txt> : null}
            <Btn label={t("offerSend")} big kind="success" onPress={save} loading={busy} />
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function Thumb({ l }: { l: MyListing }) {
  const c = useC();
  const img = productImage(l.product.name, l.product.image_path);
  return (
    <View style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {img ? <Image source={img} resizeMode="contain" style={{ width: 42, height: 42 }} /> : <Icon name="box" color={c.muted} size={22} />}
    </View>
  );
}
