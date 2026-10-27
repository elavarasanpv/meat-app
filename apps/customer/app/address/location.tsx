import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { MapTypeToggle } from "@/components/MapTypeToggle";
import { useAddresses, useServiceablePincodes, useUpdateAddressLocation } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { RURAL_MAP_STYLE, type MapKind } from "@/lib/mapStyle";
import { DEFAULT_CENTER, describePlace, findPlace, usePinDraft, type LatLng, type Place } from "@/lib/pin";
import { fonts, radius, useTheme } from "@/theme";

/** ~1.3 km across: close enough to see lanes, wide enough to recognise the village. */
const ZOOM: Pick<Region, "latitudeDelta" | "longitudeDelta"> = { latitudeDelta: 0.012, longitudeDelta: 0.012 };
/** Worse than this, we ask the user to drag the map to their gate. */
const WEAK_GPS_M = 60;

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

  const saved = address?.lat != null && address?.lng != null ? { lat: address.lat, lng: address.lng } : null;
  const start = saved ?? (from === "form" && draft ? { lat: draft.lat, lng: draft.lng } : null);

  const goTo = (p: LatLng) => mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, ...ZOOM }, 600);

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
        if (req === nameReq.current) setPlace({ title: "", subtitle: "", pincode: null });
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
    if (!center) return;
    if (id) {
      try {
        await update.mutateAsync({ id, lat: center.lat, lng: center.lng });
        router.back();
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    setDraft({ ...center, title: place?.title ?? "", subtitle: place?.subtitle ?? "", pincode: place?.pincode ?? null });
    if (from === "form") router.back();
    else router.replace("/address/new");
  }

  const zone = place?.pincode ? served.data?.find((z) => z.pincode === place.pincode) : undefined;
  const notServed = !!place?.pincode && !!served.data && !zone;
  const busy = moving || naming;
  const hint = error
    ? { text: error, color: c.danger }
    : accuracy != null && accuracy > WEAK_GPS_M
      ? { text: t("gpsWeak", { m: accuracy }), color: c.warningText }
      : accuracy != null
        ? { text: t("gpsAccuracy", { m: accuracy }), color: c.successText }
        : notServed
          ? { text: t("noDeliverHere"), color: c.danger }
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
        <MapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          style={{ flex: 1 }}
          mapType={kind}
          customMapStyle={kind === "standard" ? RURAL_MAP_STYLE : []}
          initialRegion={{ latitude: initial.lat, longitude: initial.lng, ...ZOOM }}
          onPanDrag={() => setAccuracy(null)}
          onRegionChange={() => setMoving(true)}
          onRegionChangeComplete={(r) => {
            setMoving(false);
            setCenter({ lat: r.latitude, lng: r.longitude });
          }}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        />

        {/* Fixed centre pin with the "delivered here" callout; the pin lifts while the map moves */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
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

        <Pressable
          onPress={() => useMyLocation(false)}
          accessibilityRole="button"
          accessibilityLabel={t("useMyLocation")}
          style={({ pressed }) => ({ position: "absolute", right: 16, bottom: 16, width: 52, height: 52, borderRadius: 26, backgroundColor: pressed ? c.tint : c.surface, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } })}
        >
          {locating ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="pin" color={c.primary} size={24} />}
        </Pressable>
      </View>

      {/* What's under the pin + confirm */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.tint, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
            {busy ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="pin" color={c.primary} size={20} />}
          </View>
          <View style={{ flex: 1, minHeight: 44 }}>
            <AppText variant="title" numberOfLines={1} style={{ fontSize: 18 }}>
              {busy && !place ? t("locating") : place?.title || t("pinLocation")}
            </AppText>
            <AppText variant="caption" muted numberOfLines={2}>{place?.subtitle ?? ""}</AppText>
          </View>
        </View>
        <AppText variant="caption" color={hint.color} numberOfLines={2} style={{ height: 34 }}>{hint.text}</AppText>
        <Button label={t("confirmLocation")} onPress={confirm} disabled={!center || moving} loading={update.isPending} />
      </View>
    </SafeAreaView>
  );
}
