import { Text, type TextProps, type TextStyle } from "react-native";
import { fonts, useTheme } from "@/theme";
import { useLang } from "@/i18n";

type Variant = "display" | "title" | "subtitle" | "body" | "bodyBold" | "label" | "caption" | "price";

const latin: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  subtitle: { fontFamily: fonts.title, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  bodyBold: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 },
  caption: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 17 },
  price: { fontFamily: fonts.bodyExtra, fontSize: 16, lineHeight: 20 },
};

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  /** Use muted text colour. */
  muted?: boolean;
};

/**
 * All text goes through here so the font switches to Noto Sans Tamil
 * when the language is Tamil (Outfit/Manrope have no Tamil glyphs).
 */
export function AppText({ variant = "body", color, muted, style, ...rest }: Props) {
  const { c } = useTheme();
  const lang = useLang((s) => s.lang);
  const base = latin[variant];
  const bold = variant !== "body" && variant !== "caption";
  const tamil: TextStyle =
    lang === "ta"
      ? {
          fontFamily: bold ? fonts.tamilBold : fonts.tamil,
          letterSpacing: 0,
          // Tamil glyphs are taller; give them room.
          lineHeight: base.lineHeight ? Math.round(base.lineHeight * 1.3) : undefined,
          fontSize: base.fontSize && base.fontSize > 18 ? base.fontSize - 4 : base.fontSize,
        }
      : {};
  return (
    <Text
      style={[base, tamil, { color: color ?? (muted ? c.muted : c.ink) }, style]}
      {...rest}
    />
  );
}
