import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ORDER_STATUSES, type OrderStatus } from "@freshcut/shared";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrder, useOrderOtp } from "@/hooks/useOrders";
import { dateTime, dayLabel, slotWindow } from "@/lib/format";
import { useLocalName, useT, type TKey } from "@/i18n";
import { fonts, useTheme } from "@/theme";

/** The happy path shown as a timeline; side exits (cancelled etc.) are shown as a badge only. */
const TIMELINE: OrderStatus[] = ["PLACED", "ACCEPTED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
const rank = (s: OrderStatus) => ORDER_STATUSES.indexOf(s);

export default function OrderDetailScreen() {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const order = useOrder(id);
  const otp = useOrderOtp(id);
  const o = order.data;

  const reached = (s: OrderStatus) => (o ? rank(o.status) >= rank(s) : false);
  const showOtp = !!o && !["DELIVERED", "CANCELLED", "RETURNED", "REFUNDED"].includes(o.status) && !!otp.data;
  const card = { padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 10 } as const;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/orders"))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" color={c.ink} />
        </Pressable>
        <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>{o?.display_id ?? "…"}</AppText>
        {o ? <StatusBadge status={o.status} /> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        {placed === "1" ? (
          <View style={{ padding: 16, borderRadius: 20, backgroundColor: c.successBg, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.success, alignItems: "center", justifyContent: "center" }}>
              <Icon name="orders" color="#FFFFFF" size={20} />
            </View>
            <AppText variant="subtitle" color={c.successText} numberOfLines={1} style={{ flex: 1 }}>{t("orderPlaced")}</AppText>
          </View>
        ) : null}

        {showOtp ? (
          <View style={{ padding: 16, borderRadius: 20, backgroundColor: c.tint, borderWidth: 1.5, borderColor: c.primary, alignItems: "center", gap: 6 }}>
            <AppText variant="label" color={c.price} numberOfLines={1}>{t("yourOtp")}</AppText>
            <AppText style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 48, letterSpacing: 10 }} color={c.ink}>{otp.data}</AppText>
            <AppText variant="caption" muted numberOfLines={2} style={{ textAlign: "center" }}>{t("shareOtp")}</AppText>
          </View>
        ) : null}

        {/* Timeline */}
        <View style={card}>
          <AppText variant="subtitle" numberOfLines={1} style={{ height: 24 }}>{t("orderStatus")}</AppText>
          {TIMELINE.map((s, i) => {
            const done = reached(s);
            const when = o?.order_status_history.find((h) => h.to_status === s)?.created_at;
            return (
              <View key={s} style={{ flexDirection: "row", gap: 12, minHeight: 40 }}>
                <View style={{ alignItems: "center", width: 22 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: done ? c.success : c.surface, borderWidth: 2, borderColor: done ? c.success : c.border, alignItems: "center", justifyContent: "center" }}>
                    {done ? <Icon name="back" color="#FFFFFF" size={0} /> : null}
                  </View>
                  {i < TIMELINE.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: done ? c.success : c.border, marginVertical: 2 }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 10 }}>
                  <AppText variant={done ? "bodyBold" : "body"} color={done ? c.ink : c.muted} numberOfLines={1}>{t(`st_${s}` as TKey)}</AppText>
                  {when ? <AppText variant="caption" muted numberOfLines={1}>{dateTime(when)}</AppText> : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* Delivery */}
        {o ? (
          <View style={card}>
            <AppText variant="subtitle" numberOfLines={1} style={{ height: 24 }}>{t("deliverToLabel")}</AppText>
            {o.delivery_slots ? (
              <AppText variant="bodyBold" numberOfLines={1}>
                {dayLabel(o.delivery_slots.starts_at, { today: t("today"), tomorrow: t("tomorrow") })} · {slotWindow(o.delivery_slots.starts_at, o.delivery_slots.ends_at)}
              </AppText>
            ) : null}
            {o.addresses ? (
              <AppText variant="caption" muted numberOfLines={3}>
                {o.addresses.label} · {o.addresses.address_text}{o.addresses.landmark ? ` · ${o.addresses.landmark}` : ""}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {/* Items + bill */}
        {o ? (
          <View style={card}>
            <AppText variant="subtitle" numberOfLines={1} style={{ height: 24 }}>{t("bill")}</AppText>
            {o.order_items.map((it) => {
              const unit = it.products?.unit ?? "kg";
              const qty = Number(it.actual_kg ?? it.requested_kg);
              return (
                <View key={it.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 13 }}>
                      {it.products ? localName(it.products) : "—"}
                    </AppText>
                    <AppText variant="caption" muted numberOfLines={1}>
                      {unit === "kg" ? `${qty} kg` : `${qty} × `}
                      {unit === "kg" ? "" : t("perPiece").replace("/", "")}
                      {it.size ? ` · ${t(it.size === "small" ? "sizeSmall" : it.size === "medium" ? "sizeMedium" : "sizeLarge")}` : ""}
                    </AppText>
                  </View>
                  <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 13 }}>₹ {Math.round(Number(it.unit_price_per_kg) * qty)}</AppText>
                </View>
              );
            })}
            <View style={{ height: 1, backgroundColor: c.border }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <AppText variant="bodyBold">{t("toPay")} · {t(o.payment_mode === "cod" ? "payCod" : "payUpi")}</AppText>
              <AppText variant="price" color={c.price} style={{ fontSize: 20, lineHeight: 25 }}>₹ {Number(o.final_amount ?? o.est_amount)}</AppText>
            </View>
          </View>
        ) : null}

        {placed === "1" ? <Button label={t("backHome")} variant="outline" icon="home" onPress={() => router.replace("/(tabs)")} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
