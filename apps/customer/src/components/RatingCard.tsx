import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Star, StarPicker } from "./Stars";
import { useOrderRating, useRateOrder } from "@/hooks/useOrders";
import { useLocalName, useT } from "@/i18n";
import { fonts, radius, useTheme } from "@/theme";

type Item = { id: string; products: { name: string; name_ta: string | null } | null };

/**
 * "How was it?" card on a delivered order: stars for each item, the rider and
 * the app (all start at 5), with an optional line of feedback. Once saved it
 * folds into a short summary with an Edit link.
 */
export function RatingCard({ orderId, items, hasRider }: { orderId: string; items: Item[]; hasRider: boolean }) {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const existing = useOrderRating(orderId);
  const save = useRateOrder(orderId);
  const [editing, setEditing] = useState(false);
  const [itemStars, setItemStars] = useState<Record<string, number>>({});
  const [rider, setRider] = useState(5);
  const [app, setApp] = useState(5);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  if (existing.isPending) return null;
  const r = existing.data;

  if (r && !editing) {
    const stars = [...r.items.map((i) => i.stars), ...(r.rider ? [r.rider.stars] : []), ...(r.app ? [r.app.stars] : [])];
    const avg = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 5;
    return (
      <View style={{ padding: 14, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: "#FFF4DB", alignItems: "center", justifyContent: "center" }}>
          <Star size={22} filled />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>{t("ratedThanks")}</AppText>
          <View style={{ flexDirection: "row", gap: 2, marginTop: 2 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={14} filled={n <= Math.round(avg)} />
            ))}
          </View>
        </View>
        <Pressable
          onPress={() => {
            setItemStars(Object.fromEntries(r.items.map((i) => [i.order_item_id, i.stars])));
            setRider(r.rider?.stars ?? 5);
            setApp(r.app?.stars ?? 5);
            setNote(r.app?.note ?? r.rider?.note ?? "");
            setEditing(true);
          }}
          hitSlop={8}
          accessibilityRole="button"
        >
          <AppText variant="label" color={c.price}>{t("edit")}</AppText>
        </Pressable>
      </View>
    );
  }

  const row = { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 } as const;

  async function submit() {
    try {
      await save.mutateAsync({
        rider: hasRider ? { stars: rider, note: null } : null,
        app: { stars: app, note: note.trim() || null },
        items: items.map((i) => ({ orderItemId: i.id, stars: itemStars[i.id] ?? 5, note: null })),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(false);
    } catch {
      /* the button shows the error state via save.isError below */
    }
  }

  return (
    <View style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: "#FFF4DB", alignItems: "center", justifyContent: "center" }}>
          <Star size={22} filled />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>{t("rateTitle")}</AppText>
          <AppText variant="caption" muted numberOfLines={2}>{t("rateSub")}</AppText>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {items.map((i) => (
          <View key={i.id} style={row}>
            <AppText variant="bodyBold" numberOfLines={2} style={{ flex: 1, fontSize: 13 }}>{i.products ? localName(i.products) : t("item")}</AppText>
            <StarPicker value={itemStars[i.id] ?? 5} onChange={(n) => setItemStars((m) => ({ ...m, [i.id]: n }))} size={26} />
          </View>
        ))}
        {hasRider && (
          <View style={row}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="scooter" color={c.muted} size={16} />
              <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 13 }}>{t("rateRider")}</AppText>
            </View>
            <StarPicker value={rider} onChange={setRider} size={26} />
          </View>
        )}
        <View style={row}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="logo" color={c.muted} size={16} />
            <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 13 }}>{t("rateApp")}</AppText>
          </View>
          <StarPicker value={app} onChange={setApp} size={26} />
        </View>
      </View>

      {noteOpen || note ? (
        <TextInput
          value={note}
          onChangeText={(v) => setNote(v.slice(0, 300))}
          placeholder={t("ratePlaceholder")}
          placeholderTextColor={c.muted}
          multiline
          style={{ minHeight: 70, padding: 12, borderRadius: radius.input, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.ground, fontFamily: fonts.bodySemi, fontSize: 14, color: c.ink, textAlignVertical: "top" }}
        />
      ) : (
        <Pressable onPress={() => setNoteOpen(true)} hitSlop={6} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
          <AppText variant="label" color={c.price}>+ {t("rateAddNote")}</AppText>
        </Pressable>
      )}

      {save.isError && <AppText variant="caption" color={c.danger} numberOfLines={2}>{(save.error as Error).message}</AppText>}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {editing && <Button label={t("cancel")} variant="soft" size="sm" onPress={() => setEditing(false)} />}
        <Button label={t("rateSubmit")} size="sm" onPress={submit} loading={save.isPending} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
