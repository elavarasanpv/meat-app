import { useEffect, useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Icon } from "./Icon";
import type { RiderLocation } from "@/hooks/useTracking";
import { useTheme } from "@/theme";

type Point = { lat: number; lng: number };

type Props = {
  rider: RiderLocation | null | undefined;
  pickup: Point | null;
  home: Point | null;
  height: number;
};

/** Calm, low-noise map style: hides POI clutter so our three pins stand out. */
const MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "water", stylers: [{ color: "#cfe3f3" }] },
  { featureType: "landscape", stylers: [{ color: "#f4efe9" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fbe5d6" }] },
];

const DEFAULT = { lat: 11.7383, lng: 78.9594 }; // Kallakurichi

function Pin({ bg, border, icon, size = 40 }: { bg: string; border: string; icon: "logo" | "home"; size?: number }) {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: bg, borderWidth: 2.5, borderColor: border, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
        <Icon name={icon} color={border === "#FFFFFF" ? "#FFFFFF" : border} size={size * 0.5} />
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: border, marginTop: -1 }} />
    </View>
  );
}

/**
 * Zepto-style live map: shop and home pins, the rider glides between updates,
 * a dashed straight line shows the way home (road-snapped routes come later).
 */
export function TrackingMap({ rider, pickup, home, height }: Props) {
  const { c } = useTheme();
  const mapRef = useRef<MapView>(null);
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
        customMapStyle={MAP_STYLE}
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
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} anchor={{ x: 0.5, y: 1 }}>
            <Pin bg="#FFFFFF" border={c.ink} icon="logo" size={36} />
          </Marker>
        ) : null}

        {home ? (
          <Marker coordinate={{ latitude: home.lat, longitude: home.lng }} anchor={{ x: 0.5, y: 1 }}>
            <Pin bg={c.primary} border="#FFFFFF" icon="home" size={40} />
          </Marker>
        ) : null}

        {rider ? (
          <MarkerAnimated coordinate={coord as any} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              {/* pulse halo */}
              <View style={{ position: "absolute", width: 64, height: 64, borderRadius: 32, backgroundColor: c.primary, opacity: 0.15 }} />
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } }}>
                <Icon name="truck" color="#FFFFFF" size={22} />
              </View>
            </View>
          </MarkerAnimated>
        ) : null}
      </MapView>

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
