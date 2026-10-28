import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
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
        style={({ pressed }) => ({ borderRadius: 36, opacity: pressed ? 0.92 : 1, elevation: 12, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } })}
      >
        {/* "Liquid glass" pill (iOS Control Centre style): blurred backdrop (real blur on iOS; on Android
            expo-blur's blur is experimental and blanked screens pushed on top, so it's a translucent film),
            a bright rim that fades around the edge, a watery sheen across the top and a soft inner shadow. */}
        <LinearGradient
          colors={["rgba(255,255,255,0.95)", "rgba(255,255,255,0.35)", "rgba(255,255,255,0.75)"]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 1.5, borderRadius: 36 }}
        >
          <BlurView intensity={50} tint="light" style={{ borderRadius: 34.5, overflow: "hidden" }}>
            <LinearGradient
              colors={Platform.OS === "android" ? ["rgba(255,255,255,0.9)", "rgba(255,255,255,0.74)", "rgba(255,255,255,0.84)"] : ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.3)", "rgba(255,255,255,0.45)"]}
              locations={[0, 0.6, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 68, paddingLeft: 10, paddingRight: 10 }}
            >
              {/* sheen: a bright, soft highlight across the top like light on a water drop */}
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(255,255,255,0.95)", "rgba(255,255,255,0)"]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ position: "absolute", left: 0, right: 0, top: 0, height: 34, borderTopLeftRadius: 34, borderTopRightRadius: 34 }}
              />
              {/* inner shadow along the bottom edge for depth */}
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(120,60,30,0)", "rgba(120,60,30,0.10)"]}
                style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 22 }}
              />

              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: "rgba(255,255,255,1)", alignItems: "center", justifyContent: "center", overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                {thumb ? <Image source={thumb} resizeMode="contain" style={{ width: 40, height: 40 }} /> : <Icon name="cart" color={c.primary} size={22} />}
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold" color={c.ink} numberOfLines={1}>
                  {flash ? t("addedToCart", { name: addedName }) : summary}
                </AppText>
                <AppText variant="caption" color={c.price} numberOfLines={1}>
                  {flash ? summary : t("shopMore")}
                </AppText>
              </View>

              {/* primary glass drop: solid primary with its own rim + sheen */}
              <LinearGradient
                colors={["rgba(255,255,255,0.85)", "rgba(255,255,255,0.2)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.3, y: 1 }}
                style={{ padding: 1.5, borderRadius: 24 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingLeft: 16, paddingRight: 12, borderRadius: 22.5, backgroundColor: c.primary, overflow: "hidden" }}>
                  <LinearGradient
                    pointerEvents="none"
                    colors={["rgba(255,255,255,0.45)", "rgba(255,255,255,0)"]}
                    style={{ position: "absolute", left: 0, right: 0, top: 0, height: 22 }}
                  />
                  <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 14 }}>{t("viewCart")}</AppText>
                  <Icon name="chevronUp" color="#FFFFFF" size={16} strokeWidth={2.6} />
                </View>
              </LinearGradient>
            </LinearGradient>
          </BlurView>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
