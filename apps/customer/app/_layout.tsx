import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 60_000 } },
});

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
    <QueryClientProvider client={queryClient}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="address/new" />
          <Stack.Screen name="order/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </QueryClientProvider>
  );
}
