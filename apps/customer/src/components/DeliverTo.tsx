import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import type { Address } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * The "Delivering to" row that sits right above the Place order button:
 * the address label in bold with the full line under it and a Change link
 * on the right; "Select address" when there is none or several to pick from.
 */
export function DeliverTo({ address, onChange, color }: { address: Address | null; onChange: () => void; color?: string }) {
  const { c } = useTheme();
  const t = useT();
  const accent = color ?? c.price;
  return (
    <Pressable onPress={onChange} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
        <Icon name={address ? "home" : "pin"} color={c.primary} size={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {address ? (
          <>
            <AppText variant="body" numberOfLines={1} style={{ fontSize: 14 }}>
              {t("deliveringTo")} <AppText variant="bodyBold" style={{ fontSize: 14 }}>{address.label}</AppText>
            </AppText>
            <AppText variant="caption" muted numberOfLines={1}>{[address.landmark, address.address_text].filter(Boolean).join(", ")}</AppText>
          </>
        ) : (
          <>
            <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 }}>{t("selectAddress")}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{t("deliverToLabel")}</AppText>
          </>
        )}
      </View>
      <AppText variant="label" color={accent} numberOfLines={1} style={{ fontSize: 14 }}>{address ? t("change") : t("select")}</AppText>
    </Pressable>
  );
}
