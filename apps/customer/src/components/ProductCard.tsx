import { Image, Pressable, View, type ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
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
          {/* Soft contact shadow: a radial fade, not a flat bar */}
          <Svg width={width} height={26} style={{ position: "absolute", bottom: 0 }} pointerEvents="none">
            <Defs>
              <RadialGradient id="shadow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="#7A2A10" stopOpacity={0.28} />
                <Stop offset="0.6" stopColor="#7A2A10" stopOpacity={0.1} />
                <Stop offset="1" stopColor="#7A2A10" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={width / 2} cy={14} rx={width * 0.36} ry={11} fill="url(#shadow)" />
          </Svg>
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
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              backgroundColor: pressed ? c.primaryPressed : c.primary,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 5,
            })}
          >
            <Icon name="cart" color="#FFFFFF" size={15} />
            <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13 }}>
              {t("add")}
            </AppText>
          </Pressable>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
