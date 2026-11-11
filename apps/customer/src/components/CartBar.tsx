import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useLang, useT } from "@/i18n";
import { productImage } from "@/lib/images";
import { cartTotals, useCart } from "@/store/cart";
import { useTheme } from "@/theme";

/** How long the bar says "X added" after a change before going back to the item count. */
const ADDED_FLASH_MS = 2500;
/** Space a screen must leave at the bottom so its last row scrolls clear of the bar. */
export const CART_BAR_SPACE = 84;
/** Overlap step of the stacked item avatars. */
const AVATAR_STEP = 28;

type Props = {
  /** True on tab screens, where the tab bar already covers the bottom inset. */
  aboveTabBar?: boolean;
};

/**
 * Floating "View cart" bar (Swiggy style): a solid ember strip that sits just
 * above the white tab pill, so the two read as different things. Slides up as
 * soon as the cart has something in it; one tap opens the cart.
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

  // Up to the last three items, newest on top of the stack (items are kept in add order).
  const recent = items.slice(-3);
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
        style={({ pressed }) => ({ borderRadius: 22, opacity: pressed ? 0.94 : 1, elevation: 10, shadowColor: "#7A1E0E", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } })}
      >
        <LinearGradient colors={["#F0522A", "#E4461F", "#CF3E1B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 62, paddingLeft: 9, paddingRight: 8, borderRadius: 22, overflow: "hidden" }}>
          {/* a soft highlight across the top so the strip has some depth */}
          <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 26 }} />

          {/* Avatar group: fixed width so the text column never shifts */}
          <View style={{ width: 44 + (recent.length - 1) * AVATAR_STEP, height: 44 }}>
            {recent.map((it, i) => {
              const img = productImage(it.name, null);
              return (
                <View
                  key={it.productId}
                  style={{ position: "absolute", left: i * AVATAR_STEP, zIndex: i + 1, width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#FFD9CC", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                >
                  {img ? <Image source={img} resizeMode="contain" style={{ width: 34, height: 34 }} /> : <Icon name="cart" color={c.primary} size={18} />}
                </View>
              );
            })}
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1}>
              {flash ? t("addedToCart", { name: addedName }) : summary}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.82)" numberOfLines={1}>
              {flash ? summary : t("shopMore")}
            </AppText>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 42, paddingLeft: 16, paddingRight: 12, borderRadius: 16, backgroundColor: "#FFFFFF" }}>
            <AppText variant="bodyBold" color={c.price} numberOfLines={1} style={{ fontSize: 14 }}>{t("viewCart")}</AppText>
            <Icon name="chevronUp" color={c.price} size={16} strokeWidth={2.6} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
