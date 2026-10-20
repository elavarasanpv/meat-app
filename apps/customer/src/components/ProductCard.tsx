import { Image, Pressable, View, type ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import { radius, useTheme } from "@/theme";
import { useT } from "@/i18n";

type Props = {
  name: string;
  pricePerKg: number;
  /** Transparent PNG cut-out; shown whole (never cropped) on the gradient. */
  image?: ImageSourcePropType;
  onAdd?: () => void;
  onPress?: () => void;
  width?: number;
};

/**
 * Big product card from the design: the ember gradient fills the card and the
 * cut-out sits in the middle band between the title and the button.
 */
export function ProductCard({ name, pricePerKg, image, onAdd, onPress, width = 230 }: Props) {
  const { c, productGradient } = useTheme();
  const t = useT();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
      <LinearGradient
        colors={productGradient}
        locations={[0, 0.35, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width, height: 270, borderRadius: radius.card, overflow: "hidden", padding: 16 }}
      >
        {/* Soft highlight so the cut-out looks lit from above */}
        <LinearGradient
          colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.6, y: 0.7 }}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        />

        <View style={{ gap: 2, height: 82 }}>
          <AppText variant="title" color="#FFFFFF" style={{ fontSize: 21, lineHeight: 27, height: 54 }} numberOfLines={2}>
            {name}
          </AppText>
          <AppText variant="price" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 15 }}>
            ₹ {pricePerKg}
            <AppText variant="caption" color="rgba(255,255,255,0.8)"> {t("perKg")}</AppText>
          </AppText>
        </View>

        {/* Image band: whole cut-out, centred, with a shadow pool beneath */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", marginVertical: 2 }}>
          <View style={{ position: "absolute", bottom: 2, width: "70%", height: 14, borderRadius: 999, backgroundColor: "rgba(60,10,4,0.35)" }} />
          {image ? (
            <Image source={image} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
          ) : null}
        </View>

        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={`${t("addToCart")} ${name}`}
          style={({ pressed }) => ({
            height: 46,
            borderRadius: radius.pill,
            backgroundColor: pressed ? c.tint : "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <AppText variant="bodyBold" color="#B8361A" numberOfLines={1}>
            {t("addToCart")}
          </AppText>
        </Pressable>
      </LinearGradient>
    </Pressable>
  );
}
