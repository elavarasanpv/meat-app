import { useEffect, useMemo, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { StarPicker } from "@/components/Stars";
import { ListSkeleton } from "@/components/States";
import { useOrder, useOrderRating, useRateOrder, useRiderContact } from "@/hooks/useOrders";
import { productImage } from "@/lib/images";
import { useLocalName, useT, type TKey } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

const SCOOTER = require("@freshcut/assets/images/rate-scooter.png");
const THANKS = require("@freshcut/assets/images/rate-thanks.png");
const LOGO = require("@freshcut/assets/images/icon-for-you.png");

/** Chips offered under the delivery stars: praise for 4–5, what went wrong for 1–3. */
const GOOD = ["fast", "polite", "packaging", "careful"] as const;
const BAD = ["late", "rude", "packaging_bad", "not_hygienic"] as const;

/**
 * Rate your order: the delivery (stars + chips), each item, the app, and a
 * free-text line. Stars start at 5 so a happy customer just taps Submit.
 */
export default function RateOrderScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const localName = useLocalName();
  const { id, stars: preset } = useLocalSearchParams<{ id: string; stars?: string }>();
  const order = useOrder(id);
  const o = order.data;
  const rider = useRiderContact(id, !!o?.rider_id);
  const existing = useOrderRating(id);
  const save = useRateOrder(id ?? "");

  const items = useMemo(() => (o?.order_items ?? []).filter((i) => i.products), [o]);
  const [itemStars, setItemStars] = useState<Record<string, number>>({});
  const [riderStars, setRiderStars] = useState(Number(preset) >= 1 && Number(preset) <= 5 ? Number(preset) : 5);
  const [tags, setTags] = useState<string[]>([]);
  const [appStars, setAppStars] = useState(5);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  // editing an earlier rating: start from what they said last time
  useEffect(() => {
    const r = existing.data;
    if (!r) return;
    setItemStars(Object.fromEntries(r.items.map((i) => [i.order_item_id, i.stars])));
    if (r.rider && !preset) setRiderStars(r.rider.stars);
    setTags(r.rider?.tags ?? []);
    if (r.app) setAppStars(r.app.stars);
    setNote(r.app?.note ?? r.rider?.note ?? "");
  }, [existing.data, preset]);

  // chips flip between praise and problems when the stars cross 3; drop ones that no longer fit
  const chips = riderStars >= 4 ? GOOD : BAD;
  useEffect(() => {
    setTags((cur) => cur.filter((x) => (chips as readonly string[]).includes(x)));
  }, [chips]);

  const hasRider = !!o?.rider_id;
  const amount = o ? Number(o.final_amount ?? o.est_amount) : 0;

  async function submit() {
    if (!o) return;
    try {
      await save.mutateAsync({
        rider: hasRider ? { stars: riderStars, note: null, tags } : null,
        app: { stars: appStars, note: note.trim() || null },
        items: items.map((i) => ({ orderItemId: i.id, stars: itemStars[i.id] ?? 5, note: null })),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone(true);
    } catch {
      /* save.isError shows the message */
    }
  }

  const card = { padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 12 } as const;
  const row = { flexDirection: "row", alignItems: "center", gap: 12 } as const;

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 }}>
          <Image source={THANKS} resizeMode="contain" style={{ width: 230, height: 230 }} />
          <AppText variant="display" style={{ textAlign: "center", fontSize: 28, lineHeight: 34, marginTop: 8 }}>{t("ratedThanks")}</AppText>
          <AppText muted style={{ textAlign: "center", maxWidth: 300 }}>{t("ratedThanksSub")}</AppText>
        </View>
        <View style={{ padding: 20 }}>
          <Button label={t("done")} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("close")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Icon name="close" color={c.ink} size={20} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1} style={{ fontSize: 18 }}>{t("rateOrderTitle")}</AppText>
            {o ? <AppText variant="caption" muted numberOfLines={1}>{t("rateOrderSub", { n: items.length, amt: amount })}</AppText> : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {!o ? <ListSkeleton rows={3} height={120} /> : null}

          {/* delivery */}
          {o && hasRider ? (
            <View style={card}>
              <AppText variant="subtitle" numberOfLines={1}>{t("rateDelivery")}</AppText>
              <View style={row}>
                <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <Image source={SCOOTER} resizeMode="contain" style={{ width: 54, height: 54 }} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <AppText variant="caption" muted numberOfLines={1}>{rider.data?.name ? t("deliveredBy", { name: rider.data.name }) : t("deliveredByRider")}</AppText>
                  <StarPicker value={riderStars} onChange={setRiderStars} size={32} />
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {chips.map((id) => {
                  const on = tags.includes(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => {
                        setTags((cur) => (on ? cur.filter((x) => x !== id) : [...cur, id]));
                        Haptics.selectionAsync().catch(() => {});
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.tint : c.surface }}
                    >
                      <AppText variant="label" color={on ? c.price : c.ink} numberOfLines={1}>{t(`tag_${id}` as TKey)}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* items */}
          {o ? (
            <View style={card}>
              <AppText variant="subtitle" numberOfLines={1}>{t("rateItems")}</AppText>
              {items.map((i) => {
                const p = i.products!;
                const img = productImage(p.name, null);
                const qty = Number(i.actual_kg ?? i.requested_kg);
                return (
                  <View key={i.id} style={row}>
                    <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: c.tintSoft, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {img ? <Image source={img} resizeMode="contain" style={{ width: 56, height: 56 }} /> : <AppText variant="title" color={c.price}>{p.name.charAt(0)}</AppText>}
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 }}>{localName(p)}</AppText>
                      <AppText variant="caption" muted numberOfLines={1}>
                        ₹{Math.round(Number(i.unit_price_per_kg) * qty)} · {qty} {p.unit === "piece" ? (qty === 1 ? "piece" : "pieces") : "kg"}
                      </AppText>
                      <StarPicker value={itemStars[i.id] ?? 5} onChange={(n) => setItemStars((m) => ({ ...m, [i.id]: n }))} size={28} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* the app */}
          {o ? (
            <View style={card}>
              <View style={row}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                  <Image source={LOGO} resizeMode="contain" style={{ width: 30, height: 30 }} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <AppText variant="subtitle" numberOfLines={1}>{t("rateAppCard")}</AppText>
                  <StarPicker value={appStars} onChange={setAppStars} size={28} />
                </View>
              </View>
              <TextInput
                value={note}
                onChangeText={(v) => setNote(v.slice(0, 300))}
                placeholder={t("rateDetails")}
                placeholderTextColor={c.muted}
                multiline
                style={{ minHeight: 64, padding: 12, borderRadius: radius.input, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.ground, fontFamily: fonts.bodySemi, fontSize: 14, color: c.ink, textAlignVertical: "top" }}
              />
            </View>
          ) : null}

          {save.isError ? <AppText variant="caption" color={c.danger} numberOfLines={2}>{(save.error as Error).message}</AppText> : null}
        </ScrollView>

        <View style={{ padding: 16, paddingTop: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
          <Button label={t("rateSubmit")} onPress={submit} loading={save.isPending} disabled={!o} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
