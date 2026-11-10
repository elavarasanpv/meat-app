import { Image, View } from "react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { useServiceablePincodes } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

const RIDER = require("@freshcut/assets/images/icon-rider.png");

/**
 * Shown when the chosen spot is outside our delivery area: says so plainly,
 * lists where we do deliver, and offers a way to pick another spot.
 */
export function NotServed({ place, onChange, compact }: { place: string; onChange?: () => void; compact?: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const zones = useServiceablePincodes().data ?? [];
  const areas = Array.from(new Set(zones.map((z) => z.area ?? z.pincode)));
  return (
    <View style={{ borderRadius: 22, backgroundColor: c.warningBg, padding: compact ? 14 : 16, gap: 12, borderWidth: 1, borderColor: "rgba(180,98,10,0.18)" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
          <Image source={RIDER} resizeMode="contain" style={{ width: 36, height: 36, tintColor: c.warning, opacity: 0.9 }} />
          <View style={{ position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.warning, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" }}>
            <Icon name="close" color="#FFFFFF" size={10} strokeWidth={3} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" color={c.warningText} numberOfLines={2}>{t("notServedTitle", { place })}</AppText>
          <AppText variant="caption" color={c.warningText} numberOfLines={2} style={{ opacity: 0.85 }}>{t("notServedSub")}</AppText>
        </View>
      </View>
      {areas.length > 0 && (
        <View style={{ gap: 6 }}>
          <AppText variant="label" color={c.warningText} style={{ opacity: 0.8 }}>{t("weDeliverTo")}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {areas.slice(0, 8).map((a) => (
              <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#FFFFFF" }}>
                <Icon name="pin" color={c.success} size={12} />
                <AppText variant="caption" numberOfLines={1} style={{ fontSize: 12 }}>{a}</AppText>
              </View>
            ))}
            {areas.length > 8 && <AppText variant="caption" muted style={{ alignSelf: "center" }}>+{areas.length - 8}</AppText>}
          </View>
        </View>
      )}
      {onChange && <Button label={t("pickAnotherSpot")} variant="outline" size="sm" icon="pin" onPress={onChange} style={{ alignSelf: "flex-start", backgroundColor: "#FFFFFF" }} />}
    </View>
  );
}
