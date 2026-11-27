import { useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useSetStock, useStock, type StockRow } from "@/hooks/useDealer";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { useLang, useT, type TKey } from "@/i18n";
import { categoryImage, productImage, subcategoryImage } from "@/lib/images";
import { Txt, useC } from "@/ui";

/** 12 h keeps "out today" true through the evening, back on by morning. */
const OUT_TODAY_MS = 12 * 3600_000;
const FOREVER = "9999-12-31T00:00:00.000Z";
type State = "in" | "today" | "off";

const stateOf = (until: string | null): State => {
  if (!until || new Date(until).getTime() <= Date.now()) return "in";
  return new Date(until).getFullYear() > 9000 ? "off" : "today";
};

/** Three-way switch: In stock · Out today · Out until I turn on. */
function StockSwitch({ value, onChange }: { value: State; onChange: (s: State) => void }) {
  const c = useC();
  const t = useT();
  const opts: { key: State; label: TKey; color: string }[] = [
    { key: "in", label: "inStock", color: c.success },
    { key: "today", label: "outToday", color: c.warning },
    { key: "off", label: "outUntilOn", color: c.danger },
  ];
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: 14, backgroundColor: c.surface2, gap: 3 }}>
      {opts.map((o) => {
        const on = value === o.key;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.surface : "transparent", borderWidth: on ? 1.5 : 0, borderColor: o.color }}>
            <Txt bold size={12} color={on ? o.color : c.muted} numberOfLines={1}>{t(o.label)}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({ row, onChange }: { row: StockRow; onChange: (s: State) => void }) {
  const c = useC();
  const lang = useLang((s) => s.lang);
  const state = stateOf(row.out_of_stock_until);
  const name = lang === "ta" && row.name_ta ? row.name_ta : row.name;
  const img = productImage(row.name, row.image_path);
  return (
    <View style={{ padding: 12, gap: 10, opacity: state === "in" ? 1 : 0.85 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {img ? <Image source={img} resizeMode="contain" style={{ width: 46, height: 46, opacity: state === "in" ? 1 : 0.5 }} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Txt bold size={15}>{name}</Txt>
          {row.detail ? <Txt size={12} muted>{row.detail}</Txt> : null}
          {state !== "in" ? <Txt size={12} color={state === "today" ? c.warning : c.danger}>{state === "today" ? "⏸" : "⛔"}</Txt> : null}
        </View>
      </View>
      <StockSwitch value={state} onChange={onChange} />
    </View>
  );
}

/** Products grouped by category, then sub-category (Chicken → Broiler / Country), each with its picture and stock switch. */
export function StockScreen({ dealerId }: { dealerId: string }) {
  const c = useC();
  const t = useT();
  const refresh = usePullRefresh();
  const lang = useLang((s) => s.lang);
  const stock = useStock(dealerId);
  const [query, setQuery] = useState("");
  // Search by product name, brand or pack size in either language; a word that
  // matches no product (say "snacks") shows that whole group instead.
  const q = query.trim().toLowerCase();
  const all = stock.data ?? [];
  const has = (...vals: (string | null | undefined)[]) => vals.some((v) => v?.toLowerCase().includes(q));
  const byProduct = all.filter((r) => has(r.name, r.name_ta, r.detail));
  const shown = !q ? all : byProduct.length ? byProduct : all.filter((r) => has(r.category.name, r.category.name_ta, r.subcategory?.name, r.subcategory?.name_ta));
  const set = useSetStock();
  const local = (g: { name: string; name_ta: string | null }) => (lang === "ta" && g.name_ta ? g.name_ta : g.name);

  // category → sub-category (or "" for none) → rows, in catalogue order
  const groups = new Map<string, { title: string; image_path?: string | null; subs: Map<string, { title: string; image?: ReturnType<typeof subcategoryImage>; rows: StockRow[] }> }>();
  for (const row of shown) {
    const ck = row.category.name;
    if (!groups.has(ck)) groups.set(ck, { title: local(row.category), image_path: row.category.image_path, subs: new Map() });
    const sk = row.subcategory?.name ?? "";
    const subs = groups.get(ck)!.subs;
    if (!subs.has(sk)) subs.set(sk, { title: row.subcategory ? local(row.subcategory) : "", image: row.subcategory ? subcategoryImage(row.subcategory.name, row.subcategory.image_path) : undefined, rows: [] });
    subs.get(sk)!.rows.push(row);
  }

  const change = (row: StockRow, s: State) =>
    set.mutate({
      productId: row.product_id,
      outOfStockUntil: s === "in" ? null : s === "today" ? new Date(Date.now() + OUT_TODAY_MS).toISOString() : FOREVER,
    });

  const Card = ({ rows }: { rows: StockRow[] }) => (
    <View style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
      {rows.map((row, i) => (
        <View key={row.product_id}>
          {i > 0 ? <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 12 }} /> : null}
          <Row row={row} onChange={(s) => change(row, s)} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* A short list (a meat shop) is quicker to scroll than to search. */}
      {all.length > 8 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 8, paddingHorizontal: 14, height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface }}>
          <Icon name="search" color={c.muted} size={20} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("stockSearch")}
            placeholderTextColor={c.muted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            allowFontScaling={false}
            style={{ flex: 1, height: 50, padding: 0, fontFamily: "Manrope_500Medium", fontSize: 15, color: c.ink }}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear">
              <Icon name="x" color={c.muted} size={18} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 40 }} refreshControl={refresh} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {q && !shown.length ? <Txt muted style={{ textAlign: "center", marginTop: 32 }}>{t("stockNoMatch")}</Txt> : null}
      {[...groups.entries()].map(([key, g]) => {
        const img = categoryImage(key) ?? subcategoryImage(key, g.image_path);
        const rows = [...g.subs.values()].flatMap((s) => s.rows);
        const inStock = rows.filter((r) => stateOf(r.out_of_stock_until) === "in").length;
        const subs = [...g.subs.values()];
        return (
          <View key={key} style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 }}>
              {img ? (
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.tint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <Image source={img} resizeMode="contain" style={{ width: 50, height: 50 }} />
                </View>
              ) : null}
              <Txt bold size={22} style={{ flex: 1 }}>{g.title}</Txt>
              <Txt size={12} muted>{inStock}/{rows.length}</Txt>
            </View>
            {subs.map((sub, i) =>
              sub.title ? (
                <View key={sub.title} style={{ gap: 8, marginTop: i > 0 ? 4 : 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6 }}>
                    {sub.image ? <Image source={sub.image} resizeMode="contain" style={{ width: 32, height: 32 }} /> : null}
                    <Txt bold size={14} muted>{sub.title}</Txt>
                    <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                    <Txt size={12} muted>{sub.rows.filter((r) => stateOf(r.out_of_stock_until) === "in").length}/{sub.rows.length}</Txt>
                  </View>
                  <Card rows={sub.rows} />
                </View>
              ) : (
                <Card key="_" rows={sub.rows} />
              ),
            )}
          </View>
        );
      })}
    </ScrollView>
    </View>
  );
}
