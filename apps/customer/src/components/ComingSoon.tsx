import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";
import { useT } from "@/i18n";
import { useTheme } from "@/theme";

/** Placeholder for tabs that land in later sprints. */
export function ComingSoon({ title, icon, children }: { title: string; icon: IconName; children?: ReactNode }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} color={c.primary} size={32} />
        </View>
        <AppText variant="title">{title}</AppText>
        <AppText muted>{t("comingSoon")}</AppText>
        {children}
      </View>
    </SafeAreaView>
  );
}
