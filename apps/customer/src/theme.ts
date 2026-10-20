import { useColorScheme } from "react-native";

/** FreshCut design tokens — from the approved theme canvas (v2). */
export const palette = {
  light: {
    primary: "#E4461F",
    primaryPressed: "#B8361A",
    onPrimary: "#FFFFFF",
    tint: "#FDE6DF",
    tintSoft: "#FEF3EF",
    ground: "#FBF7F3",
    surface: "#FFFFFF",
    surface2: "#F3ECE6",
    border: "#E8DFD8",
    ink: "#1C1715",
    muted: "#6E625B",
    price: "#B8361A",
    success: "#1E8A4F",
    successBg: "#DDF3E6",
    successText: "#156A3C",
    warning: "#B4620A",
    warningBg: "#FBEBD6",
    warningText: "#8A4B06",
    info: "#2F6FD1",
    infoBg: "#DFEAFB",
    infoText: "#1F4E9C",
    danger: "#B8361A",
  },
  dark: {
    primary: "#F0522A",
    primaryPressed: "#D1421F",
    onPrimary: "#FFFFFF",
    tint: "#3A1D15",
    tintSoft: "#3A1D15",
    ground: "#141110",
    surface: "#1F1A18",
    surface2: "#2A2421",
    border: "#3A332F",
    ink: "#F5EFEA",
    muted: "#A89E97",
    price: "#FF8A66",
    success: "#6FD594",
    successBg: "#16351F",
    successText: "#6FD594",
    warning: "#F2B96B",
    warningBg: "#3A2A12",
    warningText: "#F2B96B",
    info: "#8FB6F5",
    infoBg: "#172A47",
    infoText: "#8FB6F5",
    danger: "#FF8A66",
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };

export const gradients = {
  /** Card background behind product cut-outs: warm glow top-left → ember → deep red bottom-right. */
  productCard: ["#FF9A6B", "#EE5A2E", "#C4391A", "#8E2611"] as const,
  productCardDark: ["#F5673F", "#C9391C", "#7C2010", "#4A140A"] as const,
  /** Overlay on full-bleed photos so white text stays readable. */
  photoScrim: ["rgba(60,14,6,0.55)", "rgba(60,14,6,0)", "rgba(60,14,6,0.45)"] as const,
};

export const radius = { card: 24, pill: 999, input: 14, thumb: 14, chip: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

/** Headings: Outfit. Body: Manrope. Tamil: Noto Sans Tamil (Latin fonts lack Tamil glyphs). */
export const fonts = {
  display: "Outfit_800ExtraBold",
  title: "Outfit_700Bold",
  body: "Manrope_500Medium",
  bodySemi: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
  bodyExtra: "Manrope_800ExtraBold",
  tamil: "NotoSansTamil_600SemiBold",
  tamilBold: "NotoSansTamil_700Bold",
} as const;

export function useTheme() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return {
    scheme,
    c: palette[scheme] as Colors,
    productGradient: scheme === "dark" ? gradients.productCardDark : gradients.productCard,
  };
}
