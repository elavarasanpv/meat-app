import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { OfferTicket } from "@/components/OfferTicket";
import { useOfferActions, useShopOffers, type OfferState, type ShopOffer } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { Btn, Txt, useC } from "@/ui";

const day = (iso: string, lang: "en" | "ta") => new Date(iso).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function StatePill({ state }: { state: OfferState }) {
  const c = useC();
  const t = useT();
  const look: Record<OfferState, { bg: string; fg: string }> = {
    live: { bg: c.successBg, fg: c.success },
    waiting: { bg: c.warningBg, fg: c.warning },
    scheduled: { bg: c.infoBg, fg: c.info },
    rejected: { bg: c.tint, fg: c.danger },
    off: { bg: c.surface2, fg: c.ink },
    ended: { bg: c.surface2, fg: c.muted },
  };
  const m = look[state];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 13, backgroundColor: m.bg, alignSelf: "flex-start" }}>
      <Txt bold size={12} color={m.fg}>{t(`os_${state}` as TKey)}</Txt>
    </View>
  );
}

function OfferCard({ o }: { o: ShopOffer }) {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const router = useRouter();
  const act = useOfferActions();
  const [busy, setBusy] = useState(false);
  const over = o.state === "ended";
  // Thanjoz Mart's own offer in this shop: the shop is paid as usual and cannot change it.
  const theirs = o.paidBy === "app";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await act.done();
    } catch (e) {
      Alert.alert(t("error"), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  const end = () =>
    Alert.alert(t("offerEnd"), t("offerEndAsk"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("offerEndYes"), style: "destructive", onPress: () => run(() => act.end(o.id)) },
    ]);

  const s = o.stats;
  const stats = [
    s.orders ? `${s.orders} ${t("offerStatOrders")}` : null,
    s.freeUnits ? `${s.freeUnits} ${t("offerStatFree")}` : null,
    s.couponsGiven ? `${s.couponsGiven} ${t("offerStatCoupons")}, ${s.couponsUsed} ${t("offerStatUsed")}` : null,
  ].filter(Boolean);

  return (
    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 12, gap: 10, opacity: over ? 0.7 : 1 }}>
      <OfferTicket o={o} sub={`${day(o.startsAt, lang)} ${t("offerTill")} ${day(o.endsAt, lang)}`} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StatePill state={o.state} />
        {theirs ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 13, backgroundColor: c.infoBg }}>
            <Txt bold size={12} color={c.info}>{t("offerAppPays")}</Txt>
          </View>
        ) : null}
        {o.priceNow ? <Txt size={13} muted style={{ flex: 1 }}>{t("offerCustomerPays")} ₹{o.priceNow.offer} · {t("offerYouGet")} ₹{o.priceNow.shopGets}</Txt> : null}
      </View>
      {theirs ? <Txt size={13} muted>{t("offerAppPaysNote")}</Txt> : null}
      {o.state === "waiting" ? <Txt size={13} muted>{t("offerWaitNote")}</Txt> : null}
      {o.state === "rejected" && o.rejectReason ? <Txt size={13} color={c.danger}>{t("offerReason")}: {o.rejectReason}</Txt> : null}
      {stats.length || s.given ? (
        <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
          {stats.length ? <Txt size={13} muted>{stats.join(" · ")}</Txt> : null}
          {s.given && !theirs ? <Txt bold size={14}>{t("offerStatGiven")}: ₹{s.given}</Txt> : null}
        </View>
      ) : null}
      {over || theirs ? null : (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
          {o.status === "approved" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Txt bold size={14} style={{ flex: 1 }}>{t("offerOnOff")}</Txt>
              <Switch value={o.isActive} disabled={busy} onValueChange={(v) => run(() => act.setActive(o.id, v))} trackColor={{ true: c.success, false: c.border }} thumbColor="#FFFFFF" />
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn label={t("offerChange")} kind="soft" onPress={() => router.push(`/offers/${o.id}` as Href)} disabled={busy} style={{ flex: 1 }} />
            <Btn label={t("offerEnd")} kind="outlineDanger" onPress={end} disabled={busy} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </View>
  );
}

/** The grocery shop's own offers: what is live, what waits for approval, and what each has cost. */
export default function OffersScreen() {
  const c = useC();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offers = useShopOffers();
  const list = offers.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <SafeAreaView edges={["top"]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="chevronLeft" color={c.ink} size={26} />
          </Pressable>
          <Txt bold size={22} style={{ flex: 1 }}>{t("offers")}</Txt>
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={offers.isRefetching} onRefresh={() => offers.refetch()} tintColor={c.primary} />}>
        <Txt size={14} muted>{t("offersIntro")}</Txt>
        {offers.isLoading ? null : offers.isError ? (
          <Txt muted style={{ textAlign: "center", marginTop: 32 }}>{t("error")}</Txt>
        ) : list.length === 0 ? (
          <View style={{ alignItems: "center", gap: 8, padding: 24, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <Txt size={34}>🎁</Txt>
            <Txt bold size={17} style={{ textAlign: "center" }}>{t("offerNone")}</Txt>
            <Txt size={14} muted style={{ textAlign: "center" }}>{t("offerNoneBody")}</Txt>
          </View>
        ) : (
          list.map((o) => <OfferCard key={o.id} o={o} />)
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.ground, borderTopWidth: 1, borderTopColor: c.border }}>
        <Btn label={t("offerNew")} big onPress={() => router.push("/offers/new" as Href)} />
      </View>
    </View>
  );
}
