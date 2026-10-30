import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { amountDue, useAcceptOffer, useOffers, useRejectOffer, useRiderMe, type RiderOrder } from "@/hooks/useRider";
import { useLang, useT } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";
import { Icon } from "./Icon";

/**
 * Broadcast offer popup, slid in from the top on any rider screen. Shows the
 * oldest open offer; Accept races the other riders (first tap wins), Skip hides
 * it on this phone only. Buzzes when a new one lands.
 */
export function OfferSheet() {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const insets = useSafeAreaInsets();
  const me = useRiderMe();
  const offers = useOffers(me.data?.isOnline);
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const [taken, setTaken] = useState<string | null>(null);
  const y = useRef(new Animated.Value(-300)).current;
  const seen = useRef<Set<string>>(new Set());

  const offer: RiderOrder | undefined = (offers.data ?? []).find((o) => o.id !== taken);

  useEffect(() => {
    Animated.spring(y, { toValue: offer ? 0 : -300, useNativeDriver: true, friction: 8 }).start();
    if (offer && !seen.current.has(offer.id)) {
      seen.current.add(offer.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [offer?.id]);

  if (!offer && !taken) return null;

  const items = (offer?.order_items ?? []).map((it) => (lang === "ta" && it.products.name_ta ? it.products.name_ta : it.products.name)).join(", ");
  const cod = offer?.payment_mode !== "prepaid_upi";

  async function onAccept() {
    if (!offer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    const r = await accept.mutateAsync(offer.id);
    if (!r.accepted) {
      setTaken(offer.id);
      setTimeout(() => setTaken(null), 2500);
    }
  }

  return (
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 8, paddingHorizontal: 12, transform: [{ translateY: y }] }}>
      <View style={{ borderRadius: 24, backgroundColor: c.surface, borderWidth: 2, borderColor: c.primary, padding: 16, gap: 12, elevation: 8, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}>
        {taken && !offer ? (
          <Txt bold size={16} muted style={{ textAlign: "center" }}>{t("takenByOther")}</Txt>
        ) : offer ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                <Icon name="scooter" color={c.primary} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt bold size={17}>{t("newOffer")}</Txt>
                <Txt size={13} muted numberOfLines={1}>{offer.dealers?.shop_name} · {offer.display_id}</Txt>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pill label={`${offer.distance_km ?? "–"} km ${t("toShop")}`} />
              <Pill label={`${offer.drop_km ?? "–"} km ${t("drop")}`} />
              <Pill label={cod ? `${t("collect")} ₹${amountDue(offer)}` : t("paidOnline")} strong />
            </View>
            <Txt size={13} muted numberOfLines={2}>{items}</Txt>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Btn label={t("skip")} icon="x" kind="outlineDanger" big onPress={() => reject.mutate(offer.id)} style={{ flex: 1 }} />
              <Btn label={t("accept")} icon="check" kind="success" big onPress={onAccept} loading={accept.isPending} style={{ flex: 1.4 }} />
            </View>
          </>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Pill({ label, strong }: { label: string; strong?: boolean }) {
  const c = useC();
  return (
    <View style={{ paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: strong ? c.tint : c.surface2, justifyContent: "center" }}>
      <Txt bold size={12} color={strong ? c.primary : c.ink} numberOfLines={1}>{label}</Txt>
    </View>
  );
}
