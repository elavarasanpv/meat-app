import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { AppText } from "./AppText";
import { useTheme } from "@/theme";

const STAR = "M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z";

/** One star, filled or outlined in the brand amber. */
export function Star({ size = 22, filled, color = "#F2A01B" }: { size?: number; filled: boolean; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={STAR} fill={filled ? color : "none"} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

/** Five tappable stars. */
export function StarPicker({ value, onChange, size = 34 }: { value: number; onChange: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => {
            onChange(n);
            Haptics.selectionAsync().catch(() => {});
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${n} star`}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 1.15 : 1 }] })}
        >
          <Star size={size} filled={n <= value} />
        </Pressable>
      ))}
    </View>
  );
}

/** Compact "★ 4.8 (23)" read-out; renders nothing until the product has a rating. */
export function RatingBadge({ avg, count, size = 12, onLight }: { avg: number | null; count: number; size?: number; onLight?: boolean }) {
  const { c } = useTheme();
  if (avg == null || count === 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Star size={size + 2} filled />
      <AppText variant="label" style={{ fontSize: size, lineHeight: size + 4, color: onLight ? c.ink : c.ink }}>{avg.toFixed(1)}</AppText>
      <AppText variant="caption" muted style={{ fontSize: size - 1, lineHeight: size + 4 }}>({count})</AppText>
    </View>
  );
}
