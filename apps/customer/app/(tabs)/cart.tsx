import { Image, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyBasket } from "@/components/EmptyBasket";
const PATTERN = require("@freshcut/assets/images/pattern-doodles.png");
import { cartVertical, useCart } from "@/store/cart";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

export default function CartScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const grocery = cartVertical(items) === "grocery";
  const insets = useSafeAreaInsets();

  if (items.length === 0) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        {/* faint Thanjoz Mart doodle frame around the empty state */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: insets.top, bottom: 0 }}>
          <Image source={PATTERN} resizeMode="contain" style={{ width: "100%", height: "100%", opacity: 0.3 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
          <EmptyBasket size={250} />
          <AppText variant="title" numberOfLines={1}>{t("cartEmpty")}</AppText>
          <AppText muted style={{ textAlign: "center", maxWidth: 280, marginTop: -6 }}>{t("cartEmptySub")}</AppText>
          <View style={{ width: 220, marginTop: 4 }}>
            <Button label={t("browseProducts")} size="sm" onPress={() => router.push("/(tabs)")} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // A basket opens as its own full-screen page (no tab bar); only the empty state lives in the tab.
  return <Redirect href={grocery ? "/grocery/cart" : "/meat/cart"} />;
}
