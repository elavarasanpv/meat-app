import { Pressable, Text } from "react-native";
import { useLang } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

/**
 * Pill that switches between English and Tamil. Shows the language you'd switch TO.
 * Fixed width so the header never shifts when the label changes.
 */
export function LangToggle() {
  const { c } = useTheme();
  const { lang, toggle } = useLang();
  const toTamil = lang === "en";

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={toTamil ? "Switch language to Tamil" : "Switch language to English"}
      style={({ pressed }) => ({
        width: 84,
        height: 40,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: c.border,
        backgroundColor: pressed ? c.surface2 : c.surface,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Text
        numberOfLines={1}
        style={{ fontFamily: toTamil ? fonts.tamil : fonts.bodyBold, fontSize: 13, lineHeight: 18, color: c.ink, includeFontPadding: false }}
      >
        {toTamil ? "தமிழ்" : "English"}
      </Text>
    </Pressable>
  );
}
