import { ScrollView, View } from "react-native";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { usePullRefreshKeys } from "@/hooks/usePullRefresh";
import { useRiderHistory, useRiderMe } from "@/hooks/useRider";
import { useT } from "@/i18n";
import { Txt, useC } from "@/ui";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(",", " ·");

/** Finished trips, newest first: when, km, and each stop's outcome. */
export default function RiderHistory() {
  const c = useC();
  const t = useT();
  const refresh = usePullRefreshKeys([["rider"]]);
  const me = useRiderMe();
  const trips = useRiderHistory(me.data?.id);

  return (
    <View style={{ flex: 1 }}>
      <Header title={t("tabHistory")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }} refreshControl={refresh}>
        {(trips.data ?? []).map((tr) => {
          const cash = tr.trip_stops.reduce((s, x) => s + Number(x.cash_collected), 0);
          return (
            <View key={tr.id} style={{ borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.infoBg, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="navigate" color={c.info} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt bold size={15}>{tr.trip_stops.length} {t(tr.trip_stops.length === 1 ? "stopOne" : "stops")} · {tr.total_km ?? 0} km</Txt>
                  <Txt size={12} muted>{when(tr.started_at)}</Txt>
                </View>
                {cash ? <Txt bold size={15} color={c.primary}>₹{cash}</Txt> : null}
              </View>
              <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
                {[...tr.trip_stops].sort((a, b) => (a.actual_seq ?? a.seq) - (b.actual_seq ?? b.seq)).map((x) => (
                  <View key={x.order_id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name={x.failed_at ? "x" : "check"} color={x.failed_at ? c.danger : c.success} size={16} strokeWidth={3} />
                    <Txt size={14} style={{ flex: 1 }}>{x.orders.display_id}</Txt>
                    <Txt size={13} muted>{x.failed_at ? t("failed") : x.cash_collected ? `₹${x.cash_collected}` : "UPI"}</Txt>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
        {trips.data && !trips.data.length ? (
          <View style={{ padding: 28, alignItems: "center", gap: 8, marginTop: 40 }}>
            <Icon name="history" color={c.muted} size={30} />
            <Txt muted>{t("noTrips")}</Txt>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
