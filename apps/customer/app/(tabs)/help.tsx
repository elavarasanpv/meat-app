import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useMyTickets, useWallet, type Ticket } from "@/hooks/useSupport";
import { useAuth } from "@/store/auth";
import { useT, type TKey } from "@/i18n";
import { radius, useTheme } from "@/theme";

const SUPPORT_PHONE = "+919999999999";

const STATUS_COLOR: Record<Ticket["status"], string> = {
  open: "#B4620A",
  waiting_customer: "#2F6FD1",
  resolved: "#1E8A4F",
  closed: "#6E625B",
};

export default function HelpScreen() {
  const t = useT();
  const { c } = useTheme();
  const router = useRouter();
  const signOut = useAuth((s) => s.signOut);
  const tickets = useMyTickets();
  const wallet = useWallet();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 14 }}>
        <AppText variant="title">{t("tabHelp")}</AppText>

        {(wallet.data?.balance ?? 0) > 0 && (
          <View style={{ backgroundColor: c.tint, borderRadius: radius.input, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
              <Icon name="receipt" color={c.primary} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" muted>{t("walletBalance")}</AppText>
              <AppText variant="title" color={c.primary}>₹{wallet.data!.balance}</AppText>
            </View>
            <AppText variant="caption" muted style={{ maxWidth: 110, textAlign: "right" }}>{t("walletNote")}</AppText>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label={t("supportCall")} icon="phone" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} />
          <Button label={t("supportWhatsApp")} variant="outline" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_PHONE.replace("+", "")}`)} />
        </View>
        <AppText variant="caption" muted style={{ marginTop: -8, textAlign: "center" }}>{t("supportHours")}</AppText>

        <View style={{ gap: 8 }}>
          <AppText variant="subtitle">{t("myTickets")}</AppText>
          {tickets.data?.map((tk) => (
            <Pressable
              key={tk.id}
              onPress={() => router.push(`/support/${tk.id}`)}
              style={({ pressed }) => ({ backgroundColor: pressed ? c.tintSoft : c.surface, borderRadius: radius.input, borderWidth: 1, borderColor: c.border, padding: 12, gap: 3 })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_COLOR[tk.status] }} />
                <AppText variant="subtitle" style={{ flex: 1 }} numberOfLines={1}>{t(`tk_${tk.type}` as TKey)}</AppText>
                <AppText variant="caption" style={{ color: STATUS_COLOR[tk.status], fontWeight: "700" }}>{t(`ts_${tk.status}` as TKey)}</AppText>
              </View>
              {tk.body ? <AppText variant="caption" muted numberOfLines={1}>{tk.order ? `${tk.order} · ` : ""}{tk.body}</AppText> : null}
              {tk.creditAmount != null && <AppText variant="caption" color="#1E8A4F">{t("creditedLine", { amt: tk.creditAmount })}</AppText>}
            </Pressable>
          ))}
          {tickets.data && !tickets.data.length && (
            <View style={{ backgroundColor: c.surface, borderRadius: radius.input, borderWidth: 1, borderColor: c.border, padding: 14 }}>
              <AppText variant="caption" muted>{t("noTickets")}</AppText>
            </View>
          )}
        </View>

        <View style={{ gap: 8 }}>
          <AppText variant="subtitle">{t("faqTitle")}</AppText>
          {[1, 2, 3].map((n) => (
            <Pressable key={n} onPress={() => setOpenFaq(openFaq === n ? null : n)} style={{ backgroundColor: c.surface, borderRadius: radius.input, borderWidth: 1, borderColor: c.border, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppText variant="subtitle" style={{ flex: 1 }}>{t(`faq${n}q` as TKey)}</AppText>
                <Icon name={openFaq === n ? "chevronUp" : "chevronDown"} color={c.muted} size={16} />
              </View>
              {openFaq === n && <AppText variant="caption" muted>{t(`faq${n}a` as TKey)}</AppText>}
            </Pressable>
          ))}
        </View>

        <View style={{ alignItems: "center", marginTop: 8 }}>
          <Button label={t("signOut")} variant="outline" size="sm" onPress={signOut} style={{ width: 200 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
