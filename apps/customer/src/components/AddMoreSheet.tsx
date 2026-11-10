import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Animated, Easing, Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { CUSTOMER_CANCELLABLE, type OrderStatus } from "@freshcut/shared";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { byPopularity, useProductStats, useProducts, type Product } from "@/hooks/useCatalog";
import { useAddOrderItems } from "@/hooks/useOrders";
import { ApiError } from "@/lib/api";
import { productImage } from "@/lib/images";
import { formatQty, qtyStep, useCart } from "@/store/cart";
import { useLocalName, useT } from "@/i18n";
import { useTheme } from "@/theme";

type Props = {
  orderId: string;
  /** Live status of the order; the sheet flips to "too late" the moment the shop accepts. */
  status: OrderStatus | undefined;
  visible: boolean;
  onClose: () => void;
};

/**
 * "Forgot something?" — slides up right after checkout and from the order
 * screen while the shop has not accepted yet. Popular products with a +/-
 * stepper; one tap sends them onto the same order. If the shop accepts in
 * the meantime the server refuses (409) and the picks go to the cart instead.
 */
export function AddMoreSheet({ orderId, status, visible, onClose }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const router = useRouter();
  const localName = useLocalName();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = Math.round(screenHeight * 0.78);
  const products = useProducts(null);
  const stats = useProductStats().data;
  const list = useMemo(() => byPopularity(products.data ?? [], stats).slice(0, 12), [products.data, stats]);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const add = useAddOrderItems(orderId);
  const cart = useCart();

  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible]);
  useEffect(() => {
    if (!visible) { setPicked({}); add.reset(); }
  }, [visible]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });

  const lines = list.filter((p) => (picked[p.id] ?? 0) > 0);
  const count = lines.length;
  const total = lines.reduce((s, p) => s + Math.round(Number(p.base_price_per_kg) * picked[p.id]), 0);
  // The shop got there first: the status moved on, or the server said so.
  const tooLate = (status && !CUSTOMER_CANCELLABLE.includes(status)) || (add.error instanceof ApiError && add.error.status === 409);

  const bump = (p: Product, dir: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked((m) => {
      const next = Math.max(0, Math.min(50, (m[p.id] ?? 0) + dir * qtyStep(p.unit)));
      return { ...m, [p.id]: next };
    });
  };

  async function submit() {
    if (!count) return;
    try {
      await add.mutateAsync({ items: lines.map((p) => ({ productId: p.id, qty: picked[p.id] })) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    } catch {
      /* add.error drives the UI */
    }
  }

  /** Too late for this order: carry the picks into the cart for a fresh one. */
  function toCart() {
    for (const p of lines) cart.upsert({ productId: p.id, name: p.name, nameTa: p.name_ta ?? undefined, unit: p.unit, price: Number(p.base_price_per_kg), qty: picked[p.id] });
    onClose();
    router.push("/(tabs)/cart");
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(20,8,4,0.45)", opacity: progress }}>
        <Pressable onPress={onClose} accessibilityLabel={t("close")} style={{ flex: 1 }} />
      </Animated.View>

      <Animated.View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: sheetHeight, backgroundColor: c.ground, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, transform: [{ translateY }] }}>
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 10 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28 }}>{t("addMoreTitle")}</AppText>
            <AppText variant="caption" muted numberOfLines={2}>{t("addMoreSub")}</AppText>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("close")} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.surface2, justifyContent: "center" }}>
            <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 13 }}>{t("close")}</AppText>
          </Pressable>
        </View>

        {tooLate ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
              <Icon name="shop" color={c.primary} size={34} />
            </View>
            <AppText variant="title" style={{ textAlign: "center", fontSize: 20, lineHeight: 26, marginTop: 6 }}>{t("addMoreLate")}</AppText>
            <AppText muted style={{ textAlign: "center", maxWidth: 300 }}>{t("addMoreLateSub")}</AppText>
            <View style={{ alignSelf: "stretch", marginTop: 12, gap: 8, paddingBottom: insets.bottom }}>
              {count ? <Button label={t("addToCartInstead")} icon="cart" onPress={toCart} /> : null}
              <Button label={t("close")} variant="outline" onPress={onClose} />
            </View>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
              {list.map((p) => {
                const qty = picked[p.id] ?? 0;
                const img = productImage(p.name, p.image_path);
                return (
                  <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: qty ? c.primary : c.border }}>
                    <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {img ? <Image source={img} resizeMode="contain" style={{ width: 50, height: 50 }} /> : <AppText variant="title" color={c.price}>{p.name.charAt(0)}</AppText>}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 }}>{localName(p)}</AppText>
                      <AppText variant="caption" muted numberOfLines={1}>₹{Number(p.base_price_per_kg)}{p.unit === "kg" ? t("perKg") : t("perPiece")}</AppText>
                    </View>
                    {qty ? (
                      <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: c.primary, height: 36 }}>
                        <Pressable onPress={() => bump(p, -1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="−" style={{ width: 34, alignItems: "center" }}>
                          <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 22 }}>−</AppText>
                        </Pressable>
                        <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13, minWidth: 44, textAlign: "center" }}>{formatQty(qty, p.unit)}</AppText>
                        <Pressable onPress={() => bump(p, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="+" style={{ width: 34, alignItems: "center" }}>
                          <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 22 }}>+</AppText>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => bump(p, 1)} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: c.primary, backgroundColor: c.tint, justifyContent: "center" }}>
                        <AppText variant="label" color={c.price} numberOfLines={1}>{t("add")}</AppText>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ padding: 16, paddingTop: 10, paddingBottom: 12 + insets.bottom, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}>
              {add.isError && !tooLate ? <AppText variant="caption" color={c.danger} numberOfLines={2}>{(add.error as Error).message}</AppText> : null}
              <Button label={count ? t("addMoreSubmit", { n: count, amt: total }) : t("addMoreEmpty")} onPress={submit} loading={add.isPending} disabled={!count} />
            </View>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}
