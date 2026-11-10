import { useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { pickPhotoBase64, useReplyTicket, useTicket } from "@/hooks/useSupport";
import { useT, type TKey } from "@/i18n";
import { radius, useTheme } from "@/theme";

/** One support request: the conversation with FreshCut, and a reply box. */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ticket = useTicket(id);
  const reply = useReplyTicket(id!);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const tk = ticket.data;
  const canReply = tk && tk.status !== "closed";

  async function send() {
    if (!body.trim() && !photo) return;
    await reply.mutateAsync({ body: body.trim() || "📷", photoBase64: photo ?? undefined });
    setBody("");
    setPhoto(null);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="back" color={c.ink} size={20} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title" numberOfLines={1}>{tk ? t(`tk_${tk.type}` as TKey) : "…"}</AppText>
          {tk?.order && <AppText variant="caption" muted>{tk.order.displayId}</AppText>}
        </View>
        {tk && <AppText variant="caption" style={{ fontWeight: "700", color: tk.status === "resolved" ? "#1E8A4F" : c.muted }}>{t(`ts_${tk.status}` as TKey)}</AppText>}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, paddingBottom: 16 + insets.bottom }}>
        {tk?.creditAmount != null && (
          <View style={{ backgroundColor: "#DDF3E6", borderRadius: radius.input, padding: 12 }}>
            <AppText variant="subtitle" color="#1E8A4F">{t("creditedLine", { amt: tk.creditAmount })}</AppText>
            <AppText variant="caption" muted>{t("walletNote")}</AppText>
          </View>
        )}
        {tk?.messages.map((m) => (
          <View key={m.id} style={{ alignItems: m.sender === "customer" ? "flex-end" : "flex-start" }}>
            <View
              style={{
                maxWidth: "85%",
                backgroundColor: m.sender === "customer" ? c.primary : c.surface,
                borderWidth: m.sender === "customer" ? 0 : 1,
                borderColor: c.border,
                borderRadius: 18,
                borderBottomRightRadius: m.sender === "customer" ? 6 : 18,
                borderBottomLeftRadius: m.sender === "customer" ? 18 : 6,
                padding: 11,
                gap: 6,
              }}
            >
              {m.body ? <AppText variant="body" color={m.sender === "customer" ? "#fff" : undefined}>{m.body}</AppText> : null}
              {m.photoUrl && <Image source={{ uri: m.photoUrl }} style={{ width: 180, height: 180, borderRadius: 12 }} resizeMode="cover" />}
              <AppText variant="caption" color={m.sender === "customer" ? "rgba(255,255,255,0.7)" : c.muted}>
                {new Date(m.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()}
              </AppText>
            </View>
          </View>
        ))}
      </ScrollView>

      {canReply && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
          <Pressable
            onPress={async () => {
              const b = await pickPhotoBase64();
              if (b) setPhoto(b);
            }}
            hitSlop={8}
            style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: photo ? c.tint : c.surface2, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={photo ? "check" : "camera"} color={photo ? c.primary : c.muted} size={18} />
          </Pressable>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t("replyPlaceholder")}
            placeholderTextColor={c.muted}
            style={{ flex: 1, backgroundColor: c.surface2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, color: c.ink, fontSize: 15 }}
          />
          <Button label={t("reply")} size="sm" loading={reply.isPending} disabled={!body.trim() && !photo} onPress={send} />
        </View>
      )}
    </SafeAreaView>
  );
}
