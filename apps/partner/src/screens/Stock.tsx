import { ScrollView, View } from "react-native";
import { useSetStock, useStock } from "@/hooks/useDealer";
import { useLang, useT } from "@/i18n";
import { Chip, Txt, useC } from "@/ui";

/** 12 h keeps "out today" true through the evening, back on by morning. */
const OUT_TODAY_MS = 12 * 3600_000;
const FOREVER = "9999-12-31T00:00:00.000Z";

export function StockScreen({ dealerId }: { dealerId: string }) {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const stock = useStock(dealerId);
  const set = useSetStock();

  const stateOf = (until: string | null): "in" | "today" | "off" => {
    if (!until || new Date(until).getTime() <= Date.now()) return "in";
    return new Date(until).getFullYear() > 9000 ? "off" : "today";
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      {(stock.data ?? []).map((row) => {
        const state = stateOf(row.out_of_stock_until);
        const name = lang === "ta" && row.name_ta ? row.name_ta : row.name;
        return (
          <View key={row.product_id} style={{ padding: 14, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: state === "in" ? c.border : c.warning, gap: 10 }}>
            <Txt bold size={15} numberOfLines={2}>{name}</Txt>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip label={t("inStock")} selected={state === "in"} onPress={() => set.mutate({ productId: row.product_id, outOfStockUntil: null })} />
              <Chip
                label={t("outToday")}
                selected={state === "today"}
                onPress={() => set.mutate({ productId: row.product_id, outOfStockUntil: new Date(Date.now() + OUT_TODAY_MS).toISOString() })}
              />
              <Chip label={t("outUntilOn")} selected={state === "off"} onPress={() => set.mutate({ productId: row.product_id, outOfStockUntil: FOREVER })} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
