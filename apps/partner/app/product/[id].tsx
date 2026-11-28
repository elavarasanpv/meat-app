import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useCatalogCategories, useDealerMe, useMyListings, useProductActions, type ProductDetails } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { productImage } from "@/lib/images";
import { PhotoError, pickProductPhoto, type PickedPhoto } from "@/lib/productPhoto";
import { Btn, Chip, Txt, useC } from "@/ui";

type Unit = "pack" | "piece" | "kg";
type Errors = Partial<Record<"photo" | "name" | "category" | "subCategory" | "mrp" | "selling" | "shop", TKey>>;

const num = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const show = (n: number | null | undefined) => (n == null ? "" : String(Number(n)));
const clean = (s: string) => s.trim() || null;
const priceKeys = (s: string) => s.replace(/[^0-9.]/g, "");

function Field({ label, hint, error, optional, ...input }: { label: string; hint?: string; error?: string; optional?: boolean } & React.ComponentProps<typeof TextInput>) {
  const c = useC();
  const t = useT();
  const off = input.editable === false;
  return (
    <View style={{ gap: 6 }}>
      <Txt bold size={14}>{label}{optional ? <Txt size={13} muted>  ({t("optional")})</Txt> : null}</Txt>
      <TextInput
        allowFontScaling={false}
        placeholderTextColor={c.muted}
        {...input}
        style={[
          { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: error ? c.danger : c.border, backgroundColor: off ? c.surface2 : c.surface, fontFamily: "Manrope_500Medium", fontSize: 16, color: c.ink },
          input.multiline ? { minHeight: 96, textAlignVertical: "top" } : null,
        ]}
      />
      {error ? <Txt size={13} color={c.danger}>{error}</Txt> : hint ? <Txt size={13} muted>{hint}</Txt> : null}
    </View>
  );
}

/** Add a product, or edit one the shop already sells. `id` is "new" or the product id. */
export default function ProductForm() {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const me = useDealerMe();
  const listings = useMyListings(!isNew);
  const cats = useCatalogCategories();
  const act = useProductActions();
  const listing = isNew ? undefined : listings.data?.find((l) => l.master_product_id === id);
  // Catalogue items are ours: the shop changes only its prices, stock and show/hide.
  const own = isNew || (listing?.product.scope === "store" && listing.product.owner_dealer_id === me.data?.id);
  const locked = listing?.selling_set_by === "admin";

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [name, setName] = useState("");
  const [nameTa, setNameTa] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("pack");
  const [packSize, setPackSize] = useState("");
  const [mrp, setMrp] = useState("");
  const [selling, setSelling] = useState("");
  const [discount, setDiscount] = useState("");
  const [shop, setShop] = useState("");
  const [desc, setDesc] = useState("");
  const [descTa, setDescTa] = useState("");
  const [active, setActive] = useState(true);
  // Until the shop owner types a price of their own, both prices follow the MRP.
  const [sellTouched, setSellTouched] = useState(!isNew);
  const [shopTouched, setShopTouched] = useState(!isNew);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);

  const discountOf = (m: string, s: string) => {
    const a = num(m), b = num(s);
    return a && b && b < a ? String(Math.round((1 - b / a) * 100)) : a && b ? "0" : "";
  };

  useEffect(() => {
    if (loaded || !listing) return;
    const p = listing.product;
    setName(p.name);
    setNameTa(p.name_ta ?? "");
    setBrand(p.brand ?? "");
    setCategoryId(p.category_id);
    setUnit(p.unit);
    setPackSize(p.pack_size ?? "");
    setMrp(show(listing.mrp));
    setSelling(show(listing.selling_price));
    setShop(show(listing.shop_price));
    setDiscount(discountOf(show(listing.mrp), show(listing.selling_price)));
    setDesc(p.description ?? "");
    setDescTa(p.description_ta ?? "");
    setActive(listing.is_active);
    setLoaded(true);
  }, [listing, loaded]);

  const onMrp = (v: string) => {
    const m = priceKeys(v);
    setMrp(m);
    const s = sellTouched ? selling : m;
    if (!sellTouched) setSelling(m);
    if (!shopTouched) setShop(s);
    setDiscount(discountOf(m, s));
  };
  const onSelling = (v: string) => {
    const s = priceKeys(v);
    setSelling(s);
    setSellTouched(true);
    if (!shopTouched) setShop(s);
    setDiscount(discountOf(mrp, s));
  };
  const onDiscount = (v: string) => {
    const d = v.replace(/[^0-9]/g, "").slice(0, 2);
    setDiscount(d);
    const m = num(mrp);
    if (!m) return;
    const s = String(Math.round(m * (100 - Number(d || 0))) / 100);
    setSelling(s);
    setSellTouched(true);
    if (!shopTouched) setShop(s);
  };
  const onShop = (v: string) => {
    setShop(priceKeys(v));
    setShopTouched(true);
  };

  const top = (cats.data ?? []).filter((x) => !x.parent_id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const picked = cats.data?.find((x) => x.id === categoryId);
  const topId = picked?.parent_id ?? picked?.id ?? null;
  const children = (cats.data ?? []).filter((x) => x.parent_id && x.parent_id === topId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const local = (g: { name: string; name_ta: string | null }) => (lang === "ta" && g.name_ta ? g.name_ta : g.name);

  const m = num(mrp), s = num(selling), sh = num(shop);
  const errors: Errors = {};
  if (own) {
    if (isNew && !photo) errors.photo = "pErrPhoto";
    if (name.trim().length < 2) errors.name = "pErrName";
    // A group with sub-groups needs one of them picked.
    if (!categoryId) errors.category = "pErrCategory";
    else if (children.length > 0 && categoryId === topId) errors.subCategory = "pErrSubCategory";
    if (!m) errors.mrp = "pErrMrp";
  }
  if (!locked) {
    if (!s) errors.selling = "pErrPrice";
    else if (m && s > m) errors.selling = "pErrCustomer";
  }
  if (!sh) errors.shop = "pErrPrice";
  else if (s && sh > s) errors.shop = "pErrShop";
  const err = (k: keyof Errors) => (tried && errors[k] ? t(errors[k]!) : undefined);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/stock"));

  const pick = async (from: "camera" | "gallery") => {
    setPicking(true);
    try {
      const p = await pickProductPhoto(from);
      if (p) setPhoto(p);
    } catch (e) {
      Alert.alert(t(e instanceof PhotoError && e.code === "denied" ? "cameraDenied" : e instanceof PhotoError ? "pErrPhotoBig" : "error"));
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    setTried(true);
    setFailed(null);
    if (Object.keys(errors).length) return setFailed(t("pFix"));
    setBusy(true);
    try {
      let pid = id;
      if (own) {
        const d: ProductDetails = { name: name.trim(), nameTa: clean(nameTa), brand: clean(brand), description: clean(desc), descriptionTa: clean(descTa), categoryId, unit, packSize: unit === "kg" ? null : clean(packSize), mrp: m!, shopPrice: sh!, sellingPrice: s! };
        if (isNew) pid = await act.create(d);
        else await act.updateOwn(pid, d);
      } else {
        await act.setPrices(pid, locked ? { shopPrice: sh! } : { shopPrice: sh!, sellingPrice: s! });
      }
      if (isNew ? !active : listing && listing.is_active !== active) await act.setActive(pid, active);
      let photoFailed = false;
      if (own && photo) {
        try {
          await act.setPhoto(pid, photo);
        } catch {
          photoFailed = true;
        }
      }
      await act.done();
      if (photoFailed) Alert.alert(t("pPhotoFailed"));
      back();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const img = photo ? { uri: photo.uri } : listing ? productImage(listing.product.name, listing.product.image_path) : undefined;
  const missing = !isNew && listings.isSuccess && !listing;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <SafeAreaView edges={["top"]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 }}>
          <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="chevronLeft" color={c.ink} size={26} />
          </Pressable>
          <Txt bold size={22} style={{ flex: 1 }}>{t(isNew ? "addProduct" : "editProduct")}</Txt>
        </View>
      </SafeAreaView>
      {missing ? (
        <Txt muted style={{ textAlign: "center", margin: 32 }}>{t("stockNoMatch")}</Txt>
      ) : !loaded ? null : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {!own ? (
              <View style={{ padding: 14, borderRadius: 16, backgroundColor: c.infoBg }}>
                <Txt size={14} color={c.info}>{t("pCatalogNote")}</Txt>
              </View>
            ) : null}

            {/* photo */}
            <View style={{ gap: 10 }}>
              <Txt bold size={14}>{t("pPhoto")}</Txt>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                <View style={{ width: 120, height: 120, borderRadius: 20, borderWidth: 1.5, borderColor: err("photo") ? c.danger : c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {img ? <Image source={img} resizeMode="contain" style={{ width: 112, height: 112 }} /> : <Icon name="camera" color={c.muted} size={36} />}
                </View>
                {own ? (
                  <View style={{ flex: 1, gap: 10 }}>
                    <Btn label={t("pCamera")} icon="camera" kind="outline" onPress={() => pick("camera")} disabled={picking || busy} />
                    <Btn label={t("pGallery")} kind="soft" onPress={() => pick("gallery")} disabled={picking || busy} />
                  </View>
                ) : null}
              </View>
              {err("photo") ? <Txt size={13} color={c.danger}>{err("photo")}</Txt> : own ? <Txt size={13} muted>{t("pPhotoHint")}</Txt> : null}
            </View>

            <Field label={t("pName")} value={name} onChangeText={setName} editable={own} error={err("name")} maxLength={120} />
            {own || nameTa ? <Field label={t("pNameTa")} optional={own} value={nameTa} onChangeText={setNameTa} editable={own} maxLength={120} /> : null}
            {own || brand ? <Field label={t("pBrand")} optional={own} value={brand} onChangeText={setBrand} editable={own} maxLength={80} /> : null}

            {own ? (
              <View style={{ gap: 8 }}>
                <Txt bold size={14}>{t("pCategory")}</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {top.map((x) => <Chip key={x.id} label={local(x)} selected={topId === x.id} onPress={() => setCategoryId(x.id)} />)}
                </View>
                {err("category") ? <Txt size={13} color={c.danger}>{err("category")}</Txt> : null}
                {children.length ? (
                  <>
                    <Txt bold size={14} style={{ paddingTop: 8 }}>{t("pSubCategory")}</Txt>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {children.map((x) => <Chip key={x.id} label={local(x)} selected={categoryId === x.id} onPress={() => setCategoryId(x.id)} />)}
                    </View>
                    {err("subCategory") ? <Txt size={13} color={c.danger}>{err("subCategory")}</Txt> : null}
                  </>
                ) : null}
              </View>
            ) : null}

            {own ? (
              <View style={{ gap: 8 }}>
                <Txt bold size={14}>{t("pSoldAs")}</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["pack", "piece", "kg"] as Unit[]).map((u) => <Chip key={u} label={t(`pUnit_${u}` as TKey)} selected={unit === u} onPress={() => setUnit(u)} />)}
                </View>
              </View>
            ) : null}
            {unit !== "kg" && (own || packSize) ? <Field label={t("pPackSize")} optional={own} hint={own ? t("pPackSizeHint") : undefined} value={packSize} onChangeText={setPackSize} editable={own} maxLength={40} /> : null}

            {/* prices */}
            <View style={{ padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 16 }}>
              <Field label={t(unit === "kg" ? "pMrpKg" : "pMrp")} value={mrp} onChangeText={onMrp} editable={own} keyboardType="decimal-pad" error={err("mrp")} maxLength={8} />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 2 }}>
                  <Field label={t("pCustomerPrice")} value={selling} onChangeText={onSelling} editable={!locked} keyboardType="decimal-pad" maxLength={8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label={t("pDiscount")} value={discount} onChangeText={onDiscount} editable={!locked && !!m} keyboardType="number-pad" maxLength={2} />
                </View>
              </View>
              {err("selling") ? <Txt size={13} color={c.danger}>{err("selling")}</Txt> : <Txt size={13} muted>{t(locked ? "pLockedNote" : "pCustomerHint")}</Txt>}
              <Field label={t("pShopPrice")} hint={t("pShopPriceHint")} value={shop} onChangeText={onShop} keyboardType="decimal-pad" error={err("shop")} maxLength={8} />
            </View>

            {own || desc ? <Field label={t("pDescription")} optional={own} value={desc} onChangeText={setDesc} editable={own} multiline maxLength={600} /> : null}
            {own || descTa ? <Field label={t("pDescriptionTa")} optional={own} value={descTa} onChangeText={setDescTa} editable={own} multiline maxLength={600} /> : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
              <View style={{ flex: 1 }}>
                <Txt bold size={15}>{t("pShow")}</Txt>
                <Txt size={13} muted>{t("pShowHint")}</Txt>
              </View>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: c.success, false: c.border }} thumbColor="#FFFFFF" />
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: c.ground, borderTopWidth: 1, borderTopColor: c.border }}>
            {failed && (failed !== t("pFix") || Object.keys(errors).length) ? <Txt size={14} color={c.danger} style={{ textAlign: "center" }}>{failed}</Txt> : null}
            <Btn label={t("save")} big kind="success" onPress={save} loading={busy} />
          </View>
        </>
      )}
    </View>
  );
}
