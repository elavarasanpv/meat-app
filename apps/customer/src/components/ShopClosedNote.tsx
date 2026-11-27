import { View, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useShopsClosed } from "@/hooks/useCatalog";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/** Shown while no meat shop near the chosen address is taking orders: the order can still be placed and waits for the shop. */
export function ShopClosedNote({ style, productIds }: { style?: StyleProp<ViewStyle>; /** The basket, when there is one. */ productIds?: string[] }) {
  const { c } = useTheme();
  const t = useT();
  if (!useShopsClosed(productIds)) return null;
  return (
    <View style={[{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border }, style]}>
      <Icon name="clock" color={c.price} size={18} />
      <AppText variant="caption" style={{ flex: 1 }}>{t("shopClosedNote")}</AppText>
    </View>
  );
}
