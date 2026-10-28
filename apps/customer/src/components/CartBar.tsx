import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useLang, useT } from "@/i18n";
import { productImage } from "@/lib/images";
import { cartTotals, useCart } from "@/store/cart";
import { radius, useTheme } from "@/theme";

/** How long the bar says "X added" after a change before going back to the item count. */
const ADDED_FLASH_MS = 2500;
/** Space a screen must leave at the bottom so its last row scrolls clear of the bar. */
export const CART_BAR_SPACE = 92;

type Props = {
  /** True on tab screens, where the tab bar already covers the bottom inset. */
  aboveTabBar?: boolean;
};

/**
 * Floating "View cart" bar (Zepto / Blinkit style). Slides up as soon as the
 * cart has something in it, so adding an item never drags the customer away
 * from the catalog; one tap opens the cart.
 */
export function CartBar({ aboveTabBar = false }: Props) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const items = useCart((s) => s.items);
  const lastAdded = useCart((s) => s.lastAdded);
  const { itemTotal } = cartTotals(items);
  const visible = items.length > 0;

  const slide = useRef(new Animated.Value(visible ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: visible ? 0 : 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible]);

  // "Chicken curry cut added" for a moment, then back to "3 items · ₹620".
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!lastAdded || Date.now() - lastAdded.at > ADDED_FLASH_MS) return;
    setFlash(true);
    const h = setTimeout(() => setFlash(false), ADDED_FLASH_MS);
    return () => clearTimeout(h);
  }, [lastAdded?.at]);

  if (!visible) return null;

  const first = items[items.length - 1];
  const thumb = productImage(first.name, null);
  const addedName = lastAdded ? (lang === "ta" && lastAdded.nameTa ? lastAdded.nameTa : lastAdded.name) : "";
  const bottom = (aboveTabBar ? 0 : insets.bottom) + 12;
  const summary = items.length === 1 ? t("itemTotalOne", { total: itemTotal }) : t("itemsTotal", { n: items.length, total: itemTotal });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 16, right: 16, bottom, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }) }] }}
    >
      <Pressable
        onPress={() => router.push("/(tabs)/cart")}
        accessibilityRole="button"
        accessibilityLabel={t("viewCart")}
        style={({ pressed }) => ({ borderRadius: 22, opacity: pressed ? 0.92 : 1, elevation: 10, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } })}
      >
        {/* Frosted glass: the catalog shows through, blurred, with a soft white film and a hairline highlight */}
        <BlurView
          intensity={45}
          tint="light"
          experimentalBlurMethod="dimezisBlurView"
          style={{ borderRadius: 22, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.75)" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 68, paddingLeft: 10, paddingRight: 10, backgroundColor: "rgba(255,255,255,0.55)" }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {thumb ? <Image source={thumb} resizeMode="contain" style={{ width: 42, height: 42 }} /> : <Icon name="cart" color={c.primary} size={22} />}
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold" color={c.ink} numberOfLines={1}>
                {flash ? t("addedToCart", { name: addedName }) : summary}
              </AppText>
              <AppText variant="caption" color={c.price} numberOfLines={1}>
                {flash ? summary : t("shopMore")}
              </AppText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingLeft: 16, paddingRight: 12, borderRadius: radius.pill, backgroundColor: c.primary, elevation: 3, shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
              <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 14 }}>{t("viewCart")}</AppText>
              <Icon name="chevronUp" color="#FFFFFF" size={16} strokeWidth={2.6} />
            </View>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}
