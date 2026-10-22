import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { AppText } from "./AppText";
import { ProductCard } from "./ProductCard";
import type { Product } from "@/hooks/useCatalog";
import { productImage } from "@/lib/images";
import { useLocalName, useT } from "@/i18n";
import { useTheme } from "@/theme";

type Props = {
  title: string | null; // null = closed
  products: Product[];
  onClose: () => void;
  onAdd?: (product: Product) => void;
};

const GAP = 12;
const OPEN_MS = 280;
const CLOSE_MS = 220;

/**
 * Bottom sheet for a sub-category. Image-first: the same big product cards as
 * Home in a 2-up grid, so the cut and its price are obvious at a glance.
 * Slides up with a fading backdrop, and slides back down before it unmounts.
 */
export function ProductSheet({ title, products, onClose, onAdd }: Props) {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardWidth = Math.floor((screenWidth - 40 - GAP) / 2);
  const sheetHeight = Math.round(screenHeight * 0.88);

  const open = title !== null;
  const [mounted, setMounted] = useState(open);
  const [lastTitle, setLastTitle] = useState(title); // keep the title while sliding out
  const progress = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown

  useEffect(() => {
    if (open) {
      setLastTitle(title);
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [open, title]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop fades in/out */}
      <Animated.View style={{ flex: 1, backgroundColor: "rgba(20,8,4,0.45)", opacity: progress }}>
        <Pressable onPress={onClose} accessibilityLabel={t("close")} style={{ flex: 1 }} />
      </Animated.View>

      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: sheetHeight,
          backgroundColor: c.ground,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingTop: 10,
          transform: [{ translateY }],
        }}
      >
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 10 }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, height: 36, marginBottom: 8 }}>
          <AppText variant="title" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28, flex: 1 }}>{lastTitle ?? ""}</AppText>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.surface2, justifyContent: "center" }}
          >
            <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 13 }}>{t("close")}</AppText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
            {products.map((p) => (
              <ProductCard
                key={p.id}
                width={cardWidth}
                name={localName(p)}
                pricePerKg={Number(p.base_price_per_kg)}
                unit={p.unit}
                image={productImage(p.name, p.image_path)}
                onPress={() => onAdd?.(p)}
                onAdd={() => onAdd?.(p)}
              />
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
