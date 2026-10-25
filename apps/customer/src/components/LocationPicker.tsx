import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

export type LatLng = { lat: number; lng: number };

type Props = {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  height?: number;
};

/** Kallakurichi town centre — where the map opens when nothing is set yet. */
const DEFAULT: LatLng = { lat: 11.7383, lng: 78.9594 };
const ZOOM: Pick<Region, "latitudeDelta" | "longitudeDelta"> = { latitudeDelta: 0.008, longitudeDelta: 0.008 };

/**
 * "Drop a pin" picker: the map moves under a fixed centre pin (easier on a
 * small screen than dragging a marker), plus a "Use my location" button.
 */
export function LocationPicker({ value, onChange, height = 260 }: Props) {
  const { c } = useTheme();
  const t = useT();
  const mapRef = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const start = value ?? DEFAULT;

  useEffect(() => {
    if (!value) useMyLocation(true); // first open: try GPS silently
  }, []);

  async function useMyLocation(silent = false) {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!silent) setError(t("locationDenied"));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, ...ZOOM }, 500);
      onChange(p);
    } catch {
      if (!silent) setError(t("locationFailed"));
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ height, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.border }}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          style={{ flex: 1 }}
          initialRegion={{ latitude: start.lat, longitude: start.lng, ...ZOOM }}
          onRegionChange={() => setMoving(true)}
          onRegionChangeComplete={(r) => {
            setMoving(false);
            onChange({ lat: r.latitude, lng: r.longitude });
          }}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        />

        {/* Fixed centre pin (lifts slightly while the map moves) */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginTop: moving ? -46 : -40 }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, borderWidth: 2.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
              <Icon name="home" color="#FFFFFF" size={20} />
            </View>
            <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FFFFFF", marginTop: -1 }} />
            <View style={{ width: 8, height: 3, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.25)", marginTop: moving ? 8 : 2 }} />
          </View>
        </View>

        {/* Use my location */}
        <Pressable
          onPress={() => useMyLocation(false)}
          accessibilityRole="button"
          accessibilityLabel={t("useMyLocation")}
          style={({ pressed }) => ({ position: "absolute", right: 12, bottom: 12, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: pressed ? c.tint : c.surface, flexDirection: "row", alignItems: "center", gap: 6, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } })}
        >
          {locating ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="pin" color={c.primary} size={18} />}
          <AppText variant="label" color={c.price} numberOfLines={1}>{t("useMyLocation")}</AppText>
        </Pressable>
      </View>

      <AppText variant="caption" color={error ? c.danger : c.muted} numberOfLines={2} style={{ height: 34 }}>
        {error ?? t("moveMapHint")}
      </AppText>
    </View>
  );
}
