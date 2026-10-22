import { Image, Pressable, View, type ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { AppText } from "./AppText";
import { radius, useTheme } from "@/theme";
import { useT } from "@/i18n";

type Props = {
  name: string;
  /** How many products are inside. */
  count: number;
  image?: ImageSourcePropType;
  onPress: () => void;
  width: number;
};

const PAD = 12;

/**
 * Card for a sub-category (e.g. Broiler chicken). Same look as ProductCard,
 * but instead of price + Add it shows the option count and opens the sheet.
 */
export function SubcategoryCard({ name, count, image, onPress, width }: Props) {
  const { c, productGradient, productBorder } = useTheme();
  const t = useT();
  const height = Math.round(width * 1.3);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${t("nOptions", { n: count })}`}>
      <LinearGradient
        colors={productGradient}
        locations={[0, 0.4, 0.78, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ width, height, borderRadius: radius.card, overflow: "hidden", padding: PAD, borderWidth: 1, borderColor: productBorder }}
      >
        <AppText variant="title" style={{ fontSize: 15, lineHeight: 19, height: 38 }} numberOfLines={2}>
          {name}
        </AppText>

        <View style={{ flex: 1, marginHorizontal: -PAD, alignItems: "center", justifyContent: "flex-end" }}>
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
          {image ? <Image source={image} resizeMode="contain" style={{ width: "100%", height: "100%" }} /> : null}
        </View>

        {/* Option count + View pill */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 40, marginTop: 4 }}>
          <AppText variant="caption" muted numberOfLines={1}>
            {t("nOptions", { n: count })}
          </AppText>
          <View
            style={{
              height: 38,
              minWidth: 70,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: c.primary,
              backgroundColor: c.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText variant="bodyBold" color={c.price} numberOfLines={1} style={{ fontSize: 13 }}>
              {t("view")}
            </AppText>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
