import { Image, Pressable, View, type ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import { gradients, radius, useTheme } from "@/theme";
import { useT } from "@/i18n";

type Props = {
  name: string;
  pricePerKg: number;
  image?: ImageSourcePropType;
  onAdd?: () => void;
  onPress?: () => void;
  width?: number;
};

/**
 * Big photo card from the design: ember gradient fills the card so
 * transparent PNGs show the gradient; photos with a background cover it.
 */
export function ProductCard({ name, pricePerKg, image, onAdd, onPress, width = 230 }: Props) {
  const { c, productGradient } = useTheme();
  const t = useT();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
      <LinearGradient
        colors={productGradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ width, height: 250, borderRadius: radius.card, overflow: "hidden", padding: 16, justifyContent: "space-between" }}
      >
        {image ? (
          <Image source={image} resizeMode="cover" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
        ) : null}
        <LinearGradient
          colors={gradients.photoScrim}
          locations={[0, 0.4, 1]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View style={{ gap: 4 }}>
          <AppText variant="title" color="#FFFFFF" style={{ fontSize: 22, lineHeight: 26 }} numberOfLines={2}>
            {name}
          </AppText>
          <AppText variant="price" color="#FFFFFF" style={{ fontSize: 15 }}>
            ₹ {pricePerKg}
            <AppText variant="caption" color="rgba(255,255,255,0.8)"> {t("perKg")}</AppText>
          </AppText>
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
          <AppText variant="bodyBold" color="#B8361A">
            {t("addToCart")}
          </AppText>
        </Pressable>
      </LinearGradient>
    </Pressable>
  );
}
