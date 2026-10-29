import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Manrope_500Medium, Manrope_700Bold, useFonts } from "@expo-google-fonts/manrope";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useDealerMe } from "@/hooks/useDealer";
import { useLang, useT } from "@/i18n";
import { Login } from "@/screens/Login";
import { Btn, Txt, useC } from "@/ui";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_700Bold });
  if (!fontsLoaded) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Gate />
    </QueryClientProvider>
  );
}

/** Login → "not a shop" → the tabs. */
function Gate() {
  const c = useC();
  const { session, ready, init } = useAuth();
  const loadLang = useLang((s) => s.load);
  useEffect(() => {
    loadLang();
    return init();
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  if (!session) return <Login />;
  return <DealerGate />;
}

function DealerGate() {
  const c = useC();
  const t = useT();
  const me = useDealerMe();
  const signOut = useAuth((s) => s.signOut);

  if (me.isError && !me.data) {
    const notDealer = me.error instanceof ApiError && me.error.status === 403;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
        <Txt bold size={18} style={{ textAlign: "center" }}>{notDealer ? t("notDealer") : t("error")}</Txt>
        <Btn label={t("logout")} kind="outline" onPress={signOut} />
      </SafeAreaView>
    );
  }
  if (!me.data) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }} />;
}
