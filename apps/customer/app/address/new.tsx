import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { LocationPicker, type LatLng } from "@/components/LocationPicker";
import { useAddAddress, useServiceablePincodes } from "@/hooks/useOrders";
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
  const add = useAddAddress();
  const served = useServiceablePincodes();
  const [label, setLabel] = useState("Home");
  const [text, setText] = useState("");
  const [landmark, setLandmark] = useState("");
  const [pincode, setPincode] = useState("");
  const [pin, setPin] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);

  const match = pincode.length === 6 ? served.data?.find((z) => z.pincode === pincode) : undefined;
  const notServed = pincode.length === 6 && !!served.data && !match;

  function onPincode(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setPincode(digits);
    setError(null);
    const z = digits.length === 6 ? served.data?.find((p) => p.pincode === digits) : undefined;
    if (z?.lat != null && z?.lng != null) setPin({ lat: z.lat, lng: z.lng }); // jump the map there
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
    setError(null);
    try {
      await add.mutateAsync({ label, address_text: text.trim(), landmark: landmark.trim() || undefined, pincode, lat: pin?.lat, lng: pin?.lng });
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
          <AppText variant="title" numberOfLines={1}>{t("newAddress")}</AppText>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8 }}>
            <AppText variant="label">{t("pinLocation")}</AppText>
            <LocationPicker value={pin} onChange={setPin} />
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
              placeholder="12, Main road, Kallakurichi"
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
              placeholder="606202"
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
          <Button label={t("saveAddress")} onPress={save} loading={add.isPending} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
