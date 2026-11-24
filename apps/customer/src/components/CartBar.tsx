import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useLang, useT } from "@/i18n";
import { cartImage } from "@/lib/images";
import { cartTotals, cartVertical, useCart } from "@/store/cart";
import { useExpand } from "@/store/expand";
import { EXPAND_MS } from "./ExpandSheet";
import { radius, useTheme, withAccent } from "@/theme";
import { Photo } from "@/components/Photo";

/** How long the bar says "X added" after a change before going back to the item count. */
const ADDED_FLASH_MS = 2500;
/** Space a screen must leave at the bottom so its last row scrolls clear of the bar. */
export const CART_BAR_SPACE = 92;
/** Overlap step of the stacked item avatars. */
const AVATAR_STEP = 30;

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
  const { c, dark, tone, glow } = useTheme();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const items = useCart((s) => s.items);
  const lastAdded = useCart((s) => s.lastAdded);
  const grocery = cartVertical(items) === "grocery";
  const feeRule = useCart((s) => (grocery ? s.feeRule : s.meatRule));
  const { itemTotal, freeAbove, delivery } = cartTotals(items, feeRule);
  const g = withAccent(c, grocery ? "grocery" : "meat", dark);
  const primary = g.primary;
  const price = g.price;
  const visible = items.length > 0;

  const slide = useRef(new Animated.Value(visible ? 0 : 1)).current;

  // Tap → the bar grows into a full-screen sheet (ExpandSheet at the root) while the Cart tab opens underneath.
  const barRef = useRef<View>(null);
  function openCart() {
    const go = () => router.push(grocery ? "/grocery/cart" : "/meat/cart");
    if (!barRef.current) return go();
    barRef.current.measureInWindow((x, y, w, h) => {
      if (!w || !h) return go();
      useExpand.getState().start({ x, y, w, h });
      setTimeout(go, EXPAND_MS * 0.6); // the tab swaps while the sheet still covers the screen
    });
  }
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
        ref={barRef}
        onPress={openCart}
        accessibilityRole="button"
        accessibilityLabel={t("viewCart")}
        style={({ pressed }) => ({ borderRadius: 36, opacity: pressed ? 0.92 : 1, elevation: 12, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } })}
      >
        {/* "Liquid glass" pill (iOS Control Centre style): blurred backdrop (real blur on iOS; on Android
            expo-blur's blur is experimental and blanked screens pushed on top, so it's a translucent film),
            a bright rim that fades around the edge, a watery sheen across the top and a soft inner shadow. */}
        <LinearGradient
          colors={[...tone.glassRim]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 1.5, borderRadius: 36 }}
        >
          <BlurView intensity={50} tint={dark ? "dark" : "light"} style={{ borderRadius: 34.5, overflow: "hidden" }}>
            <LinearGradient
              colors={[...(Platform.OS === "android" ? tone.glassAndroid : tone.glassIos)]}
              locations={[0, 0.6, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 68, paddingLeft: 10, paddingRight: 10 }}
            >
              {/* sheen: a bright, soft highlight across the top like light on a water drop */}
              <LinearGradient
                pointerEvents="none"
                colors={[glow(0.95), "rgba(255,255,255,0)"]}
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

              {/* Avatar group: fixed width so the text column never shifts */}
              <View style={{ width: 48 + (recent.length - 1) * AVATAR_STEP, height: 48 }}>
                {recent.map((it, i) => {
                  const img = cartImage(it);
                  return (
                    <View
                      key={it.productId}
                      style={{ position: "absolute", left: i * AVATAR_STEP, zIndex: i + 1, width: 48, height: 48, borderRadius: 24, backgroundColor: tone.raised, borderWidth: 2, borderColor: tone.raised, alignItems: "center", justifyContent: "center", overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
                    >
                      {img ? <Photo source={img} style={{ width: 38, height: 38 }} /> : <Icon name="cart" color={primary} size={20} />}
                    </View>
                  );
                })}
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold" color={c.ink} numberOfLines={1}>
                  {flash ? t("addedToCart", { name: addedName }) : summary}
                </AppText>
                <AppText variant="caption" color={price} numberOfLines={1}>
                  {flash ? summary : grocery && freeAbove != null && delivery > 0 ? t("freeAbove", { n: freeAbove }) : t("shopMore")}
                </AppText>
              </View>

              {/* primary glass drop: solid primary with its own rim + sheen */}
              <LinearGradient
                colors={dark ? ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.08)"] : ["rgba(255,255,255,0.85)", "rgba(255,255,255,0.2)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.3, y: 1 }}
                style={{ padding: 1.5, borderRadius: 24 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingLeft: 16, paddingRight: 12, borderRadius: 22.5, backgroundColor: primary, overflow: "hidden" }}>
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
