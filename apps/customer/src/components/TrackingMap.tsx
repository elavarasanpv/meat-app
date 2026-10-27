import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Icon } from "./Icon";
import { MapTypeToggle } from "./MapTypeToggle";
import { RURAL_MAP_STYLE, type MapKind } from "@/lib/mapStyle";

// Pre-rendered marker bitmaps: custom marker views get clipped on Android's new architecture.
const MARKERS = {
  rider: require("../../assets/markers/rider.png"),
  home: require("../../assets/markers/home.png"),
  shop: require("../../assets/markers/shop.png"),
};
import type { RiderLocation } from "@/hooks/useTracking";
import { useTheme } from "@/theme";

type Point = { lat: number; lng: number };

type Props = {
  rider: RiderLocation | null | undefined;
  pickup: Point | null;
  home: Point | null;
  height: number;
};



const DEFAULT = { lat: 8.2426, lng: 77.6759 }; // Chettikulam


/**
 * Zepto-style live map: shop and home pins, the rider glides between updates,
 * a dashed straight line shows the way home (road-snapped routes come later).
 */
export function TrackingMap({ rider, pickup, home, height }: Props) {
  const { c } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [kind, setKind] = useState<MapKind>("standard");
  const coord = useRef(
    new AnimatedRegion({
      latitude: rider?.lat ?? pickup?.lat ?? DEFAULT.lat,
      longitude: rider?.lng ?? pickup?.lng ?? DEFAULT.lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  // Glide the rider marker to each new position instead of jumping.
  useEffect(() => {
    if (!rider) return;
    coord.timing({ latitude: rider.lat, longitude: rider.lng, duration: 1200, useNativeDriver: false } as any).start();
  }, [rider?.lat, rider?.lng]);

  const fit = (animated = true) => {
    const pts = [rider && { latitude: rider.lat, longitude: rider.lng }, home && { latitude: home.lat, longitude: home.lng }].filter(Boolean) as { latitude: number; longitude: number }[];
    if (pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current?.animateToRegion({ ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, animated ? 600 : 0);
      return;
    }
    mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 90, bottom: 120, left: 70, right: 70 }, animated });
  };

  // Re-fit when the rider first appears or home changes; afterwards the user may pan freely.
  useEffect(() => {
    const id = setTimeout(() => fit(true), 400);
    return () => clearTimeout(id);
  }, [!!rider, home?.lat, home?.lng]);

  const center = rider ?? home ?? pickup ?? DEFAULT;

  return (
    <View style={{ height, overflow: "hidden" }}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={{ flex: 1 }}
        mapType={kind}
        customMapStyle={kind === "standard" ? RURAL_MAP_STYLE : []}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onMapReady={() => fit(false)}
      >
        {rider && home ? (
          <Polyline
            coordinates={[
              { latitude: rider.lat, longitude: rider.lng },
              { latitude: home.lat, longitude: home.lng },
            ]}
            strokeColor={c.primary}
            strokeWidth={3}
            lineDashPattern={[8, 8]}
          />
        ) : null}

        {pickup ? (
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} anchor={{ x: 0.5, y: 1 }} image={MARKERS.shop} />
        ) : null}

        {home ? (
          <Marker coordinate={{ latitude: home.lat, longitude: home.lng }} anchor={{ x: 0.5, y: 1 }} image={MARKERS.home} />
        ) : null}

        {rider ? (
          <MarkerAnimated coordinate={coord as any} anchor={{ x: 0.5, y: 0.5 }} image={MARKERS.rider} zIndex={10} />
        ) : null}
      </MapView>

      {/* Map / Satellite */}
      <View style={{ position: "absolute", left: 14, bottom: 14 }}>
        <MapTypeToggle value={kind} onChange={setKind} />
      </View>

      {/* Recenter */}
      <Pressable
        onPress={() => fit(true)}
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
        style={{ position: "absolute", right: 14, bottom: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
      >
        <Icon name="pin" color={c.primary} size={20} />
      </Pressable>
    </View>
  );
}
