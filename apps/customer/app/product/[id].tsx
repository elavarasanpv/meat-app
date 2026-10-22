import { useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useProducts } from "@/hooks/useCatalog";
import { productImage } from "@/lib/images";
import { useCart } from "@/store/cart";
import { useLocalName, useT } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

const KG_CHIPS = [0.5, 1, 1.5, 2];
const PIECE_CHIPS = [6, 12, 30];
const SIZES = ["small", "medium", "large"] as const;

export default function ProductDetailScreen() {
  const { c, productGradient, productBorder } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const products = useProducts();
  const product = (products.data ?? []).find((p) => p.id === id);

  const inCart = useCart((s) => s.items.find((i) => i.productId === id));
  const upsert = useCart((s) => s.upsert);

  const isKg = (product?.unit ?? "kg") === "kg";
  const [qty, setQty] = useState<number>(inCart?.qty ?? (isKg ? 1 : 12));
  const [size, setSize] = useState<(typeof SIZES)[number]>(inCart?.size ?? "medium");
  const [notes, setNotes] = useState(inCart?.notes ?? "");

  if (!product) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, alignItems: "center", justifyContent: "center" }}>
        <AppText muted>{products.isLoading ? "…" : t("notFound")}</AppText>
      </SafeAreaView>
    );
  }

  const price = Number(product.base_price_per_kg);
  const step = isKg ? 0.5 : 1;
  const min = isKg ? 0.5 : 1;
  const estimate = Math.round(price * qty);
  const img = productImage(product.name, product.image_path);

  function addToCart() {
    upsert({
      productId: product!.id,
      name: product!.name,
      nameTa: product!.name_ta ?? undefined,
      unit: product!.unit,
      price,
      qty,
      size: isKg ? size : undefined,
      notes: notes.trim() || undefined,
    });
    // Straight to the cart so the customer sees what they just added
    router.replace("/(tabs)/cart");
  }

  const chip = (selected: boolean) => ({
    height: 46,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: selected ? c.primary : c.border,
    backgroundColor: selected ? c.tint : c.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  });

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="back" color={c.ink} />
          </Pressable>
          <AppText variant="subtitle" numberOfLines={1} style={{ flex: 1, textAlign: "center", marginHorizontal: 12 }}>
            {localName(product)}
          </AppText>
          <View style={{ width: 48 }} />
        </View>

        {/* Hero image on the card gradient */}
        <LinearGradient
          colors={productGradient}
          locations={[0, 0.4, 0.78, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ margin: 20, marginBottom: 12, height: 230, borderRadius: 28, borderWidth: 1, borderColor: productBorder, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
        >
          {img ? <Image source={img} resizeMode="contain" style={{ width: "86%", height: "86%" }} /> : null}
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {/* Name + price */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <AppText variant="title" numberOfLines={2} style={{ flex: 1, fontSize: 20, lineHeight: 26, height: 52 }}>
              {localName(product)}
            </AppText>
            <View style={{ alignItems: "flex-end" }}>
              <AppText variant="price" color={c.price} style={{ fontSize: 20, lineHeight: 24 }}>₹ {price}</AppText>
              <AppText variant="caption" muted>{t(isKg ? "perKg" : "perPiece")}</AppText>
            </View>
          </View>

          {/* Weight / quantity */}
          <View style={{ gap: 8 }}>
            <AppText variant="label" numberOfLines={1}>{t(isKg ? "weight" : "quantity")}</AppText>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {(isKg ? KG_CHIPS : PIECE_CHIPS).map((v) => (
                <Pressable key={v} onPress={() => setQty(v)} accessibilityRole="button" style={chip(qty === v)}>
                  <AppText variant="bodyBold" color={qty === v ? c.price : c.ink} numberOfLines={1} style={{ fontSize: 13 }}>
                    {isKg ? `${v} kg` : `${v}`}
                  </AppText>
                </Pressable>
              ))}
              {/* Stepper for in-between values */}
              <View style={{ flexDirection: "row", alignItems: "center", height: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setQty((q) => Math.max(min, Math.round((q - step) * 2) / 2))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease"
                  style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}
                >
                  <AppText variant="bodyBold" style={{ fontSize: 18 }}>−</AppText>
                </Pressable>
                <AppText variant="bodyBold" numberOfLines={1} style={{ minWidth: 58, textAlign: "center", fontSize: 14 }}>
                  {isKg ? `${qty} kg` : qty}
                </AppText>
                <Pressable
                  onPress={() => setQty((q) => Math.round((q + step) * 2) / 2)}
                  accessibilityRole="button"
                  accessibilityLabel="Increase"
                  style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}
                >
                  <AppText variant="bodyBold" color="#FFFFFF" style={{ fontSize: 18 }}>+</AppText>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Piece size (kg products only) */}
          {isKg ? (
            <View style={{ gap: 8 }}>
              <AppText variant="label" numberOfLines={1}>{t("pieceSize")}</AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SIZES.map((sz) => (
                  <Pressable key={sz} onPress={() => setSize(sz)} accessibilityRole="button" style={[chip(size === sz), { flex: 1 }]}>
                    <AppText variant="bodyBold" color={size === sz ? c.price : c.ink} numberOfLines={1} style={{ fontSize: 13 }}>
                      {t(sz === "small" ? "sizeSmall" : sz === "medium" ? "sizeMedium" : "sizeLarge")}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Notes */}
          <View style={{ gap: 8 }}>
            <AppText variant="label" numberOfLines={1}>{t("notesLabel")}</AppText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("notesPlaceholder")}
              placeholderTextColor={c.muted}
              maxLength={200}
              style={{ height: 48, paddingHorizontal: 16, borderRadius: radius.input, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, fontFamily: fonts.body, fontSize: 14, color: c.ink }}
            />
          </View>

          {/* Weight tolerance note */}
          {isKg ? (
            <AppText variant="caption" muted numberOfLines={3} style={{ lineHeight: 17 }}>
              {t("weightNote")}
            </AppText>
          ) : null}
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <View>
          <AppText variant="caption" muted numberOfLines={1}>{t("estTotal")}</AppText>
          <AppText variant="price" color={c.price} numberOfLines={1} style={{ fontSize: 20, lineHeight: 25 }}>₹ {estimate}</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t("addToCart")} icon="cart" onPress={addToCart} />
        </View>
      </View>
    </SafeAreaView>
  );
}
