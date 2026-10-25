import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OfflineBanner } from "@/components/OfflineBanner";
import { bindOnlineManager } from "@/lib/network";
import { useFonts } from "expo-font";
import { Outfit_700Bold, Outfit_800ExtraBold } from "@expo-google-fonts/outfit";
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { NotoSansTamil_600SemiBold, NotoSansTamil_700Bold } from "@expo-google-fonts/noto-sans-tamil";
import { useAuth } from "@/store/auth";
import { useLang } from "@/i18n";
import { useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Signed-in users land on the tabs; signed-out users are redirected to (auth)/login.
export const unstable_settings = { initialRouteName: "(tabs)" };

// Queries pause while offline and resume on reconnect; cached data survives restarts
// so the catalog and recent orders still show with no signal.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 60_000, gcTime: 24 * 60 * 60_000, refetchOnReconnect: true, networkMode: "offlineFirst" },
    mutations: { networkMode: "online" },
  },
});
bindOnlineManager(queryClient);
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "freshcut.query-cache" });

export default function RootLayout() {
  const { c, scheme } = useTheme();
  const [fontsLoaded] = useFonts({
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    NotoSansTamil_600SemiBold,
    NotoSansTamil_700Bold,
  });
  const session = useAuth((s) => s.session);
  const authReady = useAuth((s) => s.ready);

  useEffect(() => useAuth.getState().init(), []);
  useEffect(() => {
    useLang.getState().load();
  }, []);

  const ready = fontsLoaded && authReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60_000 }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="address/new" />
          <Stack.Screen name="address/location" />
          <Stack.Screen name="order/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </PersistQueryClientProvider>
  );
}
