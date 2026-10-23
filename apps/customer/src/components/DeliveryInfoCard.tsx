import { useState } from "react";
import { LayoutAnimation, Platform, Pressable, UIManager, View } from "react-native";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";
import type { OrderDetail } from "@/hooks/useOrders";
import { dateTime, dayLabel, slotWindow } from "@/lib/format";
import { useLocalName, useT } from "@/i18n";
import { useTheme } from "@/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = { order: OrderDetail; pickedUpAt?: string };

function Row({ icon, title, sub, right, last }: { icon: IconName; title: string; sub?: string; right?: React.ReactNode; last?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.tintSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={c.primary} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyBold" numberOfLines={1} style={{ fontSize: 14 }}>{title}</AppText>
        {sub ? <AppText variant="caption" muted numberOfLines={2}>{sub}</AppText> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Compact delivery summary for the on-the-way / arrived states:
 * slot, address, and an items line that expands into the full bill.
 */
export function DeliveryInfoCard({ order: o, pickedUpAt }: Props) {
  const { c } = useTheme();
  const t = useT();
  const localName = useLocalName();
  const [open, setOpen] = useState(false);
  const total = Number(o.final_amount ?? o.est_amount);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={{ marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
      {o.delivery_slots ? (
        <Row
          icon="clock"
          title={`${dayLabel(o.delivery_slots.starts_at, { today: t("today"), tomorrow: t("tomorrow") })} · ${slotWindow(o.delivery_slots.starts_at, o.delivery_slots.ends_at)}`}
          sub={pickedUpAt ? t("pickedUpAt", { when: dateTime(pickedUpAt) }) : undefined}
        />
      ) : null}
      {o.addresses ? (
        <Row icon="pin" title={o.addresses.label} sub={`${o.addresses.address_text}${o.addresses.landmark ? ` · ${o.addresses.landmark}` : ""}`} />
      ) : null}
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Row
          icon="receipt"
          title={t("itemsTotal", { n: o.order_items.length, total })}
          sub={t(o.payment_mode === "cod" ? "payCod" : o.payment_mode === "upi_on_delivery" ? "payUpi" : "paidOnline")}
          last
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText variant="label" color={c.price} numberOfLines={1}>{t(open ? "hideBill" : "viewBill")}</AppText>
              <Icon name={open ? "chevronUp" : "chevronDown"} color={c.price} size={16} strokeWidth={2.6} />
            </View>
          }
        />
      </Pressable>

      {open ? (
        <View style={{ paddingBottom: 12, paddingLeft: 48, gap: 6 }}>
          {o.order_items.map((it) => {
            const unit = it.products?.unit ?? "kg";
            const qty = Number(it.actual_kg ?? it.requested_kg);
            return (
              <View key={it.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                  {it.products ? localName(it.products) : "—"} · {unit === "kg" ? `${qty} kg` : `×${qty}`}
                </AppText>
                <AppText variant="caption" numberOfLines={1}>₹ {Math.round(Number(it.unit_price_per_kg) * qty)}</AppText>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
