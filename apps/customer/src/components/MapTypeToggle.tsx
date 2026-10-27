import { Pressable, View } from "react-native";
import { AppText } from "./AppText";
import type { MapKind } from "@/lib/mapStyle";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/** Map ⇄ Satellite switch. Satellite (hybrid) shows real houses and footpaths. */
export function MapTypeToggle({ value, onChange }: { value: MapKind; onChange: (k: MapKind) => void }) {
  const { c } = useTheme();
  const t = useT();
  const opt = (k: MapKind, label: string) => {
    const on = value === k;
    return (
      <Pressable
        key={k}
        onPress={() => onChange(k)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: on ? c.primary : "transparent", justifyContent: "center" }}
      >
        <AppText variant="label" color={on ? "#FFFFFF" : c.ink} numberOfLines={1} style={{ fontSize: 12 }}>{label}</AppText>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: 19, backgroundColor: c.surface, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
      {opt("standard", t("mapView"))}
      {opt("hybrid", t("satelliteView"))}
    </View>
  );
}
