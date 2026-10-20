import { Text, type TextProps, type TextStyle } from "react-native";
import { fonts, useTheme } from "@/theme";
import { useLang } from "@/i18n";

type Variant = "display" | "title" | "subtitle" | "body" | "bodyBold" | "label" | "caption" | "price";

/**
 * Line heights are generous enough for Tamil glyphs, which are taller than
 * Latin ones, so the SAME line box is used for both languages. Only the
 * font size changes for Tamil, never the line height — that is what keeps
 * the layout from shifting when the language toggles.
 */
const base: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28 },
  subtitle: { fontFamily: fonts.title, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  bodyBold: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 22 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 18 },
  caption: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 18 },
  price: { fontFamily: fonts.bodyExtra, fontSize: 16, lineHeight: 22 },
};

/** Tamil uses Noto Sans Tamil at ~88% size so it fits the same line box. */
const tamil: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.tamilBold, fontSize: 26, letterSpacing: 0 },
  title: { fontFamily: fonts.tamilBold, fontSize: 17 },
  subtitle: { fontFamily: fonts.tamilBold, fontSize: 14 },
  body: { fontFamily: fonts.tamil, fontSize: 13 },
  bodyBold: { fontFamily: fonts.tamilBold, fontSize: 13 },
  label: { fontFamily: fonts.tamilBold, fontSize: 11 },
  caption: { fontFamily: fonts.tamil, fontSize: 11 },
  price: { fontFamily: fonts.tamilBold, fontSize: 15 },
};

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  /** Use muted text colour. */
  muted?: boolean;
};

/** All text goes through here so fonts/sizes switch with the language without moving the layout. */
export function AppText({ variant = "body", color, muted, style, ...rest }: Props) {
  const { c } = useTheme();
  const lang = useLang((s) => s.lang);
  return (
    <Text
      style={[
        base[variant],
        lang === "ta" && tamil[variant],
        { color: color ?? (muted ? c.muted : c.ink), includeFontPadding: false },
        style,
      ]}
      {...rest}
    />
  );
}
