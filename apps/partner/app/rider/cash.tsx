import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { usePullRefreshKeys } from "@/hooks/usePullRefresh";
import { useCashSubmit, useRiderCash, useRiderMe, useRiderSummary } from "@/hooks/useRider";
import { useT } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";

/** Cash in hand from COD stops, and the day-end hand-over to the admin. */
export default function RiderCash() {
  const c = useC();
  const t = useT();
  const refresh = usePullRefreshKeys([["rider"]]);
  const me = useRiderMe();
  const summary = useRiderSummary(me.data?.id);
  const submit = useCashSubmit();
  const cash = useRiderCash(me.data?.id);
  const inHand = summary.data?.cashInHand ?? me.data?.cashBalance ?? 0;
  const [amount, setAmount] = useState(String(inHand));
  const [done, setDone] = useState<number | null>(null);
  useEffect(() => setAmount(String(inHand)), [inHand]);

  async function handOver() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    const r = await submit.mutateAsync(Number(amount) || 0);
    setDone(r.submitted);
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title={t("tabCash")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }} refreshControl={refresh}>
        <View style={{ padding: 20, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", gap: 6 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            <Icon name="wallet" color={c.primary} size={28} />
          </View>
          <Txt size={13} muted>{t("cashInHand")}</Txt>
          <Txt bold size={36} color={c.primary}>₹{inHand}</Txt>
          <Txt size={12} muted>{t("deliveriesToday")}: {summary.data?.deliveries ?? 0} · ₹{summary.data?.cashToday ?? 0}</Txt>
        </View>

        <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 12 }}>
          <Txt bold size={16}>{t("handOver")}</Txt>
          <Txt size={13} muted>{t("handOverHint")}</Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Txt bold size={22}>₹</Txt>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              allowFontScaling={false}
              style={{ flex: 1, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 16, fontFamily: "Manrope_700Bold", fontSize: 22, color: c.ink }}
            />
          </View>
          {done != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, backgroundColor: c.successBg }}>
              <Icon name="check" color={c.success} size={18} strokeWidth={3} />
              <Txt bold size={14} color={c.success}>{t("submitted")} ₹{done}</Txt>
            </View>
          ) : null}
          <Btn label={t("handOver")} icon="wallet" big onPress={handOver} loading={submit.isPending} disabled={inHand <= 0 && !Number(amount)} />
        </View>

        {cash.data?.today.length ? (
          <View style={{ borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16, gap: 8 }}>
            <Txt bold size={16}>{t("cashToday")}</Txt>
            {cash.data.today.map((x) => (
              <View key={x.orderId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name="check" color={c.success} size={16} strokeWidth={3} />
                <Txt size={14} style={{ flex: 1 }}>{x.displayId}</Txt>
                <Txt size={12} muted>{new Date(x.deliveredAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()}</Txt>
                <Txt bold size={14} color={x.cash ? c.ink : c.muted} style={{ minWidth: 64, textAlign: "right" }}>{x.cash ? `₹${x.cash}` : "UPI"}</Txt>
              </View>
            ))}
          </View>
        ) : null}

        {cash.data?.handovers.length ? (
          <View style={{ borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16, gap: 10 }}>
            <Txt bold size={16}>{t("pastHandovers")}</Txt>
            {cash.data.handovers.map((h) => {
              const short = h.submitted != null && h.submitted < h.expected;
              return (
                <View key={h.date} style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Txt size={14} style={{ flex: 1 }}>{new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Txt>
                    <Txt bold size={14} color={short ? c.danger : c.ink}>₹{h.submitted ?? 0}</Txt>
                    <Txt bold size={12} color={h.verified ? c.success : c.warning}>{t(h.verified ? "verified" : "pendingCheck")}</Txt>
                  </View>
                  {h.note ? <Txt size={12} color={c.danger}>{h.note}</Txt> : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
