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
  width?: number;
};

const HEIGHT = 280;
const PAD = 14;

/**
 * Product card: the image is the hero. A short title sits on top, the cut-out
 * fills the middle edge-to-edge, and price + "Add" share one row at the bottom.
 */
export function ProductCard({ name, pricePerKg, unit = "kg", image, onAdd, onPress, width = 230 }: Props) {
  const { c, productGradient } = useTheme();
  const t = useT();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
      <LinearGradient
        colors={productGradient}
        locations={[0, 0.35, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width, height: HEIGHT, borderRadius: radius.card, overflow: "hidden", padding: PAD }}
      >
        {/* Soft highlight so the cut-out looks lit from above */}
        <LinearGradient
          colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.6, y: 0.7 }}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        />

        {/* Title: max 2 lines, compact */}
        <AppText variant="title" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 23, height: 46 }} numberOfLines={2}>
          {name}
        </AppText>

        {/* Image band: bleeds to the card edges, whole cut-out, shadow pool beneath */}
        <View style={{ flex: 1, marginHorizontal: -PAD, alignItems: "center", justifyContent: "flex-end" }}>
          <View style={{ position: "absolute", bottom: 4, width: "68%", height: 16, borderRadius: 999, backgroundColor: "rgba(60,10,4,0.38)" }} />
          {image ? (
            <Image source={image} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
          ) : null}
        </View>

        {/* Price + Add in one row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44, marginTop: 4 }}>
          <View>
            <AppText variant="price" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 20, lineHeight: 24 }}>
              ₹ {pricePerKg}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14 }}>
              {t(unit === "piece" ? "perPiece" : "perKg")}
            </AppText>
          </View>
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`${t("addToCart")} ${name}`}
            style={({ pressed }) => ({
              height: 44,
              minWidth: 92,
              paddingHorizontal: 18,
              borderRadius: radius.pill,
              backgroundColor: pressed ? c.tint : "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <AppText variant="bodyBold" color="#B8361A" numberOfLines={1}>
              {t("add")}
            </AppText>
          </Pressable>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
