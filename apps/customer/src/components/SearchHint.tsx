import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useLang, useT } from "@/i18n";
import { fonts, useTheme } from "@/theme";

const SHOW_MS = 2200;
const SLIDE_MS = 220;

/**
 * Search placeholder like Zepto's: a fixed verb ("Search") plus a word that
 * slides up and fades to the next one — "chicken", "mutton", "eggs"…
 * Tamil puts the verb last ("கோழி தேடுங்கள்").
 */
export function SearchHint() {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const words = t("searchWords").split(",").map((w) => w.trim()).filter(Boolean);
  const [i, setI] = useState(0);
  const anim = useRef(new Animated.Value(0)).current; // -1 below, 0 shown, 1 above

  useEffect(() => {
    if (words.length < 2) return;
    const id = setInterval(() => {
      Animated.timing(anim, { toValue: 1, duration: SLIDE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
        setI((x) => (x + 1) % words.length);
        anim.setValue(-1);
        Animated.timing(anim, { toValue: 0, duration: SLIDE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      });
    }, SHOW_MS);
    return () => clearInterval(id);
  }, [words.length]);

  const translateY = anim.interpolate({ inputRange: [-1, 0, 1], outputRange: [14, 0, -14] });
  const opacity = anim.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] });
  const font = lang === "ta" ? fonts.tamil : fonts.bodySemi;
  const base = { fontFamily: font, fontSize: 14, lineHeight: 20, color: c.muted, includeFontPadding: false as const };

  const verb = <Text style={base} numberOfLines={1}>{t("searchVerb")}</Text>;
  const word = (
    <View style={{ height: 20, overflow: "hidden", justifyContent: "center" }}>
      <Animated.Text style={[base, { color: c.ink, transform: [{ translateY }], opacity }]} numberOfLines={1}>
        “{words[i] ?? ""}”
      </Animated.Text>
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }} pointerEvents="none">
      {lang === "ta" ? word : verb}
      {lang === "ta" ? verb : word}
    </View>
  );
}
