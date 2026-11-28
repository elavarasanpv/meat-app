import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { DEALER_REJECT_REASONS, PREP_LEAD_MIN, SCHEDULED_AFTER_MIN } from "@thanjozmart/shared";
import { useAccept, usePacked, useReject, useStartCutting, type DealerOrder, type DealerOrderItem } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { Btn, Chip, Txt, useC } from "@/ui";
import { Icon } from "./Icon";
import { ProofRow } from "./ProofRow";
import { ReadyBy, readyState } from "./ReadyBy";

const READY_CHOICES = [15, 30, 45, 60];

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** The slot with its day: "Tomorrow 7:00 am–9:00 am". The shop must see at a glance that an order is not for now. */
function useSlotLabel() {
  const t = useT();
  return (slot: { starts_at: string; ends_at: string }) => {
    const start = new Date(slot.starts_at);
    const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((midnight(start) - midnight(new Date())) / 86_400_000);
    const day = days === 0 ? t("today") : days === 1 ? t("tomorrow") : start.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `${day} · ${clock(slot.starts_at)} – ${clock(slot.ends_at)}`;
  };
}

/**
 * The slot the customer chose, with one line on what the shop should do about
 * it now. Blue while there is nothing to do yet, amber once it must be packed.
 */
function SlotBox({ slot, calm, note, children }: { slot: string; calm: boolean; note: string; children?: React.ReactNode }) {
  const c = useC();
  const t = useT();
  const fg = calm ? c.info : c.warning;
  return (
    <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 16, backgroundColor: calm ? c.infoBg : c.warningBg }}>
      <View style={{ marginTop: 2 }}>
        <Icon name="clock" color={fg} size={20} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={12} color={fg}>{t("customerSlot")}</Txt>
        <Txt bold size={16} color={fg}>{slot}</Txt>
        {children}
        <Txt size={13} color={fg} style={{ marginTop: 2 }}>{note}</Txt>
      </View>
    </View>
  );
}

/** Live countdown to the accept deadline ("4:32"); turns red under a minute. */
/** The shop is expected to answer within this many minutes of the offer. */
const ACCEPT_MARK_MIN = 5;

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
  // Past the mark the order stays here; show how long the customer has waited.
  if (left === 0) {
    const waited = Math.max(ACCEPT_MARK_MIN, Math.floor((now - new Date(deadline).getTime()) / 60_000) + ACCEPT_MARK_MIN);
    return (
      <View style={{ paddingHorizontal: 12, minHeight: 32, paddingVertical: 4, borderRadius: 16, backgroundColor: c.danger, alignItems: "center", justifyContent: "center" }}>
        <Txt bold size={14} color="#FFFFFF">{t("waitingFor")} {waited < 60 ? `${waited} ${t("min")}` : `${Math.floor(waited / 60)} ${t("hr")} ${waited % 60} ${t("min")}`}</Txt>
      </View>
    );
  }
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
        <Txt bold size={15} style={{ flex: 1 }}>{name}{it.is_free ? <Txt bold size={12} color="#1F8A4C">  {t("offerFreeLine")}</Txt> : null}</Txt>
        <Txt bold size={15}>{qty}{it.size ? ` · ${t(`size_${it.size}` as TKey)}` : ""}</Txt>
      </View>
      {it.products.pack_size ? <Txt size={13} muted>{[it.products.brand, it.products.pack_size].filter(Boolean).join(" · ")}</Txt> : null}
      {it.notes ? <Txt size={13} muted numberOfLines={2}>{t("customerNote")}: {it.notes}</Txt> : null}
    </View>
  );
}

/** Status pill: colour says what stage the order is in at a glance. */
function StagePill({ status, waiting }: { status: DealerOrder["status"]; waiting?: boolean }) {
  const c = useC();
  const t = useT();
  if (waiting) {
    return (
      <View style={{ paddingHorizontal: 10, minHeight: 26, borderRadius: 13, backgroundColor: c.surface2, justifyContent: "center" }}>
        <Txt bold size={12} color={c.ink}>{t("scheduled")}</Txt>
      </View>
    );
  }
  const map: Record<DealerOrder["status"], { key: TKey; bg: string; fg: string }> = {
    DEALER_ASSIGNED: { key: "newOrder", bg: c.tint, fg: c.primary },
    ACCEPTED: { key: "preparing", bg: c.infoBg, fg: c.info },
    PACKING: { key: "cutting", bg: c.warningBg, fg: c.warning },
    PACKED: { key: "ready", bg: c.successBg, fg: c.success },
    RIDER_ASSIGNED: { key: "riderComing", bg: c.infoBg, fg: c.info },
  };
  const m = map[status];
  return (
    <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: m.bg, justifyContent: "center" }}>
      <Txt bold size={12} color={m.fg}>{t(m.key)}</Txt>
    </View>
  );
}

/** One order with the right actions for its stage. `compact` hides the item list; `noDetails` hides the "View details" row (the details screen itself). */
export function OrderCard({ o, compact, noDetails }: { o: DealerOrder; compact?: boolean; noDetails?: boolean }) {
  const router = useRouter();
  const c = useC();
  const t = useT();
  const accept = useAccept();
  const reject = useReject();
  const cutting = useStartCutting();
  const packed = usePacked();
  const slotLabel = useSlotLabel();
  const [mode, setMode] = useState<"none" | "ready" | "reject">("none");
  const [readyPick, setReadyPick] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, []);

  // A meat order for a later slot (tomorrow morning, this evening): accepted
  // for the slot with no ready-in minutes, and prepared when the slot is near.
  const slotStart = o.delivery_slots ? new Date(o.delivery_slots.starts_at).getTime() : null;
  const meat = o.vertical_type !== "grocery";
  const forLater = meat && slotStart != null && slotStart - now > SCHEDULED_AFTER_MIN * 60_000;
  const remindAt = slotStart != null ? slotStart - PREP_LEAD_MIN * 60_000 : null;
  const waiting = o.status === "ACCEPTED" && meat && remindAt != null && now < remindAt && !!o.ready_by && new Date(o.ready_by).getTime() >= slotStart!;

  const items = o.order_items.filter((i) => !i.unavailable);
  const itemsTotal = items.reduce((s, i) => s + Math.round(i.shop_price_per_kg * i.requested_kg), 0);
  // The app charge comes off what the shop gets; the customer pays the same.
  const appCharge = Math.min(Number(o.app_charge ?? 0), itemsTotal);
  // A next-order coupon the shop gave earlier, used on this order.
  const offerDiscount = Math.min(Number(o.offer_discount ?? 0), itemsTotal - appCharge);
  const shopTotal = itemsTotal - appCharge - offerDiscount;
  const isNew = o.status === "DEALER_ASSIGNED";
  const late = !!o.ready_by && (o.status === "ACCEPTED" || o.status === "PACKING") && readyState(o.ready_by, Date.now()).phase === "late";
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

  return (
    <View style={{ borderRadius: 22, borderWidth: isNew || late ? 2 : 1, borderColor: isNew ? c.primary : late ? c.danger : c.border, backgroundColor: c.surface, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt bold size={17}>{o.display_id}</Txt>
          {o.delivery_slots && !meat ? <Txt size={13} muted>{slotLabel(o.delivery_slots)}</Txt> : null}
        </View>
        {isNew && o.accept_deadline ? <Countdown deadline={o.accept_deadline} /> : <StagePill status={o.status} waiting={waiting} />}
      </View>

      {o.items_added_at ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.infoBg }}>
          <Icon name="bell" color={c.info} size={13} />
          <Txt bold size={12} color={c.info}>{t("customerAdded")} · {clock(o.items_added_at)}</Txt>
        </View>
      ) : null}
      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
        {compact ? null : items.map((it) => <ItemRow key={it.id} it={it} />)}
        {/* Grocery orders always say what goes to the app, even when it is nothing */}
        {!meat ? (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Txt size={13} muted style={{ flex: 1 }}>{t("itemsYourPrice")}</Txt>
              <Txt size={13}>₹{itemsTotal}</Txt>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Txt size={13} muted style={{ flex: 1 }}>{t("appCharge")}{o.app_charge_basis ? ` (${o.app_charge_basis})` : ""}</Txt>
              <Txt size={13}>{appCharge > 0 ? `− ₹${appCharge}` : "₹0"}</Txt>
            </View>
            {offerDiscount > 0 ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Txt size={13} muted style={{ flex: 1 }}>{t("offerCoupon")}</Txt>
                <Txt size={13}>− ₹{offerDiscount}</Txt>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <Txt size={13} muted>{items.length} {t(items.length === 1 ? "item" : "items")}</Txt>
          <Txt bold size={16} color={c.primary} style={{ flexShrink: 1, textAlign: "right" }}>{t("yourAmount")} ₹{shopTotal}</Txt>
        </View>
        {noDetails ? null : (
          <Pressable
            onPress={() => router.push(`/order/${o.id}` as Href)}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 46, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: c.surface2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.8 : 1 })}
          >
            <Txt bold size={15} style={{ flexShrink: 1, textAlign: "center" }}>{t("viewDetails")}</Txt>
            <Icon name="chevronRight" color={c.ink} size={18} />
          </Pressable>
        )}
      </View>

      {isNew ? (
        mode === "ready" ? (
          <View style={{ gap: 10 }}>
            <Txt bold size={15}>{t("readyIn")}</Txt>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {READY_CHOICES.map((m) => (
                <Chip
                  key={m}
                  label={`${m} ${t("min")}`}
                  selected={accept.isPending && readyPick === m}
                  onPress={() => {
                    // One tap is enough; further taps while it sends are ignored.
                    if (accept.isPending) return;
                    tap();
                    setReadyPick(m);
                    accept.mutate({ orderId: o.id, readyMinutes: m });
                  }}
                />
              ))}
              {accept.isPending ? <ActivityIndicator color={c.primary} /> : null}
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
          <View style={{ gap: 10 }}>
            {meat && o.delivery_slots ? <SlotBox slot={slotLabel(o.delivery_slots)} calm={forLater} note={t(forLater ? "forLaterNew" : "slotNew")} /> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Btn label={t("reject")} icon="x" kind="outlineDanger" big onPress={() => setMode("reject")} style={{ flex: 1 }} />
              <Btn
                label={t("accept")}
                icon="check"
                kind="success"
                big
                onPress={() => {
                  if (!forLater) return setMode("ready");
                  tap();
                  accept.mutate({ orderId: o.id });
                }}
                style={{ flex: 1 }}
                loading={accept.isPending}
              />
            </View>
          </View>
        )
      ) : null}

      {waiting && o.delivery_slots ? (
        <SlotBox slot={slotLabel(o.delivery_slots)} calm note={t("forLaterWait")}>
          <Txt bold size={13} color={c.info}>{t("remindAt")} {clock(new Date(remindAt!).toISOString())}</Txt>
        </SlotBox>
      ) : o.status === "ACCEPTED" ? (
        <View style={{ gap: 8 }}>
          {meat && o.delivery_slots ? <SlotBox slot={slotLabel(o.delivery_slots)} calm={false} note={t("slotPack")} /> : null}
          {o.ready_by ? <ReadyBy readyBy={o.ready_by} /> : null}
          <Btn label={t("startCutting")} big onPress={() => { tap(); cutting.mutate(o.id); }} loading={cutting.isPending} />
        </View>
      ) : null}

      {o.status === "PACKING" ? (
        <View style={{ gap: 10 }}>
          {meat && o.delivery_slots ? <SlotBox slot={slotLabel(o.delivery_slots)} calm={false} note={t("slotPack")} /> : null}
          {o.ready_by ? <ReadyBy readyBy={o.ready_by} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="camera" color={c.muted} size={16} />
            <Txt size={13} muted style={{ flex: 1 }}>{t("weighNote")}</Txt>
          </View>
          {items.map((it) => <ProofRow key={it.id} orderId={o.id} item={it} />)}
          {(() => {
            const left = items.filter((i) => !i.photo_path).length;
            return (
              <Btn
                label={left ? `${left} ${t(left === 1 ? "photoLeft" : "photosLeft")}` : t("markPacked")}
                icon={left ? "camera" : "check"}
                kind="success"
                big
                onPress={() => { tap(); packed.mutate(o.id); }}
                loading={packed.isPending}
                disabled={left > 0}
              />
            );
          })()}
        </View>
      ) : null}

      {o.status === "PACKED" ? (
        <View style={{ minHeight: 52, paddingHorizontal: 14, borderRadius: 26, backgroundColor: c.successBg, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
          <Icon name="scooter" color={c.success} size={30} />
          <Txt bold size={15} color={c.success} style={{ flexShrink: 1 }}>{t(o.vertical_type === "grocery" ? "packGrocery" : "waitingRider")}</Txt>
        </View>
      ) : null}

      {o.status === "RIDER_ASSIGNED" && o.rider ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: c.infoBg }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
            <Icon name="scooter" color={c.info} size={34} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt size={12} color={c.info}>{t("riderComing")}</Txt>
            <Txt bold size={16} numberOfLines={1}>{o.rider.name ?? t("rider")}</Txt>
            {o.rider.vehicle ? <Txt size={12} muted numberOfLines={1}>{o.rider.vehicle}</Txt> : null}
          </View>
          {o.rider.phone ? (
            <Btn label={t("call")} icon="phone" kind="soft" onPress={() => Linking.openURL(`tel:${o.rider!.phone}`)} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
