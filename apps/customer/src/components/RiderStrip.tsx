import { Linking, Pressable, View } from "react-native";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

type Props = {
  /** The rider's full name; the first name is shown. Falls back to "Your rider". */
  name?: string | null;
  sub: string;
  phone?: string | null;
};

/** Who is bringing the order: "I'm Velu, your rider", what they are doing now, and a Call button. */
export function RiderStrip({ name, sub, phone }: Props) {
  const { c } = useTheme();
  const t = useT();
  const first = (name ?? "").trim().split(/\s+/)[0];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
        <Icon name="scooter" color={c.primary} size={30} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyBold" numberOfLines={1}>{first ? t("imRider", { name: first }) : t("yourRider")}</AppText>
        <AppText variant="caption" muted numberOfLines={2}>{sub}</AppText>
      </View>
      <Pressable
        onPress={() => phone && Linking.openURL(`tel:${phone}`)}
        disabled={!phone}
        accessibilityRole="button"
        accessibilityLabel={t("callRider")}
        style={({ pressed }) => ({ height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: pressed ? c.primaryPressed : c.success, opacity: phone ? 1 : 0.5, flexDirection: "row", alignItems: "center", gap: 8 })}
      >
        <Icon name="phone" color="#FFFFFF" size={18} />
        <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13 }}>{t("call")}</AppText>
      </Pressable>
    </View>
  );
}
