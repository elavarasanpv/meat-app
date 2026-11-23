import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { MapTypeToggle } from "@/components/MapTypeToggle";
import { useAddresses, useServiceablePincodes, useUpdateAddressLocation } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { RURAL_MAP_STYLE, type MapKind } from "@/lib/mapStyle";
import { haversineKm } from "@thanjozmart/shared";
import { DEFAULT_CENTER, describePlace, findPlace, nameFor, NO_PLACE, usePinDraft, zoneFor, type LatLng, type Place } from "@/lib/pin";
import { fonts, radius, useTheme } from "@/theme";

/** ~1.3 km across: close enough to see lanes, wide enough to recognise the village. */
const ZOOM: Pick<Region, "latitudeDelta" | "longitudeDelta"> = { latitudeDelta: 0.012, longitudeDelta: 0.012 };
/** Worse than this, we ask the user to drag the map to their gate. */
const WEAK_GPS_M = 60;
/** The map settling within this of the last checked spot is the same spot: no new lookup. */
const SAME_SPOT_KM = 0.008;
/** Height of the bottom sheet in its normal state; the map ends here and never resizes. */
const SHEET_BASE = 172;
/** The sheet's rounded top overlaps the map by this much; the map keeps its centre and logo clear of it. */
const SHEET_LIP = 24;

/**
 * Full-screen "Select your location" step (Zepto-style): a big map under a fixed
 * centre pin, search by village/street, GPS button, and the place under the pin
 * named at the bottom with a Confirm button.
 *
 * Modes:
 * - `id`   → moving the pin of a saved address; Confirm saves straight to it.
 * - `from=form` → the address form sent us to change its pin; Confirm goes back.
 * - otherwise → first step of "Add address"; Confirm opens the form prefilled.
 */
export default function SelectLocationScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const address = useAddresses().data?.find((a) => a.id === id);
  const update = useUpdateAddressLocation();
  const served = useServiceablePincodes();
  const draft = usePinDraft((s) => s.draft);
  const setDraft = usePinDraft((s) => s.set);

  const mapRef = useRef<MapView>(null);
  const [kind, setKind] = useState<MapKind>("standard");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [naming, setNaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameReq = useRef(0);
  const lastCenter = useRef<LatLng | null>(null);

  // The map reports "settled" for every tiny shift too; only a real move is a new spot to check.
  function onSettled(p: LatLng) {
    setMoving(false);
    if (lastCenter.current && haversineKm(lastCenter.current, p) < SAME_SPOT_KM) return;
    lastCenter.current = p;
    setCenter(p);
  }

  const saved = address?.lat != null && address?.lng != null ? { lat: address.lat, lng: address.lng } : null;
  const start = saved ?? (from === "form" && draft ? { lat: draft.lat, lng: draft.lng } : null);

  const goTo = (p: LatLng) => mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, ...ZOOM }, 600);

  // Step the zoom one level; pinch works too, but big buttons are easier on a small rural phone.
  async function zoomBy(step: 1 | -1) {
    const cam = await mapRef.current?.getCamera();
    if (!cam?.zoom) return;
    mapRef.current?.animateCamera({ ...cam, zoom: Math.min(21, Math.max(13, cam.zoom + step)) }, { duration: 250 });
  }

  // First open: a saved/draft pin wins; otherwise quietly try GPS, else the town centre.
  useEffect(() => {
    if (start) return;
    useMyLocation(true);
  }, []);

  // Name whatever is under the pin once the map settles (debounced; stale replies dropped).
  useEffect(() => {
    if (!center) return;
    const req = ++nameReq.current;
    setNaming(true);
    const h = setTimeout(async () => {
      try {
        const p = await describePlace(center);
        if (req === nameReq.current) setPlace(p);
      } catch {
        if (req === nameReq.current) setPlace(NO_PLACE);
      } finally {
        if (req === nameReq.current) setNaming(false);
      }
    }, 350);
    return () => clearTimeout(h);
  }, [center?.lat, center?.lng]);

  async function useMyLocation(silent = false) {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!silent) setError(t("locationDenied"));
        return;
      }
      // Real GPS first; if Google's accuracy prompt is declined this throws, so fall back to plain GPS.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest, mayShowUserSettingsDialog: !silent }).catch(() =>
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false }),
      );
      setAccuracy(pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null);
      goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      if (!silent) setError(t("locationFailed"));
    } finally {
      setLocating(false);
    }
  }

  async function search() {
    Keyboard.dismiss();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const p = await findPlace(query);
      if (p) {
        setAccuracy(null);
        goTo(p);
      } else setError(t("placeNotFound"));
    } catch {
      setError(t("placeNotFound"));
    } finally {
      setSearching(false);
    }
  }

  async function confirm() {
    if (!center || !zone) return;
    if (id) {
      try {
        await update.mutateAsync({ id, lat: center.lat, lng: center.lng, pincode: zone.pincode });
        router.back();
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    setDraft({ ...center, ...shown, pincode: zone.pincode });
    if (from === "form") router.back();
    else router.replace("/address/new");
  }

  // The last checked place stays on screen while the map moves, so the sheet never jumps.
  const zone = center && place && served.data ? zoneFor(center, place.pincode, served.data) : null;
  const shown = place ? nameFor(place, zone) : { title: "", subtitle: "" };
  const busy = moving || naming || (!!center && !place);
  const notServed = !!place && !!served.data && !zone;
  const areas = (served.data ?? []).filter((z, i, all) => z.lat != null && z.lng != null && all.findIndex((o) => (o.area ?? o.pincode) === (z.area ?? z.pincode)) === i);
  const status = error
    ? { text: error, color: c.danger }
    : served.isError
      ? { text: t("areaCheckFailed"), color: c.danger }
      : accuracy != null && accuracy > WEAK_GPS_M
        ? { text: t("gpsWeak", { m: accuracy }), color: c.warningText }
        : zone
          ? { text: t("pincodeServed", { area: zone.area ?? zone.pincode }), color: c.successText }
          : { text: t("deliverHereSub"), color: c.muted };

  const initial = start ?? DEFAULT_CENTER;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" color={c.ink} />
        </Pressable>
        <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>{t("selectLocation")}</AppText>
      </View>

      {/* Search a village / street by name */}
      <View style={{ marginHorizontal: 20, marginVertical: 12, flexDirection: "row", alignItems: "center", gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border }}>
        <Icon name="search" color={c.muted} size={20} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          autoCorrect={false}
          placeholder={t("searchPlace")}
          placeholderTextColor={c.muted}
          style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink }}
          accessibilityLabel={t("searchPlace")}
        />
        {searching ? <ActivityIndicator size="small" color={c.primary} /> : query ? (
          <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel={t("close")}>
            <AppText variant="bodyBold" muted style={{ fontSize: 16 }}>✕</AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        {/* The map has a fixed size: the sheet below grows over it, so showing a message never moves the map. */}
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: SHEET_BASE + insets.bottom - SHEET_LIP }}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          style={{ flex: 1 }}
          mapPadding={{ top: 0, left: 0, right: 0, bottom: SHEET_LIP }}
          mapType={kind}
          customMapStyle={kind === "standard" ? RURAL_MAP_STYLE : []}
          initialRegion={{ latitude: initial.lat, longitude: initial.lng, ...ZOOM }}
          onPanDrag={() => setAccuracy(null)}
          onRegionChange={() => setMoving(true)}
          onRegionChangeComplete={(r) => onSettled({ lat: r.latitude, lng: r.longitude })}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        />

        {/* Fixed centre pin with the "delivered here" callout; the pin lifts while the map moves */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: SHEET_LIP, alignItems: "center", justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginTop: moving ? -118 : -112 }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: c.ink, alignItems: "center", maxWidth: 300 }}>
              <AppText variant="bodyBold" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 15 }}>{t("deliverHere")}</AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={2} style={{ textAlign: "center" }}>{t("moveMapHint")}</AppText>
            </View>
            <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: c.ink, marginBottom: 6 }} />
            <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: c.primary, borderWidth: 2.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", elevation: 4 }}>
              <Icon name="home" color="#FFFFFF" size={22} />
            </View>
            <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FFFFFF", marginTop: -1 }} />
            <View style={{ width: 10, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.3)", marginTop: moving ? 10 : 2 }} />
          </View>
        </View>

        <View style={{ position: "absolute", left: 16, top: 16 }}>
          <MapTypeToggle value={kind} onChange={setKind} />
        </View>

        </View>

        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          {/* Zoom and GPS ride on top of the sheet */}
          <View pointerEvents="box-none" style={{ alignItems: "flex-end", paddingRight: 16, paddingBottom: 12, gap: 12 }}>
            <View style={{ borderRadius: 14, backgroundColor: c.surface, overflow: "hidden", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
              {([1, -1] as const).map((step) => (
                <Pressable
                  key={step}
                  onPress={() => zoomBy(step)}
                  accessibilityRole="button"
                  accessibilityLabel={step === 1 ? "Zoom in" : "Zoom out"}
                  style={({ pressed }) => ({ width: 48, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.tint : c.surface, borderTopWidth: step === -1 ? 1 : 0, borderTopColor: c.border })}
                >
                  <AppText variant="title" style={{ fontSize: 24, lineHeight: 28 }}>{step === 1 ? "+" : "−"}</AppText>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => useMyLocation(false)}
              accessibilityRole="button"
              accessibilityLabel={t("useMyLocation")}
              style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: pressed ? c.tint : c.surface, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } })}
            >
              {locating ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="pin" color={c.primary} size={22} />}
            </Pressable>
          </View>

          {/* What's under the pin + confirm */}
          <View style={{ minHeight: SHEET_BASE + insets.bottom, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 + insets.bottom, gap: 12, backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 16, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: -3 } }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: notServed ? c.warningBg : c.tint, alignItems: "center", justifyContent: "center" }}>
                {busy ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="pin" color={notServed ? c.warning : c.primary} size={20} />}
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="title" style={{ fontSize: 18 }}>
                  {place ? shown.title || t("pinLocation") : t("locating")}
                </AppText>
                {shown.subtitle ? <AppText variant="caption" muted>{shown.subtitle}</AppText> : null}
              </View>
            </View>

            {notServed ? (
              <View style={{ borderRadius: 16, backgroundColor: c.warningBg, padding: 12, gap: 8 }}>
                <AppText variant="bodyBold" color={c.warningText}>{t("notServedTitle", { place: shown.title || t("thisPlace") })}</AppText>
                {areas.length > 0 && (
                  <>
                    <AppText variant="caption" color={c.warningText} style={{ opacity: 0.85 }}>{t("notServedPick")}</AppText>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {areas.slice(0, 8).map((z) => (
                        <Pressable
                          key={z.pincode}
                          onPress={() => {
                            setAccuracy(null);
                            goTo({ lat: z.lat!, lng: z.lng! });
                          }}
                          accessibilityRole="button"
                          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: pressed ? c.tint : c.surface, borderWidth: 1, borderColor: c.border })}
                        >
                          <Icon name="pin" color={c.success} size={14} />
                          <AppText variant="bodyBold" style={{ fontSize: 13 }}>{z.area ?? z.pincode}</AppText>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {zone && status.color === c.successText ? <Icon name="check" color={c.success} size={16} strokeWidth={2.6} /> : null}
                <AppText variant="caption" color={status.color} style={{ flex: 1 }}>{status.text}</AppText>
              </View>
            )}
            <Button label={t("confirmLocation")} onPress={confirm} disabled={busy || !zone} loading={update.isPending} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
