import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Txt, useC } from "@/ui";

/** Screen title row with the safe-area top; `right` sits at the end. */
export function Header({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const c = useC();
  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: c.ground }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt bold size={24} numberOfLines={1}>{title}</Txt>
          {sub ? <Txt size={13} muted numberOfLines={1}>{sub}</Txt> : null}
        </View>
        {right}
      </View>
    </SafeAreaView>
  );
}
