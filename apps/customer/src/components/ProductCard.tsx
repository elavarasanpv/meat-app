import { Image, Pressable, View, type ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import { radius, useTheme } from "@/theme";
import { useT } from "@/i18n";

type Props = {
  name: string;
  pricePerKg: number;
  /** "kg" (default) or "piece" — changes the unit label under the price. */
  unit?: "kg" | "piece";
  /** Transparent PNG cut-out; shown whole (never cropped) on the gradient. */
  image?: ImageSourcePropType;
  onAdd?: () => void;
  onPress?: () => void;
  /** Card width; height follows (about 1.3×). */
  width: number;
};

const PAD = 12;

/**
 * Product card: white melting into a soft ember glow, dark text, ember "Add".
 * The cut-out is the hero and bleeds to the card edges.
 */
export function ProductCard({ name, pricePerKg, unit = "kg", image, onAdd, onPress, width }: Props) {
  const { c, productGradient, productBorder } = useTheme();
  const t = useT();
  const height = Math.round(width * 1.3);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
      <LinearGradient
        colors={productGradient}
        locations={[0, 0.4, 0.78, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ width, height, borderRadius: radius.card, overflow: "hidden", padding: PAD, borderWidth: 1, borderColor: productBorder }}
      >
        {/* Title: max 2 lines, compact */}
        <AppText variant="title" style={{ fontSize: 15, lineHeight: 19, height: 38 }} numberOfLines={2}>
          {name}
        </AppText>

        {/* Image band: bleeds to the card edges, whole cut-out, soft shadow pool beneath */}
        <View style={{ flex: 1, marginHorizontal: -PAD, alignItems: "center", justifyContent: "flex-end" }}>
          <View style={{ position: "absolute", bottom: 3, width: "66%", height: 12, borderRadius: 999, backgroundColor: "rgba(120,40,16,0.18)" }} />
          {image ? (
            <Image source={image} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
          ) : null}
        </View>

        {/* Price + Add in one row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 40, marginTop: 4 }}>
          <View>
            <AppText variant="price" color={c.price} numberOfLines={1} style={{ fontSize: 17, lineHeight: 21 }}>
              ₹ {pricePerKg}
            </AppText>
            <AppText variant="caption" muted numberOfLines={1} style={{ fontSize: 10, lineHeight: 13 }}>
              {t(unit === "piece" ? "perPiece" : "perKg")}
            </AppText>
          </View>
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`${t("addToCart")} ${name}`}
            style={({ pressed }) => ({
              height: 38,
              minWidth: 70,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              backgroundColor: pressed ? c.primaryPressed : c.primary,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13 }}>
              {t("add")}
            </AppText>
          </Pressable>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
