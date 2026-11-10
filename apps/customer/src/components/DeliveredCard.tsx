import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { Star, StarPicker } from "./Stars";
import { useOrderRating, useRiderContact } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

export type DeliveredLook = "handoff" | "rider" | "scene" | "plain";

/**
 * Quick delivery rating under the delivered header. Tapping a star opens the
 * full "Rate your order" screen with that star already chosen; once rated it
 * shows the stars given.
 */
export function DeliveredCard({ orderId, hasRider }: { orderId: string; hasRider: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const rider = useRiderContact(orderId, hasRider);
  const rating = useOrderRating(orderId);
  const r = rating.data;
  const openRate = (stars?: number) => router.push({ pathname: "/rate/[id]", params: stars ? { id: orderId, stars: String(stars) } : { id: orderId } });

  return (
    <View style={{ borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
        {r ? (
          <Pressable onPress={() => openRate()} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="subtitle" numberOfLines={1}>{t("youRated")}</AppText>
              {hasRider && rider.data?.name ? <AppText variant="caption" muted numberOfLines={1}>{t("deliveredBy", { name: rider.data.name })}</AppText> : null}
            </View>
            <View style={{ flexDirection: "row", gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={18} filled={n <= (r.rider?.stars ?? r.app?.stars ?? 5)} />
              ))}
            </View>
            <AppText variant="label" color={c.price}>{t("edit")}</AppText>
          </Pressable>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="subtitle" numberOfLines={1}>{t("howWasDelivery")}</AppText>
                {hasRider && rider.data?.name ? <AppText variant="caption" muted numberOfLines={1}>{t("deliveredBy", { name: rider.data.name })}</AppText> : null}
              </View>
              <StarPicker value={0} onChange={(n) => openRate(n)} size={30} />
            </View>
            <Pressable onPress={() => openRate()} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <AppText variant="label" color={c.price} numberOfLines={1}>{t("rateItemsLink")}</AppText>
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <Icon name="back" color={c.price} size={14} strokeWidth={2.6} />
              </View>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
