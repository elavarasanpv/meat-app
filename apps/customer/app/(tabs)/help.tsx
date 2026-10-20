import { View } from "react-native";
import { Button } from "@/components/Button";
import { ComingSoon } from "@/components/ComingSoon";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";

export default function HelpScreen() {
  const t = useT();
  const signOut = useAuth((s) => s.signOut);
  return (
    <ComingSoon title={t("tabHelp")} icon="phone">
      <View style={{ marginTop: 16, width: 200 }}>
        <Button label={t("signOut")} variant="outline" size="sm" onPress={signOut} />
      </View>
    </ComingSoon>
  );
}
