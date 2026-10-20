import { Pressable, Text } from "react-native";
import { useLang } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

/** Pill that switches between English and Tamil. Shows the language you'd switch TO. */
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
        height: 40,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: c.border,
        backgroundColor: pressed ? c.surface2 : c.surface,
        justifyContent: "center",
      })}
    >
      <Text style={{ fontFamily: toTamil ? fonts.tamil : fonts.bodyBold, fontSize: 13, color: c.ink }}>
        {toTamil ? "தமிழ்" : "English"}
      </Text>
    </Pressable>
  );
}
