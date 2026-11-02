import { useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useOrder } from "@/hooks/useOrders";
import { pickPhotoBase64, useCreateTicket } from "@/hooks/useSupport";
import { useLang, useT, type TKey } from "@/i18n";
import { radius, useTheme } from "@/theme";

const TYPES = ["missing_item", "quality", "late", "rider_behaviour", "charged_wrong", "other"] as const;

/** "Get help": pick the problem, the item if it's about one, say what happened, add a photo. */
export default function NewTicketScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const t = useT();
  const { lang } = useLang();
  const { c } = useTheme();
  const router = useRouter();
  const order = useOrder(orderId);
  const create = useCreateTicket();
  const [type, setType] = useState<(typeof TYPES)[number] | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemPick = (type === "missing_item" || type === "quality") && !!order.data;
  const canSend = !!type && body.trim().length >= 5 && !create.isPending;

  async function submit() {
    setError(null);
    try {
      const r = await create.mutateAsync({
        orderId: orderId || undefined,
        orderItemId: itemId ?? undefined,
        type: type!,
        body: body.trim(),
        photoBase64: photo ?? undefined,
      });
      Alert.alert(r.autoCredited ? "✓" : "✓", r.autoCredited ? t("autoCredited", { amt: r.amount! }) : t("ticketSent"), [
        { text: "OK", onPress: () => router.replace(`/support/${r.id}`) },
      ]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const chip = (on: boolean) => ({
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: on ? c.primary : c.border,
    backgroundColor: on ? c.tint : c.surface,
  });

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" color={c.ink} size={20} />
        </Pressable>
        <AppText variant="title" style={{ flex: 1 }}>{t("getHelp")}</AppText>
        {order.data && <AppText variant="caption" muted>{order.data.display_id}</AppText>}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <AppText variant="subtitle">{t("whatWentWrong")}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TYPES.map((ty) => (
              <Pressable key={ty} onPress={() => setType(ty)} style={chip(type === ty)}>
                <AppText variant="caption" style={{ fontWeight: "700", color: type === ty ? c.primary : c.ink }}>{t(`tk_${ty}` as TKey)}</AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {itemPick && (
          <View style={{ gap: 8 }}>
            <AppText variant="subtitle">{t("whichItem")}</AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable onPress={() => setItemId(null)} style={chip(itemId === null)}>
                <AppText variant="caption" style={{ fontWeight: "700", color: itemId === null ? c.primary : c.ink }}>{t("wholeOrder")}</AppText>
              </Pressable>
              {order.data!.order_items.map((i) => (
                <Pressable key={i.id} onPress={() => setItemId(i.id)} style={chip(itemId === i.id)}>
                  <AppText variant="caption" style={{ fontWeight: "700", color: itemId === i.id ? c.primary : c.ink }}>
                    {(lang === "ta" && i.products?.name_ta) || i.products?.name || "Item"}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <AppText variant="subtitle">{t("describeIssue")}</AppText>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder={t("describeHint")}
            placeholderTextColor={c.muted}
            style={{ minHeight: 90, textAlignVertical: "top", backgroundColor: c.surface, borderRadius: radius.input, borderWidth: 1, borderColor: c.border, padding: 12, color: c.ink, fontSize: 15 }}
          />
        </View>

        <Pressable
          onPress={async () => {
            const b = await pickPhotoBase64();
            if (b) setPhoto(b);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: photo ? c.tint : c.surface, borderRadius: radius.input, borderWidth: 1, borderStyle: photo ? "solid" : "dashed", borderColor: photo ? c.primary : c.border, padding: 12 }}
        >
          <Icon name={photo ? "check" : "edit"} color={photo ? c.primary : c.muted} size={18} />
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle" color={photo ? c.primary : undefined}>{photo ? t("photoAdded") : t("addPhoto")}</AppText>
            {!photo && <AppText variant="caption" muted>{t("photoHelps")}</AppText>}
          </View>
        </Pressable>

        {error && <AppText variant="caption" color={c.danger}>{error}</AppText>}
        <Button label={t("sendRequest")} loading={create.isPending} disabled={!canSend} onPress={submit} />
      </ScrollView>
    </SafeAreaView>
  );
}
