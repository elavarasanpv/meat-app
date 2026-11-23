import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { RURAL_MAP_STYLE } from "@/lib/mapStyle";
import { usePinDraft, type LatLng } from "@/lib/pin";
import { useAddAddress, useAddresses, useServiceablePincodes, useUpdateAddress } from "@/hooks/useOrders";
import { useProfile } from "@/hooks/useProfile";
import { useT, type TKey } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

const LABELS: { key: TKey; value: string; icon: IconName }[] = [
  { key: "labelHome", value: "Home", icon: "home" },
  { key: "labelWork", value: "Work", icon: "shop" },
  { key: "labelOther", value: "Other", icon: "pin" },
];

/** A text box whose name sits inside it and moves up once you type, so it is never lost. */
function Field({ label, value, prefix, ...rest }: TextInputProps & { label: string; value: string; prefix?: string }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const up = focused || !!value;
  return (
    <View style={{ minHeight: 60, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.input, borderWidth: 1.5, borderColor: focused ? c.primary : c.border, backgroundColor: c.surface, justifyContent: "center" }}>
      {up ? <AppText variant="caption" muted>{label}</AppText> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {prefix && up ? <AppText variant="bodyBold" style={{ fontSize: 15 }}>{prefix}</AppText> : null}
        <TextInput
          value={value}
          placeholder={up ? "" : label}
          placeholderTextColor={c.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={{ flex: 1, padding: 0, fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink }}
          {...rest}
        />
      </View>
    </View>
  );
}

/**
 * "Add address details" (second step after the map): the confirmed spot on a
 * small map with Change, then house number, street, landmark, a label and who
 * will receive the delivery (the customer, or a family member with their own number).
 * The pincode comes from the pin, so nobody types it.
 */
export default function NewAddressScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useAddresses().data?.find((a) => a.id === id);
  const add = useAddAddress();
  const update = useUpdateAddress();
  const served = useServiceablePincodes();
  // Saved addresses are one line ("12, Main road, Chettikulam"): the part before the first comma is the house.
  const comma = existing?.address_text.indexOf(",") ?? -1;
  const [label, setLabel] = useState(existing?.label ?? "Home");
  const [house, setHouse] = useState(existing ? (comma > 0 ? existing.address_text.slice(0, comma).trim() : existing.address_text) : "");
  const [street, setStreet] = useState(existing && comma > 0 ? existing.address_text.slice(comma + 1).trim() : "");
  const [landmark, setLandmark] = useState(existing?.landmark ?? "");
  const [pincode, setPincode] = useState(existing?.pincode ?? "");
  const [pin, setPin] = useState<LatLng | null>(existing?.lat != null && existing?.lng != null ? { lat: existing.lat, lng: existing.lng } : null);
  const draft = usePinDraft((s) => s.draft);
  const clearDraft = usePinDraft((s) => s.clear);
  const editing = !!existing;
  const me = useProfile().data;
  const myPhone = me?.phone ? me.phone.replace(/^91/, "") : "";
  // Ordering for a parent or relative: the rider calls their number first.
  const [other, setOther] = useState(!!existing?.receiver_phone);
  const [rName, setRName] = useState(existing?.receiver_name ?? "");
  const [rPhone, setRPhone] = useState(existing?.receiver_phone?.replace(/^91/, "") ?? "");
  const [error, setError] = useState<string | null>(null);

  // Opened before the saved addresses had loaded (a link, a cold start): fill the form once they arrive.
  const [filled, setFilled] = useState(!!existing);
  useEffect(() => {
    if (!existing || filled) return;
    setFilled(true);
    const i = existing.address_text.indexOf(",");
    setLabel(existing.label);
    setHouse(i > 0 ? existing.address_text.slice(0, i).trim() : existing.address_text);
    setStreet(i > 0 ? existing.address_text.slice(i + 1).trim() : "");
    setLandmark(existing.landmark ?? "");
    setPincode(existing.pincode);
    if (existing.lat != null && existing.lng != null) setPin({ lat: existing.lat, lng: existing.lng });
    setOther(!!existing.receiver_phone);
    setRName(existing.receiver_name ?? "");
    setRPhone(existing.receiver_phone?.replace(/^91/, "") ?? "");
  }, [existing]);

  // A spot confirmed on the full-screen picker: take its pin and pincode, and fill the
  // street from it without overwriting anything the user already typed.
  useEffect(() => {
    if (!draft) return;
    setPin({ lat: draft.lat, lng: draft.lng });
    if (draft.pincode) setPincode(draft.pincode);
    setStreet((cur) => (cur.trim() ? cur : draft.title));
    setError(null);
  }, [draft]);
  useEffect(() => () => clearDraft(), []);

  const openPicker = () => router.push({ pathname: "/address/location", params: { from: "form" } });

  const zone = served.data?.find((z) => z.pincode === pincode);
  const placeTitle = draft?.title || zone?.area || t(pin ? "locationSet" : "locationMissing");
  const placeSub = pin ? draft?.subtitle || pincode : t("pinRequired");

  async function save() {
    if (!pin || !/^[1-9]\d{5}$/.test(pincode)) return setError(t("pinRequired"));
    if (!house.trim()) return setError(t("houseRequired"));
    if (street.trim().length < 3) return setError(t("streetRequired"));
    if (other && !rName.trim()) return setError(t("receiverNameRequired"));
    if (other && !/^[6-9]\d{9}$/.test(rPhone)) return setError(t("receiverPhoneRequired"));
    // Their own number typed as the receiver is just "myself".
    const someoneElse = other && rPhone !== myPhone;
    setError(null);
    try {
      const input = { label, address_text: `${house.trim()}, ${street.trim()}`, landmark: landmark.trim() || undefined, pincode, lat: pin.lat, lng: pin.lng, receiver_name: someoneElse ? rName.trim() : null, receiver_phone: someoneElse ? `91${rPhone}` : null };
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
          <AppText variant="title" style={{ flex: 1 }}>{t(editing ? "editAddress" : "addressDetails")}</AppText>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          {pin ? (
            // Lite mode = a static map image: cheap, and it never steals the scroll.
            <View pointerEvents="none" style={{ height: 150, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.border }}>
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

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Icon name="pin" color={c.primary} size={24} />
            <View style={{ flex: 1 }}>
              <AppText variant="title" style={{ fontSize: 18 }}>{placeTitle}</AppText>
              {placeSub ? <AppText variant="caption" muted>{placeSub}</AppText> : null}
            </View>
            <Button label={t(pin ? "changeLocation" : "setLocation")} variant="outline" size="sm" onPress={openPicker} />
          </View>

          <View style={{ borderTopWidth: 1.5, borderStyle: "dashed", borderColor: c.border }} />

          <AppText variant="subtitle">{t("addrSection")}</AppText>
          <View style={{ gap: 12 }}>
            <Field label={t("houseNo")} value={house} onChangeText={setHouse} maxLength={60} />
            <Field label={t("streetArea")} value={street} onChangeText={setStreet} maxLength={200} />
            <Field label={t("landmark")} value={landmark} onChangeText={setLandmark} maxLength={120} />
          </View>

          <AppText variant="subtitle">{t("saveAs")}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {LABELS.map((l) => {
              const selected = label === l.value;
              return (
                <Pressable
                  key={l.value}
                  onPress={() => setLabel(l.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, paddingHorizontal: 18, borderRadius: radius.input, borderWidth: 1.5, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.tint : c.surface }}
                >
                  <Icon name={l.icon} color={selected ? c.price : c.muted} size={18} />
                  <AppText variant="bodyBold" color={selected ? c.price : c.ink} style={{ fontSize: 14 }}>{t(l.key)}</AppText>
                </Pressable>
              );
            })}
          </View>

          <AppText variant="subtitle">{t("whoReceives")}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {([false, true] as const).map((v) => {
              const selected = other === v;
              return (
                <Pressable
                  key={String(v)}
                  onPress={() => setOther(v)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, paddingHorizontal: 16, borderRadius: radius.input, borderWidth: 1.5, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.tint : c.surface }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? c.primary : c.border, alignItems: "center", justifyContent: "center" }}>
                    {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary }} /> : null}
                  </View>
                  <AppText variant="bodyBold" color={selected ? c.price : c.ink} style={{ fontSize: 14 }}>{t(v ? "someoneElse" : "myself")}</AppText>
                </Pressable>
              );
            })}
          </View>
          {other ? (
            <View style={{ gap: 12 }}>
              <Field label={t("receiverName")} value={rName} onChangeText={setRName} maxLength={60} autoCapitalize="words" />
              <Field label={t("receiverPhone")} value={rPhone} onChangeText={(v) => setRPhone(v.replace(/\D/g, "").slice(0, 10))} keyboardType="number-pad" maxLength={10} prefix="+91" />
              <AppText variant="caption" muted>{t("receiverHint")}</AppText>
            </View>
          ) : (
            <AppText variant="caption" muted>{[me?.full_name, myPhone ? `+91 ${myPhone}` : null].filter(Boolean).join(" · ") || t("myselfHint")}{me?.full_name || myPhone ? `\n${t("myselfHint")}` : ""}</AppText>
          )}

          {error ? <AppText variant="caption" color={c.danger}>{error}</AppText> : null}
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + insets.bottom, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          <Button label={t("saveAddress")} onPress={save} loading={add.isPending || update.isPending} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
