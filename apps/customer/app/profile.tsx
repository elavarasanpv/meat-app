import { useEffect, useState } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { Icon, type IconName } from "@/components/Icon";
import { LangToggle } from "@/components/LangToggle";
import { useSelectedAddress } from "@/hooks/useOrders";
import { useProfile, useUpdateName } from "@/hooks/useProfile";
import { useWallet } from "@/hooks/useSupport";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

/** +919876543210 → +91 98765 43210 */
function prettyPhone(raw: string | null | undefined) {
  const d = (raw ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : "";
}

export default function ProfileScreen() {
  const t = useT();
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const profile = useProfile();
  const saveName = useUpdateName();
  const wallet = useWallet();
  const address = useSelectedAddress();
  const [draft, setDraft] = useState<string | null>(null); // null = not editing

  // Android's back key hides the keyboard without blurring the input, so close on hide too.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => setDraft(null));
    return () => sub.remove();
  }, []);

  const name = profile.data?.full_name?.trim() ?? "";
  const phone = prettyPhone(profile.data?.phone ?? session?.user.phone);
  const openAddress = () => router.push(address ? { pathname: "/address/new", params: { id: address.id } } : "/address/location");
  const [asking, setAsking] = useState(false);
  const confirmSignOut = () => setAsking(true);

  const card = { backgroundColor: c.surface, borderRadius: radius.input, borderWidth: 1, borderColor: c.border } as const;
  const tiles: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: "orders", label: t("tabOrders"), onPress: () => router.navigate("/(tabs)/orders") },
    { icon: "chat", label: t("tabHelp"), onPress: () => router.navigate("/(tabs)/help") },
    { icon: "pin", label: t("profileAddresses"), onPress: openAddress },
  ];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View onTouchEnd={Keyboard.dismiss} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
          <Icon name="back" color={c.ink} size={20} />
        </Pressable>
        <AppText variant="title" style={{ flex: 1 }}>{t("profileTitle")}</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 16, paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
            {name ? <AppText variant="title" color={c.primary} style={{ fontSize: 26, lineHeight: 32 }}>{name.charAt(0).toUpperCase()}</AppText> : <Icon name="user" color={c.primary} size={30} />}
          </View>
          {draft === null ? (
            <Pressable onPress={() => setDraft(name)} accessibilityRole="button" style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppText variant="title" numberOfLines={1} color={name ? undefined : c.primary} style={{ flexShrink: 1 }}>{name || t("profileNameHint")}</AppText>
                <Icon name="edit" color={c.muted} size={15} />
              </View>
              {phone ? <AppText variant="caption" muted>{phone}</AppText> : null}
            </Pressable>
          ) : (
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                autoFocus
                maxLength={40}
                placeholder={t("profileNamePlaceholder")}
                placeholderTextColor={c.muted}
                returnKeyType="done"
                onSubmitEditing={() => saveName.mutate(draft, { onSuccess: () => setDraft(null) })}
                onBlur={() => setDraft(null)} // tapping anywhere else closes the editor
                style={{ flex: 1, height: 44, backgroundColor: c.surface, borderRadius: radius.input, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.ink, fontFamily: fonts.bodyBold, fontSize: 15 }}
              />
              <Button
                label={t("profileSave")}
                size="sm"
                loading={saveName.isPending}
                onPress={() => saveName.mutate(draft, { onSuccess: () => setDraft(null) })}
              />
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          {tiles.map((x) => (
            <Pressable
              key={x.label}
              onPress={x.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [card, { flex: 1, paddingVertical: 16, paddingHorizontal: 6, alignItems: "center", gap: 8, backgroundColor: pressed ? c.tintSoft : c.surface }]}
            >
              <Icon name={x.icon} color={c.ink} size={22} />
              <AppText variant="subtitle" numberOfLines={2} style={{ textAlign: "center", fontSize: 13, lineHeight: 18 }}>{x.label}</AppText>
            </Pressable>
          ))}
        </View>

        <View style={{ backgroundColor: c.tint, borderRadius: radius.input, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
            <Icon name="receipt" color={c.primary} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" muted>{t("walletBalance")}</AppText>
            <AppText variant="title" color={c.primary}>₹{wallet.data?.balance ?? 0}</AppText>
          </View>
          <AppText variant="caption" muted style={{ maxWidth: 120, textAlign: "right" }}>{t("walletNote")}</AppText>
        </View>

        <View style={{ gap: 8 }}>
          <AppText variant="subtitle">{t("profileInfo")}</AppText>
          <View style={card}>
            <Pressable onPress={openAddress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
              <Icon name="pin" color={c.ink} size={20} />
              <View style={{ flex: 1 }}>
                <AppText variant="subtitle">{t("deliverToLabel")}</AppText>
                <AppText variant="caption" muted numberOfLines={2}>{address ? `${address.label} · ${address.landmark || address.address_text}` : t("setAddress")}</AppText>
              </View>
              <Icon name="edit" color={c.muted} size={16} />
            </Pressable>
            <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
              <Icon name="chat" color={c.ink} size={20} />
              <AppText variant="subtitle" style={{ flex: 1 }}>{t("profileLanguage")}</AppText>
              <LangToggle />
            </View>
          </View>
        </View>

        <View style={{ alignItems: "center", gap: 10, marginTop: 8 }}>
          <Button label={t("signOut")} variant="outline" icon="logout" size="sm" onPress={confirmSignOut} style={{ width: 200 }} />
          <AppText variant="caption" muted>{t("profileVersion", { v: Constants.expoConfig?.version ?? "" })}</AppText>
        </View>
      </ScrollView>
      <ConfirmSheet visible={asking} title={t("signOut")} message={t("profileSignOutAsk")} confirmLabel={t("signOut")} cancelLabel={t("profileCancel")} icon="logout" onConfirm={() => { setAsking(false); void signOut(); }} onClose={() => setAsking(false)} />
    </SafeAreaView>
  );
}
