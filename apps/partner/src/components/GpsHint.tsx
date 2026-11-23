import { Pressable, View } from "react-native";
import { fixLocationAccess } from "@/lib/riderGps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/i18n";
import { Txt, useC } from "@/ui";
import { Icon } from "./Icon";

/**
 * Small strip above the tab bar when the rider is online but screen-off
 * tracking isn't running (Expo Go, or "all the time" refused) or location is off.
 * Tapping it asks again, or opens this app's settings when Android won't ask.
 */
export function GpsHint({ mode }: { mode: "background" | "foreground" | "denied" | "off" }) {
  const c = useC();
  const t = useT();
  const insets = useSafeAreaInsets();
  if (mode !== "foreground" && mode !== "denied") return null;
  const danger = mode === "denied";
  return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom: Math.max(insets.bottom, 8) + 78 }}>
      <Pressable
        onPress={() => void fixLocationAccess(mode)}
        accessibilityRole="button"
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: danger ? c.danger : c.warningBg }}
      >
        <Icon name="navigate" color={danger ? "#FFFFFF" : c.warning} size={16} />
        <Txt bold size={12} color={danger ? "#FFFFFF" : c.warning} style={{ flex: 1 }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{t(danger ? "gpsDenied" : "gpsForegroundOnly")}</Txt>
        <Icon name="chevronRight" color={danger ? "#FFFFFF" : c.warning} size={16} />
      </Pressable>
    </View>
  );
}
