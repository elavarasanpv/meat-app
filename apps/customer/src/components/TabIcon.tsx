import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/theme";

export type TabIconName = "home" | "orders" | "cart" | "help";

type GlyphProps = { color: string; filled: boolean; size: number };

/**
 * Chunky rounded tab icons, each in two states: outline (idle) and solid
 * (selected). Details inside a filled glyph (door, receipt lines, basket
 * ribs) are knocked out in `knock` so they stay visible on the solid shape.
 */
function HomeGlyph({ color, filled, size, knock }: GlyphProps & { knock: string }) {
  const sw = 2.2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.5 11 12 3.5l8.5 7.5V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {filled ? <Path d="M10 21v-6h4v6z" fill={knock} /> : null}
    </Svg>
  );
}

function OrdersGlyph({ color, filled, size, knock }: GlyphProps & { knock: string }) {
  const sw = 2.2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5.5 3.5h13v17l-2.6-1.8-2.6 1.8-1.3-1-1.3 1-2.6-1.8-2.6 1.8z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9 8.5h6M9 12h6" stroke={filled ? knock : color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

function CartGlyph({ color, filled, size, knock }: GlyphProps & { knock: string }) {
  const sw = 2.2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.5 10h17l-1.8 9a1.5 1.5 0 0 1-1.5 1.2H6.8A1.5 1.5 0 0 1 5.3 19z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8 10l3-5.5M16 10l-3-5.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Path d="M9.5 14v3M14.5 14v3" stroke={filled ? knock : color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

function HelpGlyph({ color, filled, size }: GlyphProps) {
  const sw = 2.2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 13a7.5 7.5 0 0 1 15 0" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Path
        d="M4.5 13h3v6h-1a2 2 0 0 1-2-2zM19.5 13h-3v6h1a2 2 0 0 0 2-2z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Path d="M16.5 19v1a2 2 0 0 1-2 2H12" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const GLYPHS = { home: HomeGlyph, orders: OrdersGlyph, cart: CartGlyph, help: HelpGlyph } as const;

/**
 * Tab bar icon: a tinted pill grows behind the icon and the glyph fills in
 * solid when the tab is selected. The outline and the solid are stacked and
 * cross-faded, so the change looks like the icon filling up rather than a swap.
 */
export function TabIcon({ name, focused, color, size = 24, pill = true }: { name: TabIconName; focused: boolean; color: string; size?: number; pill?: boolean }) {
  const { c } = useTheme();
  const G = GLYPHS[name];
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: focused ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [focused]);

  return (
    <View style={{ width: pill ? 56 : size + 4, height: pill ? 34 : size + 4, alignItems: "center", justifyContent: "center" }}>
      {pill ? (
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 17, backgroundColor: c.tint, opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}
        />
      ) : null}
      <Animated.View style={{ opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
        <G color={color} filled={false} size={size} knock={c.tint} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
        <G color={color} filled size={size} knock={c.tint} />
      </Animated.View>
    </View>
  );
}
