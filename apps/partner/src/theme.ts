/** FreshCut design tokens — from the approved theme canvas (v2). */
export const palette = {
  light: {
    primary: "#E4461F",
    primaryPressed: "#B8361A",
    tint: "#FDE6DF",
    tintSoft: "#FEF3EF",
    ground: "#FBF7F3",
    surface: "#FFFFFF",
    surface2: "#F3ECE6",
    border: "#E8DFD8",
    ink: "#1C1715",
    muted: "#6E625B",
    success: "#1E8A4F",
    successBg: "#DDF3E6",
    warning: "#B4620A",
    warningBg: "#FBEBD6",
    info: "#2F6FD1",
    infoBg: "#DFEAFB",
    danger: "#B8361A",
  },
  dark: {
    primary: "#F0522A",
    primaryPressed: "#D1421F",
    tint: "#3A1D15",
    tintSoft: "#3A1D15",
    ground: "#141110",
    surface: "#1F1A18",
    surface2: "#2A2421",
    border: "#3A332F",
    ink: "#F5EFEA",
    muted: "#A89E97",
    success: "#6FD594",
    successBg: "#16351F",
    warning: "#F2B96B",
    warningBg: "#3A2A12",
    info: "#8FB6F5",
    infoBg: "#172A47",
    danger: "#FF8A66",
  },
} as const;

export const gradients = {
  /** Card background behind product images (shows through transparent PNGs). */
  productCard: ["#F6764F", "#E4461F", "#B8361A"],
  productCardDark: ["#F0522A", "#B8361A", "#6E2112"],
} as const;

export const radius = { card: 24, button: 999, input: 14, thumb: 14 } as const;

/** Headings: Outfit (800/700). Body: Manrope (500–800). Tamil: Noto Sans Tamil. */
export const fonts = {
  heading: "Outfit_800ExtraBold",
  headingMedium: "Outfit_700Bold",
  body: "Manrope_500Medium",
  bodyBold: "Manrope_700Bold",
  bodyExtraBold: "Manrope_800ExtraBold",
} as const;
