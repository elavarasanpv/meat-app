import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
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

/**
 * Bottom sheet for a sub-category. Image-first: the same big product cards as
 * Home in a 2-up grid, so the cut and its price are obvious at a glance.
 */
export function ProductSheet({ title, products, onClose, onAdd }: Props) {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.floor((screenWidth - 40 - GAP) / 2);

  return (
    <Modal visible={title !== null} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable onPress={onClose} accessibilityLabel={t("close")} style={{ flex: 1, backgroundColor: "rgba(20,8,4,0.45)" }} />

      <View
        style={{
          backgroundColor: c.ground,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingTop: 10,
          height: "88%",
        }}
      >
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 10 }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, height: 36, marginBottom: 8 }}>
          <AppText variant="title" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28 }}>{title ?? ""}</AppText>
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
      </View>
    </Modal>
  );
}
