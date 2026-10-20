import { ActivityIndicator, Pressable, type PressableProps, type ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { radius, useTheme } from "@/theme";

type Props = Omit<PressableProps, "style"> & {
  label: string;
  variant?: "primary" | "outline" | "soft";
  size?: "lg" | "sm";
  loading?: boolean;
  style?: ViewStyle;
};

/** Pill button. Primary = ember fill; outline = ember border; soft = neutral fill. */
export function Button({ label, variant = "primary", size = "lg", loading, disabled, style, ...rest }: Props) {
  const { c } = useTheme();
  const height = size === "lg" ? 56 : 40;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height,
          paddingHorizontal: size === "lg" ? 24 : 16,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          opacity: isDisabled ? 0.55 : 1,
        },
        variant === "primary" && { backgroundColor: pressed ? c.primaryPressed : c.primary },
        variant === "outline" && { borderWidth: 2, borderColor: c.primary, backgroundColor: pressed ? c.tint : c.surface },
        variant === "soft" && { backgroundColor: pressed ? c.border : c.surface2 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? c.onPrimary : c.primary} />
      ) : (
        <AppText
          variant="bodyBold"
          style={{ fontSize: size === "lg" ? 16 : 13 }}
          color={variant === "primary" ? c.onPrimary : variant === "outline" ? c.price : c.ink}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
