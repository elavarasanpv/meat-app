import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ARRIVING_KM, CUSTOMER_CANCELLABLE, ORDER_STATUSES, etaMinutesRange, haversineKm, type OrderStatus } from "@freshcut/shared";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorState, Skeleton } from "@/components/States";
import { ArrivedPanel } from "@/components/ArrivedPanel";
import { CancelSheet } from "@/components/CancelSheet";
import { DeliveryInfoCard } from "@/components/DeliveryInfoCard";
import { OrderJourney } from "@/components/OrderJourney";
import { PlacedFlash } from "@/components/PlacedFlash";
import { TrackingMap } from "@/components/TrackingMap";
import { useRiderLocation } from "@/hooks/useTracking";
import { useCancelOrder, useOrder, useOrderOtp } from "@/hooks/useOrders";
import { dateTime, dayLabel, slotWindow } from "@/lib/format";
import { useLocalName, useT, type TKey } from "@/i18n";
import { fonts, useTheme } from "@/theme";
import { queryState } from "@/lib/network";

/** The happy path shown as a timeline; side exits (cancelled etc.) are shown as a badge only. */
const rank = (s: OrderStatus) => ORDER_STATUSES.indexOf(s);
const TRACKABLE: OrderStatus[] = ["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];
const STALE_MS = 3 * 60_000;

export default function OrderDetailScreen() {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const order = useOrder(id);
  const otp = useOrderOtp(id);
  const o = order.data;
  const tracking = useRiderLocation(id, o?.rider_id);
  const rider = tracking.data;
  const showTracking = !!o?.rider_id && TRACKABLE.includes(o.status);
  const arrived = showTracking && !!o?.arrived_at && o.status === "OUT_FOR_DELIVERY";

  const cancel = useCancelOrder();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const canCancel = !!o && CUSTOMER_CANCELLABLE.includes(o.status);
  const isCancelled = o?.status === "CANCELLED";
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const idv = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(idv);
  }, []);

  const pickup = o && o.pickup_lat != null && o.pickup_lng != null ? { lat: o.pickup_lat, lng: o.pickup_lng } : null;
  const home = o?.addresses?.lat != null && o?.addresses?.lng != null ? { lat: o.addresses.lat, lng: o.addresses.lng } : null;
  const remainingKm = rider && home ? haversineKm(rider, home) : null;
  const eta = remainingKm !== null ? etaMinutesRange(remainingKm) : null;
  const arriving = remainingKm !== null && remainingKm <= ARRIVING_KM;
  const stale = rider ? now - new Date(rider.updated_at).getTime() > STALE_MS : false;
  const agoSec = rider ? Math.max(0, Math.round((now - new Date(rider.updated_at).getTime()) / 1000)) : 0;

  const SIDE_EXITS: OrderStatus[] = ["CANCELLED", "DELIVERY_FAILED", "RETURNED", "REFUNDED"];
  // Side exits sort after DELIVERED, so for them only steps recorded in history count as done.
  const reached = (s: OrderStatus) =>
    !o ? false : SIDE_EXITS.includes(o.status) ? o.order_status_history.some((h) => h.to_status === s) : rank(o.status) >= rank(s);
  const delivered = o?.status === "DELIVERED";
  // The full timeline only matters before dispatch; during delivery the map + ETA say it all.
  const showTimeline = !!o && !showTracking && !delivered;
  const pickedUpAt = o?.order_status_history.find((h) => h.to_status === "PICKED_UP" || h.to_status === "OUT_FOR_DELIVERY")?.created_at;
  const deliveredAt = o?.order_status_history.find((h) => h.to_status === "DELIVERED")?.created_at;
  const showOtp = !!o && !arrived && !["DELIVERED", "CANCELLED", "RETURNED", "REFUNDED"].includes(o.status) && !!otp.data;
  const card = { padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 10 } as const;
  const mapH = Math.round(screenH * (arrived ? 0.26 : 0.42));

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/orders"));

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} stickyHeaderIndices={showTracking ? undefined : [0]}>
        {showTracking && o ? (
          <>
            {/* Map hero with floating controls */}
            <View>
              <TrackingMap rider={rider} pickup={pickup} home={home} height={mapH} />
              <View style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Pressable
                  onPress={back}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
                >
                  <Icon name="back" color={c.ink} />
                </Pressable>
                <View style={{ paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: c.surface, justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
                  <AppText variant="label" numberOfLines={1}>{o.display_id}</AppText>
                </View>
              </View>
            </View>

            {arrived ? (
              <ArrivedPanel amount={Number(o.final_amount ?? o.est_amount)} paymentMode={o.payment_mode} otp={otp.data ?? null} />
            ) : (
            <View style={{ marginTop: -36, marginHorizontal: 16, padding: 18, borderRadius: 24, backgroundColor: c.surface, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stale ? c.muted : c.success }} />
                <AppText variant="label" color={stale ? c.muted : c.successText} numberOfLines={1} style={{ flex: 1 }}>
                  {stale ? t("liveLost") : t("liveTracking")}
                </AppText>
                {rider ? (
                  <AppText variant="caption" muted numberOfLines={1}>
                    {agoSec < 60 ? t("updatedSecs", { n: agoSec }) : t("updatedMins", { n: Math.round(agoSec / 60) })}
                  </AppText>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" muted numberOfLines={1}>{t(arriving ? "arrivingNow" : rider ? "arrivesIn" : "waitingRider")}</AppText>
                  {rider && eta && !arriving ? (
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                      <AppText style={{ fontFamily: fonts.display, fontSize: 38, lineHeight: 44 }} color={c.ink}>{eta[0]}–{eta[1]}</AppText>
                      <AppText variant="subtitle" muted>{t("minutes")}</AppText>
                    </View>
                  ) : (
                    <AppText style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 44 }} color={c.ink} numberOfLines={1}>
                      {arriving ? "🎉" : "…"}
                    </AppText>
                  )}
                </View>
                {remainingKm !== null ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <AppText variant="caption" muted numberOfLines={1}>{t("distance")}</AppText>
                    <AppText variant="title" numberOfLines={1}>{remainingKm.toFixed(1)} km</AppText>
                  </View>
                ) : null}
              </View>

              {/* Rider strip */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="truck" color={c.primary} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold" numberOfLines={1}>{t("yourRider")}</AppText>
                  <AppText variant="caption" muted numberOfLines={1}>{t(`st_${o.status}` as TKey)}</AppText>
                </View>
                <Pressable
                  onPress={() => Linking.openURL("tel:+919999999999")}
                  accessibilityRole="button"
                  accessibilityLabel={t("callRider")}
                  style={({ pressed }) => ({ height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: pressed ? c.primaryPressed : c.success, flexDirection: "row", alignItems: "center", gap: 8 })}
                >
                  <Icon name="phone" color="#FFFFFF" size={18} />
                  <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13 }}>{t("call")}</AppText>
                </Pressable>
              </View>
            </View>
            )}
          </>
        ) : (
          /* Plain header when there is nothing to track yet */
          <SafeAreaView edges={["top"]} style={{ backgroundColor: c.ground }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6, gap: 12 }}>
              <Pressable
                onPress={back}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="back" color={c.ink} />
              </Pressable>
              <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>{o?.display_id ?? "…"}</AppText>
              {o ? <StatusBadge status={o.status} /> : null}
            </View>
          </SafeAreaView>
        )}

        <View style={{ padding: 16, gap: 14 }}>
          {!o && queryState(order).loading ? (
            <>
              <Skeleton style={{ height: 96, borderRadius: 22 }} />
              <Skeleton style={{ height: 220, borderRadius: 22 }} />
              <Skeleton style={{ height: 120, borderRadius: 22 }} />
            </>
          ) : null}
          {!o && !queryState(order).loading ? (
            <ErrorState title={queryState(order).failed ? undefined : t("orderNotFound")} onRetry={queryState(order).failed ? () => order.refetch() : undefined} />
          ) : null}

          {showTimeline && o ? <OrderJourney status={o.status} /> : null}

          {showOtp ? (
            <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.tint, borderWidth: 1.5, borderColor: c.primary, flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="label" color={c.price} numberOfLines={1}>{t("yourOtp")}</AppText>
                <AppText variant="caption" muted numberOfLines={2}>{t("shareOtp")}</AppText>
              </View>
              <View style={{ paddingHorizontal: 14, height: 56, borderRadius: 16, backgroundColor: c.surface, justifyContent: "center" }}>
                <AppText style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: 6 }} color={c.ink}>{otp.data}</AppText>
              </View>
            </View>
          ) : null}

          {/* Cancelled */}
          {isCancelled && o ? (
            <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.tint, borderWidth: 1, borderColor: c.primary, gap: 4 }}>
              <AppText variant="subtitle" color={c.price} numberOfLines={1}>{t("cancelled")}</AppText>
              {o.cancel_reason ? (
                <AppText variant="caption" muted numberOfLines={2}>
                  {t("cancelReasonLabel")}: {t((`reason_${o.cancel_reason.split(":")[0]}`) as TKey)}
                </AppText>
              ) : null}
            </View>
          ) : null}

          {/* Delivered: success card instead of a timeline */}
          {delivered && o ? (
            <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.successBg, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.success, alignItems: "center", justifyContent: "center" }}>
                <Icon name="home" color="#FFFFFF" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="subtitle" color={c.successText} numberOfLines={1}>{t("st_DELIVERED")}</AppText>
                <AppText variant="caption" color={c.successText} numberOfLines={2}>
                  {deliveredAt ? t("deliveredOn", { when: dateTime(deliveredAt) }) : t("thanksNote")}
                </AppText>
              </View>
            </View>
          ) : null}

          {/* Delivery + bill: compact card while tracking, full cards otherwise */}
          {o && showTracking ? (
            <View style={{ marginHorizontal: -16 }}>
              <DeliveryInfoCard order={o} pickedUpAt={pickedUpAt} />
            </View>
          ) : null}

          {o && !showTracking ? (
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

          {o && !showTracking ? (
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

          {canCancel ? (
            <View style={{ gap: 6, alignItems: "center" }}>
              <Button label={t("cancelOrder")} variant="outline" onPress={() => { setCancelError(null); setCancelOpen(true); }} style={{ borderColor: c.danger, alignSelf: "stretch" }} />
              <AppText variant="caption" muted numberOfLines={1}>{t("cancelUntil")}</AppText>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <CancelSheet
        visible={cancelOpen}
        busy={cancel.isPending}
        error={cancelError}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          setCancelError(null);
          try {
            await cancel.mutateAsync({ orderId: id!, reason });
            setCancelOpen(false);
          } catch (e) {
            setCancelError(`${t("cancelFailed")} (${(e as Error).message})`);
          }
        }}
      />

      {placed === "1" ? <PlacedFlash /> : null}
    </View>
  );
}
