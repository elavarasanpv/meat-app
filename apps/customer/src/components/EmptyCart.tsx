import { Image, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyBasket } from "@/components/EmptyBasket";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";
const PATTERN = require("@thanjozmart/assets/images/pattern-doodles.webp");

/** "Your cart is empty" with a doodle frame: the Cart tab, and a cart page emptied while open. */
export function EmptyCart({ onBrowse }: { onBrowse: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: insets.top, bottom: 0 }}>
        <Image source={PATTERN} resizeMode="contain" style={{ width: "100%", height: "100%", opacity: 0.3 }} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
        <EmptyBasket size={250} />
        <AppText variant="title" numberOfLines={1}>{t("cartEmpty")}</AppText>
        <AppText muted style={{ textAlign: "center", maxWidth: 280, marginTop: -6 }}>{t("cartEmptySub")}</AppText>
        <View style={{ width: 220, marginTop: 4 }}>
          <Button label={t("browseProducts")} size="sm" onPress={onBrowse} />
        </View>
      </View>
    </SafeAreaView>
  );
}
