import { ActivityIndicator, Pressable, Text, useColorScheme, type TextProps, type ViewStyle } from "react-native";
import { palette } from "@/theme";
import { Icon, type IconName } from "@/components/Icon";

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
  kind?: "primary" | "soft" | "outline" | "outlineDanger" | "success" | "danger";
  big?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Optional icon drawn before the label. */
  icon?: IconName;
  style?: ViewStyle;
};

/** Big-thumb button for shop owners. */
export function Btn({ label, onPress, kind = "primary", big, loading, disabled, icon, style }: BtnProps) {
  const c = useC();
  const outlined = kind === "outline" || kind === "outlineDanger";
  const bg = kind === "primary" ? c.primary : kind === "success" ? c.success : kind === "danger" ? c.danger : kind === "soft" ? c.surface2 : c.surface;
  const fg = kind === "soft" ? c.ink : kind === "outline" ? c.primary : kind === "outlineDanger" ? c.danger : "#FFFFFF";
  const content = (
    <>
      {icon ? <Icon name={icon} color={fg} size={big ? 22 : 18} strokeWidth={2.6} /> : null}
      <Txt bold size={big ? 17 : 15} color={fg} numberOfLines={1}>{label}</Txt>
    </>
  );
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
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          borderWidth: outlined ? 2 : 0,
          borderColor: fg,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : content}
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
