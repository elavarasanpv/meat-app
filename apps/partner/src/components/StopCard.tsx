import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { DELIVERY_FAIL_REASONS } from "@freshcut/shared";
import { amountDue, useArrived, useContact, useDeliver, useFail, useReorder, useReturn, type RiderOrder, type TripStop } from "@/hooks/useRider";
import { callNumber, navigateTo } from "@/lib/maps";
import { useLang, useT, type TKey } from "@/i18n";
import { Btn, Chip, Txt, useC } from "@/ui";
import { Icon } from "./Icon";

/** Minutes the rider must wait after arriving (and calling) before a stop can be marked failed. */
const FAIL_WAIT_MIN = 10;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();

/**
 * One customer on the trip. Header: stop number, name, address, landmark.
 * Actions follow the handover: Navigate / Call → I've arrived → Deliver (OTP
 * + how they paid) or, after the wait, Can't deliver → Return to shop.
 */
/** Reasons a rider may jump a stop ahead; kept on the stop for the admin. */
const REORDER_REASONS = ["r_road", "r_customer_asked", "r_closer", "r_other"] as const;

export function StopCard({ o, stop, canReturn, isNext = true }: { o: RiderOrder; stop?: TripStop; canReturn: boolean; isNext?: boolean }) {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const contact = useContact(o.id);
  const arrived = useArrived();
  const deliver = useDeliver();
  const fail = useFail();
  const ret = useReturn();
  const reorder = useReorder();
  const [mode, setMode] = useState<"none" | "otp" | "fail" | "reorder">("none");
  const [otp, setOtp] = useState("");
  const [payment, setPayment] = useState<"cash" | "upi">("cash");
  const [otpError, setOtpError] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, []);

  const done = o.status === "DELIVERY_FAILED" || !!stop?.delivered_at;
  const delivered = !!stop?.delivered_at;
  const failed = o.status === "DELIVERY_FAILED";
  const cod = o.payment_mode !== "prepaid_upi";
  const due = amountDue(o);
  const items = o.order_items.filter((i) => !i.unavailable);
  const waitLeft = o.arrived_at ? Math.max(0, FAIL_WAIT_MIN - Math.floor((now - new Date(o.arrived_at).getTime()) / 60_000)) : FAIL_WAIT_MIN;
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

  async function onDeliver() {
    if (otp.length !== 4) return;
    tap();
    try {
      await deliver.mutateAsync({ orderId: o.id, otp, payment: cod ? payment : "upi" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMode("none");
    } catch {
      setOtpError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }

  const tone = delivered ? c.success : failed ? c.danger : c.border;

  return (
    <View style={{ borderRadius: 22, borderWidth: delivered || failed ? 1 : 1.5, borderColor: tone, backgroundColor: c.surface, padding: 16, gap: 12, opacity: done ? 0.85 : 1 }}>
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: delivered ? c.successBg : failed ? c.tint : c.ink, alignItems: "center", justifyContent: "center" }}>
          {delivered ? <Icon name="check" color={c.success} size={20} strokeWidth={3} /> : failed ? <Icon name="x" color={c.danger} size={20} strokeWidth={3} /> : <Txt bold size={16} color="#FFFFFF">{stop?.seq ?? "•"}</Txt>}
        </View>
        <View style={{ flex: 1 }}>
          <Txt bold size={16} numberOfLines={1}>{contact.data?.name || o.addresses?.label || t("stop")} · {o.display_id}</Txt>
          <Txt size={13} muted numberOfLines={2}>{o.addresses?.address_text}{o.addresses?.landmark ? ` · ${o.addresses.landmark}` : ""}</Txt>
        </View>
        {delivered ? (
          <Txt bold size={12} color={c.success}>{t("delivered")}</Txt>
        ) : failed ? (
          <Txt bold size={12} color={c.danger}>{t("failed")}</Txt>
        ) : null}
      </View>

      {/* items + amount */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 4 }}>
        {items.map((it) => (
          <View key={it.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Txt size={14} style={{ flex: 1 }} numberOfLines={1}>{lang === "ta" && it.products.name_ta ? it.products.name_ta : it.products.name}</Txt>
            <Txt size={14} muted>{it.products.unit === "kg" ? `${it.requested_kg} ${t("kg")}` : `${Math.round(it.requested_kg)} ${t("pieces")}`}</Txt>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <Txt size={13} muted>{o.delivery_slots ? `${clock(o.delivery_slots.starts_at)}–${clock(o.delivery_slots.ends_at)}` : ""}</Txt>
          <Txt bold size={17} color={cod ? c.primary : c.success}>{cod ? `${t("collect")} ₹${due}` : t("paidOnline")}</Txt>
        </View>
      </View>

      {/* actions */}
      {!done ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn label={t("navigate")} icon="navigate" kind="soft" onPress={() => navigateTo({ lat: o.addresses?.lat, lng: o.addresses?.lng })} style={{ flex: 1 }} />
            <Btn label={t("call")} icon="phone" kind="soft" onPress={() => callNumber(contact.data?.phone)} disabled={!contact.data?.phone} style={{ flex: 1 }} />
          </View>

          {!isNext && mode !== "reorder" ? (
            <Btn label={t("deliverNext")} icon="navigate" kind="outline" onPress={() => setMode("reorder")} />
          ) : !isNext && mode === "reorder" ? (
            <View style={{ gap: 8 }}>
              <Txt bold size={15}>{t("whyReorder")}</Txt>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {REORDER_REASONS.map((r) => (
                  <Chip key={r} label={t(r)} onPress={() => { tap(); reorder.mutate({ orderId: o.id, reason: r.slice(2) }); setMode("none"); }} />
                ))}
                <Chip label={t("back")} onPress={() => setMode("none")} />
              </View>
            </View>
          ) : !o.arrived_at ? (
            <Btn label={t("arrived")} icon="check" big onPress={() => { tap(); arrived.mutate(o.id); }} loading={arrived.isPending} />
          ) : mode === "otp" ? (
            <View style={{ gap: 10 }}>
              <Txt size={13} muted>{t("askOtp")}</Txt>
              <TextInput
                value={otp}
                onChangeText={(v) => { setOtp(v.replace(/\D/g, "").slice(0, 4)); setOtpError(false); }}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
                placeholder="••••"
                placeholderTextColor={c.muted}
                allowFontScaling={false}
                style={{ height: 60, borderRadius: 16, borderWidth: 2, borderColor: otpError ? c.danger : c.primary, backgroundColor: c.surface, textAlign: "center", fontFamily: "Manrope_700Bold", fontSize: 28, letterSpacing: 12, color: c.ink }}
              />
              {otpError ? <Txt size={13} color={c.danger}>{t("wrongOtp")}</Txt> : null}
              {cod ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Chip label={`${t("cashCollected")} ₹${due}`} selected={payment === "cash"} onPress={() => setPayment("cash")} style={{ flex: 1 }} />
                  <Chip label={t("paidUpi")} selected={payment === "upi"} onPress={() => setPayment("upi")} style={{ flex: 1 }} />
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Btn label={t("back")} kind="soft" big onPress={() => setMode("none")} style={{ flex: 1 }} />
                <Btn label={t("deliver")} icon="check" kind="success" big onPress={onDeliver} loading={deliver.isPending} disabled={otp.length !== 4} style={{ flex: 1.4 }} />
              </View>
            </View>
          ) : mode === "fail" ? (
            <View style={{ gap: 10 }}>
              <Txt bold size={15}>{t("whyFailed")}</Txt>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {DELIVERY_FAIL_REASONS.map((r) => (
                  <Chip key={r} label={t(`f_${r}` as TKey)} onPress={() => { tap(); fail.mutate({ orderId: o.id, reason: r }); }} />
                ))}
                <Chip label={t("back")} onPress={() => setMode("none")} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Btn label={t("deliver")} icon="check" kind="success" big onPress={() => setMode("otp")} />
              {waitLeft > 0 ? (
                <Txt size={12} muted style={{ textAlign: "center" }}>{t("cantDeliverHint")} · {t("waitBeforeFail").replace("{m}", String(waitLeft))}</Txt>
              ) : (
                <Btn label={t("cantDeliver")} icon="x" kind="outlineDanger" onPress={() => setMode("fail")} />
              )}
            </View>
          )}
        </View>
      ) : failed && canReturn ? (
        <Btn label={t("returnToShop")} icon="shop" kind="outlineDanger" big onPress={() => { tap(); ret.mutate(o.id); }} loading={ret.isPending} />
      ) : delivered && stop?.delivered_at ? (
        <Txt size={12} muted>{clock(stop.delivered_at)}{stop.cash_collected ? ` · ${t("cashCollected")} ₹${stop.cash_collected}` : ""}</Txt>
      ) : null}
    </View>
  );
}
