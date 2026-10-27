import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { MapTypeToggle } from "./MapTypeToggle";
import { RURAL_MAP_STYLE, type MapKind } from "@/lib/mapStyle";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

export type LatLng = { lat: number; lng: number };
/** Where the current pin came from — a GPS or hand-placed pin is never replaced by a rough pincode centre. */
export type PinSource = "gps" | "manual" | "pincode" | "saved";

type Props = {
  value: LatLng | null;
  /** Called only for a deliberate pin: GPS fix or the user moving the map. */
  onChange: (p: LatLng, source: PinSource) => void;
  /** Where to open when there is no pin yet (e.g. the pincode centre). */
  fallbackCenter?: LatLng | null;
  height?: number;
};

/** Chettikulam town centre — where the map opens when nothing else is known. */
const DEFAULT: LatLng = { lat: 8.2426, lng: 77.6759 };
const ZOOM: Pick<Region, "latitudeDelta" | "longitudeDelta"> = { latitudeDelta: 0.012, longitudeDelta: 0.012 };
/** Worse than this, we warn the user to adjust the pin by hand. */
const WEAK_GPS_M = 60;

/**
 * Drop-a-pin picker: the map moves under a fixed centre pin.
 * - "Use my location" uses high-accuracy GPS and shows ±metres.
 * - Simply opening the map does NOT set a pin; only GPS or the user dragging does.
 */
export function LocationPicker({ value, onChange, fallbackCenter, height = 260 }: Props) {
  const { c } = useTheme();
  const t = useT();
  const mapRef = useRef<MapView>(null);
  const [kind, setKind] = useState<MapKind>("standard");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const userDragging = useRef(false);
  const programmatic = useRef(false);
  const start = value ?? fallbackCenter ?? DEFAULT;

  const goTo = (p: LatLng) => {
    programmatic.current = true;
    mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, ...ZOOM }, 600);
  };

  useEffect(() => {
    if (!value) useMyLocation(true); // first open: try GPS quietly
  }, []);

  // Parent changed the pin (saved address loaded) → follow it, unless the user is dragging.
  useEffect(() => {
    if (value && !userDragging.current) goTo(value);
  }, [value?.lat, value?.lng]);

  // No pin yet but a pincode centre arrived → show that area (without pinning it).
  useEffect(() => {
    if (!value && fallbackCenter) goTo(fallbackCenter);
  }, [fallbackCenter?.lat, fallbackCenter?.lng]);

  async function useMyLocation(silent = false) {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!silent) setError(t("locationDenied"));
        return;
      }
      // High accuracy = real GPS; fresh fix, not a stale cached one. If the user
      // turns down Google's "Location Accuracy" prompt this throws, so fall back
      // to plain GPS without the prompt. The quiet first-open attempt never prompts.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest, mayShowUserSettingsDialog: !silent }).catch(() =>
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false }),
      );
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setAccuracy(pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null);
      goTo(p);
      onChange(p, "gps");
    } catch {
      if (!silent) setError(t("locationFailed"));
    } finally {
      setLocating(false);
    }
  }

  const hint = error
    ? { text: error, color: c.danger }
    : accuracy != null && accuracy > WEAK_GPS_M
      ? { text: t("gpsWeak", { m: accuracy }), color: c.warningText }
      : accuracy != null
        ? { text: t("gpsAccuracy", { m: accuracy }), color: c.successText }
        : { text: t("moveMapHint"), color: c.muted };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ height, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.border }}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          style={{ flex: 1 }}
          mapType={kind}
          customMapStyle={kind === "standard" ? RURAL_MAP_STYLE : []}
          initialRegion={{ latitude: start.lat, longitude: start.lng, ...ZOOM }}
          onPanDrag={() => {
            userDragging.current = true;
            programmatic.current = false;
          }}
          onRegionChange={() => setMoving(true)}
          onRegionChangeComplete={(r) => {
            setMoving(false);
            // Only a drag by the user counts as choosing a spot; map load and our own animations don't.
            if (userDragging.current && !programmatic.current) {
              setAccuracy(null);
              onChange({ lat: r.latitude, lng: r.longitude }, "manual");
            }
            userDragging.current = false;
            programmatic.current = false;
          }}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        />

        {/* Fixed centre pin (lifts while the map moves); faded until a spot is chosen */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginTop: moving ? -46 : -40, opacity: value ? 1 : 0.55 }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, borderWidth: 2.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
              <Icon name="home" color="#FFFFFF" size={20} />
            </View>
            <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FFFFFF", marginTop: -1 }} />
            <View style={{ width: 8, height: 3, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.25)", marginTop: moving ? 8 : 2 }} />
          </View>
        </View>

        <View style={{ position: "absolute", left: 12, top: 12 }}>
          <MapTypeToggle value={kind} onChange={setKind} />
        </View>

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

      <AppText variant="caption" color={hint.color} numberOfLines={2} style={{ height: 34 }}>{hint.text}</AppText>
    </View>
  );
}
