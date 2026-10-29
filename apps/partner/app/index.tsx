import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useDealerMe } from "@/hooks/useDealer";
import { useLang, useT } from "@/i18n";
import { Login } from "@/screens/Login";
import { OrdersScreen } from "@/screens/Orders";
import { StockScreen } from "@/screens/Stock";
import { Btn, Txt, useC } from "@/ui";

export default function Home() {
  const c = useC();
  const t = useT();
  const { session, ready, init, signOut } = useAuth();
  const toggle = useLang((s) => s.toggle);
  const lang = useLang((s) => s.lang);
  const loadLang = useLang((s) => s.load);
  const [tab, setTab] = useState<"orders" | "stock">("orders");

  useEffect(() => {
    loadLang();
    return init();
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  if (!session) return <Login />;
  return <Shop onLogout={signOut} tab={tab} setTab={setTab} toggleLang={toggle} lang={lang} />;
}

function Shop({ onLogout, tab, setTab, toggleLang, lang }: { onLogout: () => void; tab: "orders" | "stock"; setTab: (t: "orders" | "stock") => void; toggleLang: () => void; lang: string }) {
  const c = useC();
  const t = useT();
  const me = useDealerMe();

  if (me.isError) {
    const notDealer = me.error instanceof ApiError && me.error.status === 403;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
        <Txt bold size={18} style={{ textAlign: "center" }}>{notDealer ? t("notDealer") : t("error")}</Txt>
        <Btn label={t("logout")} kind="outline" onPress={onLogout} />
      </SafeAreaView>
    );
  }
  if (!me.data) return <View style={{ flex: 1, backgroundColor: c.ground }} />;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
      {/* Header: app name, language, logout */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
          <Txt bold size={20} color="#FFFFFF">F</Txt>
        </View>
        <Txt bold size={18} style={{ flex: 1 }} numberOfLines={1}>{t("appName")}</Txt>
        <Pressable onPress={toggleLang} accessibilityRole="button" style={{ height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
          <Txt bold size={12}>{lang === "ta" ? "English" : "தமிழ்"}</Txt>
        </Pressable>
        <Pressable onPress={onLogout} accessibilityRole="button" style={{ height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}>
          <Txt bold size={12}>{t("logout")}</Txt>
        </Pressable>
      </View>

      {/* Orders / Stock tabs */}
      <View style={{ flexDirection: "row", margin: 16, marginBottom: 0, padding: 4, borderRadius: 22, backgroundColor: c.surface2, gap: 4 }}>
        {(["orders", "stock"] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" style={{ flex: 1, height: 40, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: tab === k ? c.surface : "transparent" }}>
            <Txt bold size={14} color={tab === k ? c.primary : c.muted}>{t(k === "orders" ? "tabOrders" : "tabStock")}</Txt>
          </Pressable>
        ))}
      </View>

      {tab === "orders" ? (
        <OrdersScreen dealerId={me.data.id} shopName={me.data.shop_name} isOpen={me.data.is_open} />
      ) : (
        <StockScreen dealerId={me.data.id} />
      )}
    </SafeAreaView>
  );
}
