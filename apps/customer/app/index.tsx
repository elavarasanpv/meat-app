import { Text, View, useColorScheme } from "react-native";
import { palette } from "@/theme";

export default function Home() {
  const scheme = useColorScheme() ?? "light";
  const c = palette[scheme];
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.ground,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: "800", color: c.primary }}>
        FreshCut
      </Text>
      <Text style={{ color: c.muted }}>Customer app · scaffold ready</Text>
    </View>
  );
}
