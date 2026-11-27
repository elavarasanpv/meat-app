import { useContext } from "react";
import { Image, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyBasket } from "@/components/EmptyBasket";
import { useT } from "@/i18n";
import { AccentContext, useTheme } from "@/theme";
const PATTERN = require("@thanjozmart/assets/images/pattern-doodles.webp");
const GROCERY = require("@thanjozmart/assets/images/doodle-grocery.webp");

/**
 * "Your cart is empty": the Cart tab, and a cart page emptied while open.
 * Meat gets the orange basket on the doodle frame (chicken legs, cleaver); inside
 * <Accent value="grocery"> it shows the green grocery basket and grocery words instead.
 */
export function EmptyCart({ onBrowse }: { onBrowse: () => void }) {
  const { c } = useTheme();
  const grocery = useContext(AccentContext) === "grocery";
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      {grocery ? null : (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: insets.top, bottom: 0 }}>
          <Image source={PATTERN} resizeMode="contain" style={{ width: "100%", height: "100%", opacity: 0.3 }} />
        </View>
      )}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
        {grocery ? <Image source={GROCERY} accessible={false} resizeMode="contain" style={{ width: 280, height: 190 }} /> : <EmptyBasket size={250} />}
        <AppText variant="title" numberOfLines={1}>{t("cartEmpty")}</AppText>
        <AppText muted style={{ textAlign: "center", maxWidth: 280, marginTop: -6 }}>{t(grocery ? "cartEmptySubGrocery" : "cartEmptySub")}</AppText>
        <View style={{ width: 220, marginTop: 4 }}>
          <Button label={t("browseProducts")} size="sm" onPress={onBrowse} />
        </View>
      </View>
    </SafeAreaView>
  );
}
