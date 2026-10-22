import { Image, Modal, Pressable, ScrollView, View } from "react-native";
import { AppText } from "./AppText";
import type { Product } from "@/hooks/useCatalog";
import { productImage } from "@/lib/images";
import { useT } from "@/i18n";
import { radius, useTheme } from "@/theme";

type Props = {
  title: string | null; // null = closed
  products: Product[];
  onClose: () => void;
  onAdd?: (product: Product) => void;
};

/** Bottom sheet listing the products inside a sub-category, each with its own Add. */
export function ProductSheet({ title, products, onClose, onAdd }: Props) {
  const { c } = useTheme();
  const t = useT();

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
          paddingBottom: 28,
          maxHeight: "72%",
        }}
      >
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 10 }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, height: 32, marginBottom: 6 }}>
          <AppText variant="title" numberOfLines={1}>{title ?? ""}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{t("nOptions", { n: products.length })}</AppText>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
          {products.map((p) => {
            const img = productImage(p.name, p.image_path);
            return (
              <View
                key={p.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 10,
                  borderRadius: 18,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.border,
                }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {img ? (
                    <Image source={img} resizeMode="contain" style={{ width: 46, height: 46 }} />
                  ) : (
                    <AppText variant="title" color={c.price} style={{ fontSize: 18 }}>{p.name.charAt(0)}</AppText>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold" numberOfLines={2} style={{ fontSize: 14, lineHeight: 19 }}>{p.name}</AppText>
                  <AppText variant="caption" muted numberOfLines={1}>
                    ₹ {Number(p.base_price_per_kg)} {t(p.unit === "piece" ? "perPiece" : "perKg")}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => onAdd?.(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("addToCart")} ${p.name}`}
                  style={({ pressed }) => ({
                    height: 36,
                    minWidth: 64,
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    backgroundColor: pressed ? c.primaryPressed : c.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 12 }}>{t("add")}</AppText>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
