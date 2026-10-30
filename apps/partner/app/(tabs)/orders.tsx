import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Header } from "@/components/Header";
import { usePullRefresh } from "@/hooks/usePullRefresh";
import { Icon } from "@/components/Icon";
import { OrderCard } from "@/components/OrderCard";
import { useDealerMe, useDealerOrders, type DealerOrder } from "@/hooks/useDealer";
import { useT, type TKey } from "@/i18n";
import { Txt, useC } from "@/ui";

type Seg = "new" | "progress" | "ready";
const SEGMENTS: { key: Seg; label: TKey; statuses: DealerOrder["status"][] }[] = [
  { key: "new", label: "segNew", statuses: ["DEALER_ASSIGNED"] },
  { key: "progress", label: "segProgress", statuses: ["ACCEPTED", "PACKING"] },
  { key: "ready", label: "segReady", statuses: ["PACKED"] },
];

/** Orders by stage: New (accept/reject) · In progress (cut, weigh, pack) · Ready (waiting for rider). */
export default function OrdersScreen() {
  const c = useC();
  const refresh = usePullRefresh();
  const t = useT();
  const me = useDealerMe();
  const orders = useDealerOrders(me.data?.id);
  // Home's tiles open a specific segment (?seg=new|progress|ready).
  const { seg: wanted, at } = useLocalSearchParams<{ seg?: Seg; at?: string }>();
  const [seg, setSeg] = useState<Seg>(wanted ?? "new");
  useEffect(() => {
    if (wanted && SEGMENTS.some((x) => x.key === wanted)) setSeg(wanted);
  }, [wanted, at]);

  const all = orders.data ?? [];
  const countOf = (s: Seg) => all.filter((o) => SEGMENTS.find((x) => x.key === s)!.statuses.includes(o.status)).length;
  const list = all.filter((o) => SEGMENTS.find((x) => x.key === seg)!.statuses.includes(o.status));

  return (
    <View style={{ flex: 1 }}>
      <Header title={t("tabOrders")} />
      {/* Segments with counts */}
      <View style={{ flexDirection: "row", marginHorizontal: 16, padding: 4, borderRadius: 22, backgroundColor: c.surface2, gap: 4 }}>
        {SEGMENTS.map((s) => {
          const on = seg === s.key;
          const n = countOf(s.key);
          return (
            <Pressable key={s.key} onPress={() => setSeg(s.key)} accessibilityRole="tab" style={{ flex: 1, height: 42, borderRadius: 19, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.surface : "transparent" }}>
              <Txt bold size={14} color={on ? c.primary : c.muted} numberOfLines={1}>{t(s.label)}</Txt>
              {n > 0 ? (
                <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: on ? c.primary : c.border, alignItems: "center", justifyContent: "center" }}>
                  <Txt bold size={11} color={on ? "#FFFFFF" : c.muted}>{n}</Txt>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }} refreshControl={refresh}>
        {list.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center", gap: 8 }}>
            <Icon name="inbox" color={c.muted} size={30} />
            <Txt muted>{t("noOrders")}</Txt>
          </View>
        ) : (
          list.map((o) => <OrderCard key={o.id} o={o} />)
        )}
      </ScrollView>
    </View>
  );
}
