import { Linking, Pressable, ScrollView, View } from "react-native";
import { Header } from "@/components/Header";
import { Icon, type IconName } from "@/components/Icon";
import { useRiderMe } from "@/hooks/useRider";
import { useAuth } from "@/store/auth";
import { useLang, useT } from "@/i18n";
import { Txt, useC } from "@/ui";

const SUPPORT_PHONE = "+919999999999";

/** Rider details, language and sign-out. */
export default function RiderProfile() {
  const c = useC();
  const t = useT();
  const me = useRiderMe();
  const lang = useLang((s) => s.lang);
  const toggle = useLang((s) => s.toggle);
  const signOut = useAuth((s) => s.signOut);

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
      <Header title={t("tabProfile")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ padding: 18, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
            <Icon name="rider" color="#FFFFFF" size={38} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt bold size={18} numberOfLines={1}>{me.data?.name ?? t("riderApp")}</Txt>
            <Txt size={13} muted>{t("yourVehicle")}: {me.data?.vehicle ?? "—"}</Txt>
            {me.data?.phone ? <Txt size={13} muted>{me.data.phone}</Txt> : null}
          </View>
        </View>

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
