import { ActivityIndicator, Pressable, Text, useColorScheme, type TextProps, type ViewStyle } from "react-native";
import { palette } from "@/theme";

export function useC() {
  const scheme = useColorScheme() ?? "light";
  return palette[scheme];
}

type TxtProps = TextProps & { size?: number; bold?: boolean; color?: string; muted?: boolean };

/** Manrope for Latin; Tamil glyphs fall back to the system Tamil font. */
export function Txt({ size = 15, bold, color, muted, style, ...rest }: TxtProps) {
  const c = useC();
  return (
    <Text
      allowFontScaling={false}
      style={[
        { fontFamily: bold ? "Manrope_700Bold" : "Manrope_500Medium", fontSize: size, lineHeight: Math.round(size * 1.45), color: color ?? (muted ? c.muted : c.ink) },
        style,
      ]}
      {...rest}
    />
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  kind?: "primary" | "soft" | "outline" | "success" | "danger";
  big?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Big-thumb button for shop owners. */
export function Btn({ label, onPress, kind = "primary", big, loading, disabled, style }: BtnProps) {
  const c = useC();
  const bg = kind === "primary" ? c.primary : kind === "success" ? c.success : kind === "danger" ? c.danger : kind === "soft" ? c.surface2 : "transparent";
  const fg = kind === "soft" ? c.ink : kind === "outline" ? c.primary : "#FFFFFF";
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          height: big ? 58 : 48,
          borderRadius: big ? 29 : 24,
          paddingHorizontal: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: kind === "outline" ? 2 : 0,
          borderColor: c.primary,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Txt bold size={big ? 17 : 15} color={fg} numberOfLines={1}>{label}</Txt>}
    </Pressable>
  );
}

/** Selectable pill (ready-time, reject reason, stock state). */
export function Chip({ label, selected, onPress, style }: { label: string; selected?: boolean; onPress: () => void; style?: ViewStyle }) {
  const c = useC();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[
        { height: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.tint : c.surface },
        style,
      ]}
    >
      <Txt bold size={14} color={selected ? c.primary : c.ink} numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}
