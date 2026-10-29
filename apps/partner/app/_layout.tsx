import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Manrope_500Medium, Manrope_700Bold, useFonts } from "@expo-google-fonts/manrope";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_700Bold });
  if (!fontsLoaded) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
