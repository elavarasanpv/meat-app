import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { RURAL_MAP_STYLE } from "@/lib/mapStyle";
import { usePinDraft, type LatLng } from "@/lib/pin";
import { useAddAddress, useAddresses, useServiceablePincodes, useUpdateAddress } from "@/hooks/useOrders";
import { useT, type TKey } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

const LABELS: { key: TKey; value: string }[] = [
  { key: "labelHome", value: "Home" },
  { key: "labelWork", value: "Work" },
  { key: "labelOther", value: "Other" },
];

export default function NewAddressScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useAddresses().data?.find((a) => a.id === id);
  const add = useAddAddress();
  const update = useUpdateAddress();
  const served = useServiceablePincodes();
  const [label, setLabel] = useState(existing?.label ?? "Home");
  const [text, setText] = useState(existing?.address_text ?? "");
  const [landmark, setLandmark] = useState(existing?.landmark ?? "");
  const [pincode, setPincode] = useState(existing?.pincode ?? "");
  const [pin, setPin] = useState<LatLng | null>(existing?.lat != null && existing?.lng != null ? { lat: existing.lat, lng: existing.lng } : null);
  const draft = usePinDraft((s) => s.draft);
  const clearDraft = usePinDraft((s) => s.clear);
  const editing = !!existing;
  const [error, setError] = useState<string | null>(null);

  // A spot confirmed on the full-screen picker: take its pin and fill in what it told us,
  // without overwriting anything the user already typed.
  useEffect(() => {
    if (!draft) return;
    setPin({ lat: draft.lat, lng: draft.lng });
    if (draft.pincode) setPincode(draft.pincode);
    setText((cur) => (cur.trim() ? cur : draft.title));
    setError(null);
  }, [draft]);
  useEffect(() => () => clearDraft(), []);

  const openPicker = () => router.push({ pathname: "/address/location", params: { from: "form" } });

  const match = pincode.length === 6 ? served.data?.find((z) => z.pincode === pincode) : undefined;
  const notServed = pincode.length === 6 && !!served.data && !match;

  function onPincode(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setPincode(digits);
    setError(null);
  }

  const field = {
    paddingHorizontal: 16,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    fontFamily: fonts.body,
    fontSize: 15,
    color: c.ink,
  } as const;

  async function save() {
    if (text.trim().length < 5) return setError(t("addrRequired"));
    if (!/^[1-9]\d{5}$/.test(pincode)) return setError(t("invalidPincode"));
    if (notServed) return setError(t("pincodeNotServed", { pin: pincode }));
    if (!pin) return setError(t("pinRequired"));
    setError(null);
    try {
      const input = { label, address_text: text.trim(), landmark: landmark.trim() || undefined, pincode, lat: pin?.lat, lng: pin?.lng };
      if (editing) await update.mutateAsync({ id: existing.id, ...input });
      else await add.mutateAsync(input);
      router.back();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="back" color={c.ink} />
          </Pressable>
          <AppText variant="title" numberOfLines={1}>{t(editing ? "editAddress" : "newAddress")}</AppText>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8 }}>
            <AppText variant="label">{t("deliveryLocation")}</AppText>
            <View style={{ borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
              {pin ? (
                // Lite mode = a static map image: cheap, and taps go to "Change" instead of panning.
                <View pointerEvents="none" style={{ height: 140 }}>
                  <MapView
                    provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                    style={{ flex: 1 }}
                    liteMode
                    customMapStyle={RURAL_MAP_STYLE}
                    region={{ latitude: pin.lat, longitude: pin.lng, latitudeDelta: 0.0035, longitudeDelta: 0.009 }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    toolbarEnabled={false}
                  >
                    <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} anchor={{ x: 0.5, y: 1 }} image={require("../../assets/markers/home.png")} />
                  </MapView>
                </View>
              ) : null}
              <Pressable onPress={openPicker} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: pressed ? c.tintSoft : c.surface })}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="pin" color={c.primary} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold" numberOfLines={1}>{pin ? draft?.title || t("locationSet") : t("locationMissing")}</AppText>
                  <AppText variant="caption" muted numberOfLines={1}>{pin ? draft?.subtitle || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : t("pinRequired")}</AppText>
                </View>
                <AppText variant="bodyBold" color={c.price} numberOfLines={1}>{pin ? t("changeLocation") : t("setLocation")}</AppText>
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <AppText variant="label">{t("saveAs")}</AppText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {LABELS.map((l) => {
                const selected = label === l.value;
                return (
                  <Pressable
                    key={l.value}
                    onPress={() => setLabel(l.value)}
                    accessibilityRole="button"
                    style={{ flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.tint : c.surface, alignItems: "center", justifyContent: "center" }}
                  >
                    <AppText variant="bodyBold" color={selected ? c.price : c.ink} numberOfLines={1} style={{ fontSize: 13 }}>{t(l.key)}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <AppText variant="label">{t("addrText")}</AppText>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="12, Main road, Chettikulam"
              placeholderTextColor={c.muted}
              maxLength={300}
              style={[field, { minHeight: 96, paddingTop: 12, textAlignVertical: "top" }]}
            />
          </View>

          <View style={{ gap: 8 }}>
            <AppText variant="label">{t("landmark")}</AppText>
            <TextInput value={landmark} onChangeText={setLandmark} placeholderTextColor={c.muted} maxLength={120} style={[field, { height: 50 }]} />
          </View>

          <View style={{ gap: 8 }}>
            <AppText variant="label">{t("pincode")}</AppText>
            <TextInput
              value={pincode}
              onChangeText={onPincode}
              keyboardType="number-pad"
              placeholder="627120"
              placeholderTextColor={c.muted}
              maxLength={6}
              style={[field, { height: 50, letterSpacing: 2, borderColor: notServed ? c.danger : match ? c.success : c.border }]}
            />
            <AppText variant="caption" color={notServed ? c.danger : c.successText} numberOfLines={1} style={{ height: 18 }}>
              {notServed ? t("pincodeNotServed", { pin: pincode }) : match ? t("pincodeServed", { area: match.area ?? match.pincode }) : ""}
            </AppText>
          </View>

          <AppText variant="caption" color={c.danger} numberOfLines={2} style={{ height: 36 }}>{error ?? ""}</AppText>
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          <Button label={t("saveAddress")} onPress={save} loading={add.isPending || update.isPending} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
