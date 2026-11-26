import { Image, Pressable, View, type ImageSourcePropType } from "react-native";
import { AppText } from "@/components/AppText";
import { useCart, type Vertical } from "@/store/cart";
import { useVertical } from "@/store/vertical";
import { useT, type TKey } from "@/i18n";
import { useTheme, withAccent } from "@/theme";

/** Every section of the app, in strip order. A new one (food, building…) is one more row here. */
const SECTIONS: { key: Vertical; art: ImageSourcePropType; label: TKey; sub: TKey }[] = [
  { key: "meat", art: require("@thanjozmart/assets/images/section-meat.webp"), label: "meatTab", sub: "meatTabSub" },
  { key: "grocery", art: require("@thanjozmart/assets/images/section-grocery.webp"), label: "groceryTab", sub: "groceryTabSub" },
];

/**
 * The section switch in the Home header: equal-width white cards, each with a picture of what it
 * sells, straight on the white so it reads from arm's length. The chosen one gets its colour as outline; another one shows how many items
 * are waiting in its basket.
 */
export function VerticalStrip() {
  const { c, dark } = useTheme();
  const t = useT();
  const vertical = useVertical((s) => s.vertical);
  const setVertical = useVertical((s) => s.set);
  const baskets = useCart((s) => s.baskets);

  // Up to three sections sit side by side with the name beside the badge; more than that, the name goes under it.
  const stacked = SECTIONS.length > 3;

  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", gap: 8 }}>
      {SECTIONS.map((s) => {
        const on = s.key === vertical;
        const tone = withAccent(c, s.key, dark);
        const label = t(s.label);
        return (
          <Pressable
            key={s.key}
            onPress={() => setVertical(s.key)}
            disabled={on}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={{ flex: 1, flexDirection: stacked ? "column" : "row", alignItems: "center", gap: stacked ? 2 : 8, paddingVertical: 3, paddingHorizontal: stacked ? 4 : 6, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1.5, borderColor: on ? tone.primary : "transparent" }}
          >
            <View style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
              <Image source={s.art} resizeMode="contain" style={{ width: 42, height: 42 }} />
            </View>
            <View style={{ flexShrink: 1, alignItems: stacked ? "center" : "flex-start" }}>
              <AppText variant="label" color={on ? tone.primary : c.ink} style={{ lineHeight: 17, textAlign: stacked ? "center" : "left" }}>{label}</AppText>
              {!stacked && <AppText variant="caption" muted style={{ fontSize: 11, lineHeight: 14 }}>{t(s.sub)}</AppText>}
            </View>
            {/* Waiting basket count, on the card's corner so the picture stays clear */}
            {!on && baskets[s.key].length > 0 && (
              <View style={{ position: "absolute", top: -7, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: tone.primary, borderWidth: 1.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                <AppText variant="caption" color="#FFFFFF" style={{ fontSize: 10, lineHeight: 13 }}>{baskets[s.key].length}</AppText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
