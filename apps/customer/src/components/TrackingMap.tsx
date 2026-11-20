import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { haversineKm } from "@freshcut/shared";
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
  /** Space the floating header covers at the top of the map. */
  topInset?: number;
  /** How far the card below slides up over the bottom of the map. */
  overlap?: number;
};



const DEFAULT = { lat: 8.2426, lng: 77.6759 }; // Chettikulam

/**
 * Zepto-style live map: shop and home pins joined by a dashed straight line
 * (road-snapped routes come later), with the rider gliding between updates.
 * It zooms to fit the shop, the house and the rider in the visible part of
 * the map, clear of the header above and the card overlapping it below.
 */
export function TrackingMap({ rider, pickup, home, height, topInset = 0, overlap = 0 }: Props) {
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

  // The view is the shop-to-house trip. The rider joins it only while near
  // that trip: a stray GPS fix far away must not zoom the map out to the country.
  const anchor = home ?? pickup;
  const reach = Math.max(5, pickup && home ? haversineKm(pickup, home) * 2 : 0);
  const riderNear = !!rider && (!anchor || haversineKm(rider, anchor) <= reach);
  const lineFrom = pickup ?? (riderNear ? rider : null);

  const fit = (animated = true) => {
    const pts = [pickup, home, riderNear ? rider : null].filter(Boolean).map((p) => ({ latitude: p!.lat, longitude: p!.lng }));
    if (pts.length === 0) return;
    const lats = pts.map((p) => p.latitude);
    const lngs = pts.map((p) => p.longitude);
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    // One point, or all of them on the same spot (rider at the door, no shop pin): a street-level view.
    if (span < 0.0004) {
      mapRef.current?.animateToRegion({ latitude: lats[0], longitude: lngs[0], latitudeDelta: 0.006, longitudeDelta: 0.006 }, animated ? 600 : 0);
      return;
    }
    // Keep the pins clear of the header and the overlapping card, but never
    // let the padding eat the whole map: that zooms it out to the world.
    let top = topInset + 64; // pins are drawn upwards from their point
    let bottom = overlap + 28;
    const room = height - 70;
    if (top + bottom > room) {
      const k = room / (top + bottom);
      top *= k;
      bottom *= k;
    }
    mapRef.current?.fitToCoordinates(pts, { edgePadding: { top, bottom, left: 56, right: 56 }, animated });
  };

  // Re-fit when the rider first appears or home changes; afterwards the user may pan freely.
  useEffect(() => {
    const id = setTimeout(() => fit(true), 400);
    return () => clearTimeout(id);
  }, [riderNear, home?.lat, home?.lng, pickup?.lat, pickup?.lng, height]);

  const center = home ?? pickup ?? rider ?? DEFAULT;

  return (
    <View style={{ height, overflow: "hidden" }}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={{ flex: 1 }}
        mapType={kind}
        customMapStyle={kind === "standard" ? RURAL_MAP_STYLE : []}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 }}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onMapReady={() => fit(false)}
      >
        {/* The way from the shop to the house; from the rider when the shop has no pin */}
        {home && lineFrom ? (
          <Polyline
            coordinates={[
              { latitude: lineFrom.lat, longitude: lineFrom.lng },
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
      <View style={{ position: "absolute", left: 14, bottom: 14 + overlap }}>
        <MapTypeToggle value={kind} onChange={setKind} />
      </View>

      {/* Recenter */}
      <Pressable
        onPress={() => fit(true)}
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
        style={{ position: "absolute", right: 14, bottom: 14 + overlap, width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
      >
        <Icon name="pin" color={c.primary} size={20} />
      </Pressable>
    </View>
  );
}
