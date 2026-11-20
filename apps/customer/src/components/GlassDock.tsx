import { Children, type ReactNode } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

const LIFT = 18; // soft shadow strip above the panel

/**
 * The frosted-glass panel that floats over the bottom of a cart: the page
 * scrolls underneath and shows through. Each child is its own section,
 * split from the next by a hairline, so the address and the Place order
 * button read as two distinct blocks.
 *
 * iOS gets a real blur. Android gets a translucent sheet: expo-blur's
 * experimental Android blur washed out the whole screen when tried here.
 *
 * It is absolutely positioned, so the page must pad its scroll content by
 * the height reported through onHeight.
 */
export function GlassDock({ children, onHeight }: { children: ReactNode; onHeight?: (h: number) => void }) {
  const { scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = scheme === "dark";
  const ios = Platform.OS === "ios";
  const sections = Children.toArray(children).filter(Boolean);
  const onLayout = (e: LayoutChangeEvent) => onHeight?.(Math.round(e.nativeEvent.layout.height) - LIFT);
  const wash = dark ? `rgba(24,20,18,${ios ? 0.55 : 0.86})` : `rgba(255,255,255,${ios ? 0.6 : 0.84})`;
  const line = dark ? "rgba(255,255,255,0.12)" : "rgba(20,20,20,0.09)";

  return (
    <View onLayout={onLayout} pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", dark ? "rgba(0,0,0,0.35)" : "rgba(60,30,20,0.10)"]} style={{ height: LIFT + 26, marginBottom: -26 }} />
      <View style={{ borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: "hidden", borderTopWidth: 1.5, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: dark ? "rgba(255,255,255,0.16)" : "#FFFFFF" }}>
        <BlurView intensity={dark ? 50 : 70} tint={dark ? "dark" : "light"}>
          <View style={{ paddingBottom: insets.bottom, backgroundColor: wash }}>
            {sections.map((s, i) => (
              <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                {s}
              </View>
            ))}
          </View>
        </BlurView>
      </View>
    </View>
  );
}
