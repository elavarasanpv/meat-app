import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { LocationPicker, type LatLng } from "@/components/LocationPicker";
import { useAddresses, useUpdateAddressLocation } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/** Set (or move) the map pin for an existing address. */
export default function AddressLocationScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const addresses = useAddresses();
  const address = addresses.data?.find((a) => a.id === id);
  const update = useUpdateAddressLocation();
  const [pin, setPin] = useState<LatLng | null>(address?.lat != null && address?.lng != null ? { lat: address.lat, lng: address.lng } : null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!pin || !id) return;
    try {
      await update.mutateAsync({ id, lat: pin.lat, lng: pin.lng });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
        <View style={{ flex: 1 }}>
          <AppText variant="title" numberOfLines={1}>{t("pinLocation")}</AppText>
          {address ? <AppText variant="caption" muted numberOfLines={1}>{address.label} · {address.address_text}</AppText> : null}
        </View>
      </View>

      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <LocationPicker value={pin} onChange={setPin} height={Math.round(height * 0.55)} />
        <AppText variant="caption" color={c.danger} numberOfLines={2} style={{ height: 18 }}>{error ?? ""}</AppText>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <Button label={t("saveLocation")} icon="pin" onPress={save} disabled={!pin} loading={update.isPending} />
      </View>
    </SafeAreaView>
  );
}
