import { Linking, Pressable, ScrollView, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Header } from "@/components/Header";
import { Icon, type IconName } from "@/components/Icon";
import { useDealerMe } from "@/hooks/useDealer";
import { useAuth } from "@/store/auth";
import { useLang, useT } from "@/i18n";
import { Txt, useC } from "@/ui";

const SUPPORT_PHONE = "+919999999999";

/** Shop details, language and sign-out. */
export default function AccountScreen() {
  const c = useC();
  const t = useT();
  const me = useDealerMe();
  const lang = useLang((s) => s.lang);
  const toggle = useLang((s) => s.toggle);
  const signOut = useAuth((s) => s.signOut);
  const charge = me.data?.app_charge;
  const router = useRouter();

  const Row = ({ icon, label, value, onPress, danger }: { icon: IconName; label: string; value?: string; onPress: () => void; danger?: boolean }) => (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: pressed ? c.surface2 : c.surface })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: danger ? c.tint : c.surface2, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={danger ? c.danger : c.ink} size={20} />
      </View>
      <Txt bold size={15} color={danger ? c.danger : c.ink} style={{ flex: 1 }}>{label}</Txt>
      {value ? <Txt size={14} muted>{value}</Txt> : null}
      <Icon name="chevronRight" color={c.muted} size={18} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <Header title={t("tabAccount")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ padding: 18, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shop" color="#FFFFFF" size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt bold size={18} numberOfLines={1}>{me.data?.shop_name ?? "—"}</Txt>
            <Txt size={13} muted>{me.data?.is_open ? t("shopOpen") : t("shopClosed")}</Txt>
          </View>
        </View>

        {charge ? (
          <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 6 }}>
            <Txt size={13} muted>{t("appCharge")}</Txt>
            <Txt bold size={18}>{charge.mode === "percent" ? `${charge.basis} ${t("appChargePercent")}` : lang === "ta" ? `${t("appChargeFlat")} ${charge.basis}` : `${charge.basis} ${t("appChargeFlat")}`}</Txt>
            <Txt size={13} muted>{t("appChargeNote")}</Txt>
          </View>
        ) : null}

        {me.data?.store_type === "grocery" ? (
          <Pressable onPress={() => router.push("/offers" as Href)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 22, backgroundColor: pressed ? c.tint : c.tintSoft, borderWidth: 1, borderColor: c.primary })}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
              <Txt bold size={20} color="#FFFFFF">%</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt bold size={16}>{t("offers")}</Txt>
              <Txt size={13} muted>{t("offersSub")}</Txt>
            </View>
            <Icon name="chevronRight" color={c.primary} size={20} />
          </Pressable>
        ) : null}

        <View style={{ borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
          <Row icon="bell" label={t("language")} value={lang === "ta" ? "தமிழ்" : "English"} onPress={toggle} />
          <View style={{ height: 1, backgroundColor: c.border }} />
          <Row icon="phone" label={t("support")} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} />
          <View style={{ height: 1, backgroundColor: c.border }} />
          <Row icon="logout" label={t("logout")} onPress={signOut} danger />
        </View>
      </ScrollView>
    </View>
  );
}
