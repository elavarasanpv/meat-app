import { createContext, useContext } from "react";
import { useColorScheme } from "react-native";

/** Thanjoz Mart design tokens — from the approved theme canvas (v2). */
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
  /** Product card: white at the top melting into a soft ember glow at the bottom (top→bottom). */
  productCard: ["#FFFFFF", "#FFF4EE", "#FFD6C2", "#FFB08E"] as const,
  productCardDark: ["#211B19", "#2A1F1B", "#3F2217", "#5A2A18"] as const,
  /** Product card border */
  productCardBorder: "#F6DCCF",
  productCardBorderDark: "#3F332E",
  /** Overlay on full-bleed photos so white text stays readable. */
  photoScrim: ["rgba(60,14,6,0.55)", "rgba(60,14,6,0)", "rgba(60,14,6,0.45)"] as const,
};

/** Tinted panels that sit behind ink text: peach by day, deep ember by night. */
export const tones = {
  light: {
    /** Home / login header wash. */
    header: ["#FFF1E8", "#FFE0CC", "#FBC9A6"] as const,
    groceryHeader: ["#EEF7F0", "#D9EFDF", "#BFE4CB"] as const,
    /** White chips and buttons that float on a tinted panel. */
    raised: "#FFFFFF",
    /** Grocery product card wash and its border. */
    groceryCard: ["#FFFFFF", "#F6FBF7", "#E9F5EC", "#DDF0E2"] as const,
    groceryBorder: "#D8EBDD",
    /** Contact shadow under product cut-outs. */
    contact: "#7A2A10",
    /** Dimmed backdrop behind bottom sheets. */
    scrim: "rgba(20,8,4,0.45)",
    /** Voice sheet wash. */
    sheet: ["#FFE6D8", "#FFF6EF", "#FFFFFF"] as const,
    /** Faint ink fill for grab handles and round close buttons. */
    faint: "rgba(28,23,21,0.08)",
    /** Solid fills that carry white text. */
    successFill: "#1E8A4F",
    warningFill: "#B4620A",
    groceryLine: "#BFE4CB",
    /** Floating cart pill: rim, body (android / ios) and avatar disc. */
    glassRim: ["rgba(255,255,255,0.95)", "rgba(255,255,255,0.35)", "rgba(255,255,255,0.75)"] as const,
    glassAndroid: ["rgba(255,255,255,0.9)", "rgba(255,255,255,0.74)", "rgba(255,255,255,0.84)"] as const,
    glassIos: ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.3)", "rgba(255,255,255,0.45)"] as const,
  },
  dark: {
    header: ["#2A1812", "#331A11", "#44200F"] as const,
    groceryHeader: ["#12261A", "#15301F", "#1A3D27"] as const,
    raised: "#2F2825",
    groceryCard: ["#1F1A18", "#1C211C", "#1A2B20", "#193725"] as const,
    groceryBorder: "#2A3A30",
    contact: "#000000",
    scrim: "rgba(0,0,0,0.6)",
    sheet: ["#3A1D13", "#261A16", "#1F1A18"] as const,
    faint: "rgba(255,255,255,0.1)",
    successFill: "#1E8A4F",
    warningFill: "#B4620A",
    groceryLine: "#2A4A37",
    glassRim: ["rgba(255,255,255,0.3)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.16)"] as const,
    glassAndroid: ["rgba(52,44,40,0.97)", "rgba(38,32,29,0.95)", "rgba(46,38,35,0.97)"] as const,
    glassIos: ["rgba(52,44,40,0.6)", "rgba(38,32,29,0.45)", "rgba(46,38,35,0.55)"] as const,
  },
} as const;

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

/** Grocery accent: the brand's green/yellow half. Wrap a subtree in <Accent vertical="grocery"> to swap it in. */
export const GROCERY_ACCENT: Partial<Colors> = {
  primary: "#1E8A4F",
  primaryPressed: "#166B3D",
  tint: "#E3F3E9",
  tintSoft: "#F1F8F3",
  price: "#1E8A4F",
};
const GROCERY_ACCENT_DARK: Partial<Colors> = {
  primary: "#249A5A",
  primaryPressed: "#1E8A4F",
  tint: "#173323",
  tintSoft: "#12261A",
  price: "#6FD594",
};
export const AccentContext = createContext<"meat" | "grocery">("meat");
export const Accent = AccentContext.Provider;
export function withAccent(c: Colors, vertical?: "meat" | "grocery" | null, dark = false): Colors {
  return vertical === "grocery" ? { ...c, ...(dark ? GROCERY_ACCENT_DARK : GROCERY_ACCENT) } : c;
}

/**
 * The app ships light-only: one look to design and test, and the food photos are shot for a light ground.
 * The dark palette is kept and works; set this to false to follow the phone again (and set
 * userInterfaceStyle back to "automatic" in app.json, and drop lightOnly from app.config.ts).
 */
const LOCK_LIGHT = true;

export function useTheme() {
  const system = useColorScheme() === "dark" ? "dark" : "light";
  const scheme: "light" | "dark" = LOCK_LIGHT ? "light" : system;
  const vertical = useContext(AccentContext);
  const dark = scheme === "dark";
  return {
    scheme,
    dark,
    tone: tones[scheme],
    /** A white highlight at the given strength; on dark it drops to a faint sheen so panels don't turn grey. */
    glow: (a: number) => `rgba(255,255,255,${dark ? +(a * 0.1).toFixed(3) : a})`,
    c: withAccent(palette[scheme] as Colors, vertical, dark),
    productGradient: scheme === "dark" ? gradients.productCardDark : gradients.productCard,
    productBorder: scheme === "dark" ? gradients.productCardBorderDark : gradients.productCardBorder,
  };
}
