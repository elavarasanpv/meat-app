import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import MapView, { AnimatedRegion, Marker, MarkerAnimated, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { haversineKm } from "@thanjozmart/shared";
import { Icon } from "./Icon";
import { MapTypeToggle } from "./MapTypeToggle";
import { RURAL_MAP_STYLE, type MapKind } from "@/lib/mapStyle";

// Pre-rendered marker bitmaps: custom marker views get clipped on Android's new architecture.
const MARKERS = {
  // Scooter rider, drawn facing right; the left one is its mirror image.
  riderRight: require("../../assets/markers/rider-right.png"),
  riderLeft: require("../../assets/markers/rider-left.png"),
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
  /** The road from the shop to the house, when the server has one; otherwise a straight dashed line is drawn. */
  route?: Point[] | null;
  height: number;
  /** Space the floating header covers at the top of the map. */
  topInset?: number;
  /** How far the card below slides up over the bottom of the map. */
  overlap?: number;
};



const DEFAULT = { lat: 8.2426, lng: 77.6759 }; // Chettikulam

/**
 * Zepto-style live map: shop and home pins joined by the road between them
 * (a dashed straight line until the route loads), with the rider gliding between updates.
 * It zooms to fit the shop and the house, then just the rider and the house
 * once the rider is on the way, in the visible part of the map, clear of the
 * header above and the card overlapping it below.
 */
export function TrackingMap({ rider, pickup, home, route, height, topInset = 0, overlap = 0 }: Props) {
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

  // Face the scooter the way the rider is going: the GPS heading when the phone
  // sends one, else the last move, else towards the house.
  const last = useRef<{ lat: number; lng: number } | null>(null);
  const [facingLeft, setFacingLeft] = useState(false);
  useEffect(() => {
    if (!rider) return;
    const prev = last.current;
    last.current = { lat: rider.lat, lng: rider.lng };
    if (rider.heading != null) setFacingLeft(rider.heading > 180 && rider.heading < 360);
    else if (prev && Math.abs(rider.lng - prev.lng) > 1e-5) setFacingLeft(rider.lng < prev.lng);
    else if (!prev && home) setFacingLeft(home.lng < rider.lng);
  }, [rider?.lat, rider?.lng, rider?.heading]);

  // The view is the shop-to-house trip. The rider joins it only while near
  // that trip: a stray GPS fix far away must not zoom the map out to the country.
  const anchor = home ?? pickup;
  const reach = Math.max(5, pickup && home ? haversineKm(pickup, home) * 2 : 0);
  const riderNear = !!rider && (!anchor || haversineKm(rider, anchor) <= reach);
  const lineFrom = pickup ?? (riderNear ? rider : null);

  // The road is split at the point nearest the rider: what is behind them is
  // drawn faint, what is ahead starts at the rider and ends on the house pin,
  // so the line always meets both markers even when GPS sits off the road.
  const road = route && route.length > 1 ? route : [];
  let passed = 0;
  if (riderNear && rider && road.length > 0) {
    let best = Infinity;
    road.forEach((p, i) => {
      const d = haversineKm(rider, p);
      if (d < best) {
        best = d;
        passed = i;
      }
    });
  }
  const toLatLng = (p: Point) => ({ latitude: p.lat, longitude: p.lng });
  const onTrip = riderNear && !!rider;
  const behind = onTrip ? [...(pickup ? [pickup] : []), ...road.slice(0, passed + 1)] : [];
  const left = [...(onTrip ? [rider!] : pickup ? [pickup] : []), ...(onTrip ? road.slice(passed) : road), ...(home ? [home] : [])];

  const fit = (animated = true) => {
    // Once the rider is on the trip, show only what is left of it: the rider,
    // the house and the road between them, so a nearby rider fills the map.
    const ahead = riderNear ? road.slice(passed) : road;
    const pts = [riderNear && home ? null : pickup, home, riderNear ? rider : null, ...ahead].filter(Boolean).map((p) => ({ latitude: p!.lat, longitude: p!.lng }));
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

  // Re-fit when the rider first appears, home changes, or the rider has covered
  // about half of what was left (the map zooms in a few times over a trip);
  // in between the user may pan freely.
  const leftKm = riderNear && rider && home ? haversineKm(rider, home) : null;
  const zoomStep = leftKm === null ? null : Math.round(Math.log2(Math.max(leftKm, 0.05)));
  useEffect(() => {
    const id = setTimeout(() => fit(true), 400);
    return () => clearTimeout(id);
  }, [riderNear, zoomStep, home?.lat, home?.lng, pickup?.lat, pickup?.lng, height, route?.length]);

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
        {road.length > 0 ? (
          <>
            {behind.length > 1 ? <Polyline coordinates={behind.map(toLatLng)} strokeColor={c.primary + "40"} strokeWidth={4} lineCap="round" lineJoin="round" /> : null}
            <Polyline coordinates={left.map(toLatLng)} strokeColor={c.primary} strokeWidth={4} lineCap="round" lineJoin="round" zIndex={2} />
          </>
        ) : home && lineFrom ? (
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
          <MarkerAnimated coordinate={coord as any} anchor={{ x: 0.5, y: 0.88 }} image={facingLeft ? MARKERS.riderLeft : MARKERS.riderRight} zIndex={10} />
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
