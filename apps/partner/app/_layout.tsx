import { useEffect } from "react";
import { View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Manrope_500Medium, Manrope_700Bold, useFonts } from "@expo-google-fonts/manrope";
import { ApiError } from "@/lib/api";
import { bindOnlineManager, useIsOffline } from "@/lib/network";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/store/auth";
import { useDealerMe } from "@/hooks/useDealer";
import { useRiderMe } from "@/hooks/useRider";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useLang, useT } from "@/i18n";
import { Login } from "@/screens/Login";
import { Btn, Txt, useC } from "@/ui";

// Keep the last good data on screen through blips: a failed refetch keeps
// showing what we had (the error only drives the offline banner), and nothing
// is thrown away for an hour.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
      gcTime: 60 * 60_000,
      networkMode: "online",
      // A query that failed keeps trying every 10 s, so screens (and the
      // banner) recover on their own once the server answers again.
      refetchInterval: (q) => (q.state.status === "error" ? 10_000 : false),
    },
    mutations: { networkMode: "online" },
  },
});
bindOnlineManager(queryClient);

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

/** Login → role (shop or rider) → the matching tabs. */
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
  return <RoleGate userId={session.user.id} />;
}

/** One app, two jobs: the profile's role decides which tabs this phone gets. */
function RoleGate({ userId }: { userId: string }) {
  const c = useC();
  const role = useQuery({
    queryKey: ["role", userId],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      return (data?.role as string | undefined) ?? "customer";
    },
  });
  if (!role.data) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  return role.data === "rider" ? <RiderGate /> : <DealerGate />;
}

function RiderGate() {
  const c = useC();
  const t = useT();
  const me = useRiderMe();
  const signOut = useAuth((s) => s.signOut);
  const offline = useIsOffline();
  const router = useRouter();
  const pathname = usePathname();

  // The rider's home is /rider; the dealer tabs sit at "/" and must not show.
  useEffect(() => {
    if (me.data && !pathname.startsWith("/rider")) router.replace("/rider");
  }, [me.data, pathname]);

  if (me.isError && !me.data) {
    const notRider = me.error instanceof ApiError && me.error.status === 403;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
        {notRider ? (
          <Txt bold size={18} style={{ textAlign: "center" }}>{t("notPartner")}</Txt>
        ) : (
          <>
            <Txt bold size={20} style={{ textAlign: "center" }}>{t(offline ? "offlineTitle" : "serverTitle")}</Txt>
            <Txt muted style={{ textAlign: "center" }}>{t(offline ? "offlineStart" : "serverBody")}</Txt>
            <Btn label={t("retry")} big onPress={() => me.refetch()} loading={me.isFetching} style={{ alignSelf: "stretch" }} />
          </>
        )}
        <Btn label={t("logout")} kind="soft" onPress={signOut} />
      </SafeAreaView>
    );
  }
  if (!me.data) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }} />;
}

function DealerGate() {
  const c = useC();
  const t = useT();
  const me = useDealerMe();
  const signOut = useAuth((s) => s.signOut);
  const offline = useIsOffline();

  if (me.isError && !me.data) {
    const notDealer = me.error instanceof ApiError && me.error.status === 403;
    if (notDealer) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
          <Txt bold size={18} style={{ textAlign: "center" }}>{t("notPartner")}</Txt>
          <Btn label={t("logout")} kind="outline" onPress={signOut} />
        </SafeAreaView>
      );
    }
    // Can't load the shop yet: say why, offer Retry (it also retries by
    // itself every 10 s). Log out stays small so nobody taps it by mistake.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
        <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: offline ? c.tint : c.warningBg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={offline ? "x" : "clock"} color={offline ? c.danger : c.warning} size={34} strokeWidth={2.6} />
        </View>
        <Txt bold size={20} style={{ textAlign: "center" }}>{t(offline ? "offlineTitle" : "serverTitle")}</Txt>
        <Txt muted style={{ textAlign: "center" }}>{t(offline ? "offlineStart" : "serverBody")}</Txt>
        <Btn label={t("retry")} big onPress={() => me.refetch()} loading={me.isFetching} style={{ alignSelf: "stretch" }} />
        <Btn label={t("logout")} kind="soft" onPress={signOut} />
      </SafeAreaView>
    );
  }
  if (!me.data) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }} />;
}
