import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { DEALER_REJECT_REASONS } from "@freshcut/shared";
import { useAccept, usePacked, useReject, useStartCutting, useWeigh, type DealerOrder, type DealerOrderItem } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { Btn, Chip, Txt, useC } from "@/ui";
import { Icon } from "./Icon";

const READY_CHOICES = [15, 30, 45, 60];

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Live countdown to the accept deadline ("4:32"); turns red under a minute. */
export function Countdown({ deadline }: { deadline: string }) {
  const c = useC();
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  const left = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <View style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: left < 60 ? c.danger : c.warning, alignItems: "center", justifyContent: "center" }}>
      <Txt bold size={14} color="#FFFFFF">{t("acceptIn")} {mm}:{ss}</Txt>
    </View>
  );
}

/** Product name in the app language (Tamil when set and available). */
function useItemName() {
  const lang = useLang((s) => s.lang);
  return (it: DealerOrderItem) => (lang === "ta" && it.products.name_ta ? it.products.name_ta : it.products.name);
}

function ItemRow({ it }: { it: DealerOrderItem }) {
  const t = useT();
  const name = useItemName()(it);
  const qty = it.products.unit === "kg" ? `${it.requested_kg} ${t("kg")}` : `${Math.round(it.requested_kg)} ${t("pieces")}`;
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Txt bold size={15} style={{ flex: 1 }} numberOfLines={2}>{name}</Txt>
        <Txt bold size={15}>{qty}{it.size ? ` · ${t(`size_${it.size}` as TKey)}` : ""}</Txt>
      </View>
      {it.notes ? <Txt size={13} muted numberOfLines={2}>{t("customerNote")}: {it.notes}</Txt> : null}
    </View>
  );
}

/** Status pill: colour says what stage the order is in at a glance. */
function StagePill({ status }: { status: DealerOrder["status"] }) {
  const c = useC();
  const t = useT();
  const map: Record<DealerOrder["status"], { key: TKey; bg: string; fg: string }> = {
    DEALER_ASSIGNED: { key: "newOrder", bg: c.tint, fg: c.primary },
    ACCEPTED: { key: "preparing", bg: c.infoBg, fg: c.info },
    PACKING: { key: "cutting", bg: c.warningBg, fg: c.warning },
    PACKED: { key: "ready", bg: c.successBg, fg: c.success },
  };
  const m = map[status];
  return (
    <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: m.bg, justifyContent: "center" }}>
      <Txt bold size={12} color={m.fg}>{t(m.key)}</Txt>
    </View>
  );
}

/** One order with the right actions for its stage. `compact` hides the item list (home screen). */
export function OrderCard({ o, compact }: { o: DealerOrder; compact?: boolean }) {
  const c = useC();
  const t = useT();
  const accept = useAccept();
  const reject = useReject();
  const cutting = useStartCutting();
  const weigh = useWeigh();
  const packed = usePacked();
  const [mode, setMode] = useState<"none" | "ready" | "reject">("none");
  const [weights, setWeights] = useState<Record<string, string>>({});
  const itemName = useItemName();

  const items = o.order_items.filter((i) => !i.unavailable);
  const shopTotal = items.reduce((s, i) => s + Math.round(i.shop_price_per_kg * i.requested_kg), 0);
  const isNew = o.status === "DEALER_ASSIGNED";
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

  return (
    <View style={{ borderRadius: 22, borderWidth: isNew ? 2 : 1, borderColor: isNew ? c.primary : c.border, backgroundColor: c.surface, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt bold size={17}>{o.display_id}</Txt>
          {o.delivery_slots ? <Txt size={13} muted>{clock(o.delivery_slots.starts_at)}–{clock(o.delivery_slots.ends_at)}</Txt> : null}
        </View>
        {isNew && o.accept_deadline ? <Countdown deadline={o.accept_deadline} /> : <StagePill status={o.status} />}
      </View>

      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
        {compact ? null : items.map((it) => <ItemRow key={it.id} it={it} />)}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt size={13} muted>{items.length} {t("items")}</Txt>
          <Txt bold size={16} color={c.primary}>{t("yourAmount")} ₹{shopTotal}</Txt>
        </View>
      </View>

      {isNew ? (
        mode === "ready" ? (
          <View style={{ gap: 10 }}>
            <Txt bold size={15}>{t("readyIn")}</Txt>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {READY_CHOICES.map((m) => (
                <Chip key={m} label={`${m} ${t("min")}`} onPress={() => { tap(); accept.mutate({ orderId: o.id, readyMinutes: m }); }} />
              ))}
            </View>
          </View>
        ) : mode === "reject" ? (
          <View style={{ gap: 10 }}>
            <Txt bold size={15}>{t("rejectWhy")}</Txt>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {DEALER_REJECT_REASONS.map((r) => (
                <Chip key={r} label={t(`r_${r}` as TKey)} onPress={() => { tap(); reject.mutate({ orderId: o.id, reason: r }); }} />
              ))}
              <Chip label={t("back")} onPress={() => setMode("none")} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn label={t("reject")} icon="x" kind="outlineDanger" big onPress={() => setMode("reject")} style={{ flex: 1 }} />
            <Btn label={t("accept")} icon="check" kind="success" big onPress={() => setMode("ready")} style={{ flex: 1 }} loading={accept.isPending} />
          </View>
        )
      ) : null}

      {o.status === "ACCEPTED" ? (
        <View style={{ gap: 8 }}>
          {o.ready_by ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="clock" color={c.muted} size={16} />
              <Txt size={13} muted>{t("readyBy")} {clock(o.ready_by)}</Txt>
            </View>
          ) : null}
          <Btn label={t("startCutting")} big onPress={() => { tap(); cutting.mutate(o.id); }} loading={cutting.isPending} />
        </View>
      ) : null}

      {o.status === "PACKING" ? (
        <View style={{ gap: 10 }}>
          <Txt size={13} muted>{t("weighNote")}</Txt>
          {items.map((it) => {
            const saved = it.actual_kg != null;
            return (
              <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Txt size={14} style={{ flex: 1 }} numberOfLines={2}>{itemName(it)}</Txt>
                <TextInput
                  value={weights[it.id] ?? (it.actual_kg != null ? String(it.actual_kg) : "")}
                  onChangeText={(v) => setWeights((w) => ({ ...w, [it.id]: v.replace(/[^0-9.]/g, "") }))}
                  keyboardType="decimal-pad"
                  placeholder={String(it.requested_kg)}
                  placeholderTextColor={c.muted}
                  allowFontScaling={false}
                  style={{ width: 90, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: saved ? c.success : c.border, backgroundColor: c.surface, textAlign: "center", fontFamily: "Manrope_700Bold", fontSize: 16, color: c.ink }}
                />
                <Btn
                  label={saved ? `✓ ${t("saved")}` : t("save")}
                  kind={saved ? "soft" : "outline"}
                  onPress={() => {
                    const v = Number(weights[it.id]);
                    if (v > 0) weigh.mutate({ orderId: o.id, orderItemId: it.id, actualQty: v });
                  }}
                  style={{ minWidth: 96 }}
                />
              </View>
            );
          })}
          <Btn label={t("markPacked")} kind="success" big onPress={() => { tap(); packed.mutate(o.id); }} loading={packed.isPending} disabled={items.some((i) => i.actual_kg == null)} />
        </View>
      ) : null}

      {o.status === "PACKED" ? (
        <View style={{ height: 48, borderRadius: 24, backgroundColor: c.successBg, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <Icon name="scooter" color={c.success} size={20} />
          <Txt bold size={15} color={c.success}>{t("waitingRider")}</Txt>
        </View>
      ) : null}
    </View>
  );
}
