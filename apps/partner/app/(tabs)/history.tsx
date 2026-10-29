import { ScrollView, View } from "react-native";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { useDealerMe, useHistory } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { Txt, useC } from "@/ui";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/** Finished orders with what the shop earned on each. */
export default function HistoryScreen() {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const me = useDealerMe();
  const history = useHistory(me.data?.id);
  const rows = history.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <Header title={t("tabHistory")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}>
        {rows.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center", gap: 8 }}>
            <Icon name="history" color={c.muted} size={30} />
            <Txt muted>{t("noHistory")}</Txt>
          </View>
        ) : (
          rows.map((r) => {
            const good = r.status === "DELIVERED";
            const bad = ["CANCELLED", "DELIVERY_FAILED", "RETURNED", "REFUNDED"].includes(r.status);
            const tone = good ? c.success : bad ? c.danger : c.info;
            const names = r.items.map((i) => (lang === "ta" && i.name_ta ? i.name_ta : i.name)).join(", ");
            return (
              <View key={r.id} style={{ padding: 14, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: good ? c.successBg : bad ? c.tint : c.infoBg, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={good ? "check" : bad ? "x" : "scooter"} color={tone} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Txt bold size={15}>{r.display_id}</Txt>
                    <Txt bold size={15} color={bad ? c.muted : c.primary}>₹{r.shop_amount}</Txt>
                  </View>
                  <Txt size={12} muted numberOfLines={1}>{names}</Txt>
                  <Txt size={12} color={tone} numberOfLines={1}>{t(`st_${r.status}` as TKey) ?? r.status} · {when(r.created_at)}</Txt>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
