import { View } from "react-native";
import { Header } from "@/components/Header";
import { useDealerMe } from "@/hooks/useDealer";
import { useT } from "@/i18n";
import { StockScreen } from "@/screens/Stock";

export default function StockTab() {
  const t = useT();
  const me = useDealerMe();
  return (
    <View style={{ flex: 1 }}>
      <Header title={t("tabStock")} sub={t("stockHint")} />
      {me.data ? <StockScreen dealerId={me.data.id} /> : null}
    </View>
  );
}
