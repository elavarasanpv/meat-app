import { useEffect, useState } from "react";
import { ScrollView, Switch, TextInput, View } from "react-native";
import { DEALER_REJECT_REASONS } from "@freshcut/shared";
import { useAccept, useDealerOrders, usePacked, useReject, useShopState, useStartCutting, useWeigh, type DealerOrder, type DealerOrderItem } from "@/hooks/useDealer";
import { useLang, useT, type TKey } from "@/i18n";
import { Btn, Chip, Txt, useC } from "@/ui";

const READY_CHOICES = [15, 30, 45, 60];

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Live countdown to the accept deadline ("4:32"). */
function Countdown({ deadline }: { deadline: string }) {
  const c = useC();
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  const left = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <View style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: left < 60 ? c.danger : c.warning, alignItems: "center", justifyContent: "center" }}>
      <Txt bold size={14} color="#FFFFFF">{t("acceptIn")} {mm}:{ss}</Txt>
    </View>
  );
}

function ItemRow({ it }: { it: DealerOrderItem }) {
  const c = useC();
  const t = useT();
  const lang = useLang((s) => s.lang);
  const name = lang === "ta" && it.products.name_ta ? it.products.name_ta : it.products.name;
  const qty = it.products.unit === "kg" ? `${it.requested_kg} ${t("kg")}` : `${Math.round(it.requested_kg)} ${t("pieces")}`;
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Txt bold size={15} style={{ flex: 1 }} numberOfLines={2}>{name}</Txt>
        <Txt bold size={15}>{qty}{it.size ? ` · ${it.size}` : ""}</Txt>
      </View>
      {it.notes ? <Txt size={13} muted numberOfLines={2}>{t("customerNote")}: {it.notes}</Txt> : null}
    </View>
  );
}

function OrderCard({ o }: { o: DealerOrder }) {
  const c = useC();
  const t = useT();
  const accept = useAccept();
  const reject = useReject();
  const cutting = useStartCutting();
  const weigh = useWeigh();
  const packed = usePacked();
  const [mode, setMode] = useState<"none" | "ready" | "reject">("none");
  const [weights, setWeights] = useState<Record<string, string>>({});

  const items = o.order_items.filter((i) => !i.unavailable);
  const shopTotal = items.reduce((s, i) => s + Math.round(i.shop_price_per_kg * i.requested_kg), 0);
  const title: TKey = o.status === "DEALER_ASSIGNED" ? "newOrder" : o.status === "PACKED" ? "ready" : "preparing";
  const border = o.status === "DEALER_ASSIGNED" ? c.primary : c.border;

  return (
    <View style={{ borderRadius: 22, borderWidth: o.status === "DEALER_ASSIGNED" ? 2 : 1, borderColor: border, backgroundColor: c.surface, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View>
          <Txt bold size={17}>{o.display_id}</Txt>
          <Txt size={13} muted>{t(title)}{o.delivery_slots ? ` · ${clock(o.delivery_slots.starts_at)}–${clock(o.delivery_slots.ends_at)}` : ""}</Txt>
        </View>
        {o.status === "DEALER_ASSIGNED" && o.accept_deadline ? <Countdown deadline={o.accept_deadline} /> : null}
      </View>

      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
        {items.map((it) => <ItemRow key={it.id} it={it} />)}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt size={13} muted>{items.length} {t("items")}</Txt>
          <Txt bold size={16} color={c.primary}>{t("yourAmount")} ₹{shopTotal}</Txt>
        </View>
      </View>

      {o.status === "DEALER_ASSIGNED" ? (
        mode === "ready" ? (
          <View style={{ gap: 10 }}>
            <Txt bold size={15}>{t("readyIn")}</Txt>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {READY_CHOICES.map((m) => (
                <Chip key={m} label={`${m} ${t("min")}`} onPress={() => accept.mutate({ orderId: o.id, readyMinutes: m })} />
              ))}
            </View>
          </View>
        ) : mode === "reject" ? (
          <View style={{ gap: 10 }}>
            <Txt bold size={15}>{t("rejectWhy")}</Txt>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {DEALER_REJECT_REASONS.map((r) => (
                <Chip key={r} label={t(`r_${r}` as TKey)} onPress={() => reject.mutate({ orderId: o.id, reason: r })} />
              ))}
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn label={t("reject")} kind="soft" onPress={() => setMode("reject")} style={{ flex: 1 }} />
            <Btn label={t("accept")} kind="success" big onPress={() => setMode("ready")} style={{ flex: 2 }} loading={accept.isPending} />
          </View>
        )
      ) : null}

      {o.status === "ACCEPTED" ? (
        <View style={{ gap: 8 }}>
          {o.ready_by ? <Txt size={13} muted>{t("ready")} · {clock(o.ready_by)}</Txt> : null}
          <Btn label={t("startCutting")} big onPress={() => cutting.mutate(o.id)} loading={cutting.isPending} />
        </View>
      ) : null}

      {o.status === "PACKING" ? (
        <View style={{ gap: 10 }}>
          <Txt size={13} muted>{t("weighNote")}</Txt>
          {items.map((it) => {
            const saved = it.actual_kg != null;
            return (
              <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Txt size={14} style={{ flex: 1 }} numberOfLines={1}>{it.products.name}</Txt>
                <TextInput
                  value={weights[it.id] ?? (it.actual_kg != null ? String(it.actual_kg) : "")}
                  onChangeText={(v) => setWeights((w) => ({ ...w, [it.id]: v.replace(/[^0-9.]/g, "") }))}
                  keyboardType="decimal-pad"
                  placeholder={String(it.requested_kg)}
                  placeholderTextColor={c.muted}
                  allowFontScaling={false}
                  style={{ width: 90, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: saved ? c.success : c.border, backgroundColor: c.surface, textAlign: "center", fontFamily: "Manrope_700Bold", fontSize: 16, color: c.ink }}
                />
                <Btn
                  label={saved ? `✓ ${t("saved")}` : t("save")}
                  kind={saved ? "soft" : "outline"}
                  onPress={() => {
                    const v = Number(weights[it.id]);
                    if (v > 0) weigh.mutate({ orderId: o.id, orderItemId: it.id, actualQty: v });
                  }}
                  style={{ minWidth: 96 }}
                />
              </View>
            );
          })}
          <Btn
            label={t("markPacked")}
            kind="success"
            big
            onPress={() => packed.mutate(o.id)}
            loading={packed.isPending}
            disabled={items.some((i) => i.actual_kg == null)}
          />
        </View>
      ) : null}

      {o.status === "PACKED" ? (
        <View style={{ height: 48, borderRadius: 24, backgroundColor: c.successBg, alignItems: "center", justifyContent: "center" }}>
          <Txt bold size={15} color={c.success}>{t("waitingRider")}</Txt>
        </View>
      ) : null}
    </View>
  );
}

export function OrdersScreen({ dealerId, shopName, isOpen }: { dealerId: string; shopName: string; isOpen: boolean }) {
  const c = useC();
  const t = useT();
  const orders = useDealerOrders(dealerId);
  const shop = useShopState();
  const [open, setOpen] = useState(isOpen);

  const list = orders.data ?? [];
  return (
    <View style={{ flex: 1 }}>
      {/* Shop open/closed — the biggest control on the screen */}
      <View style={{ margin: 16, marginBottom: 8, padding: 16, borderRadius: 22, backgroundColor: open ? c.successBg : c.surface2, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Txt bold size={17} color={open ? c.success : c.muted}>{open ? t("shopOpen") : t("shopClosed")}</Txt>
          <Txt size={13} muted numberOfLines={1}>{shopName}</Txt>
        </View>
        <Switch
          value={open}
          onValueChange={(v) => {
            setOpen(v);
            shop.mutate({ isOpen: v });
          }}
          trackColor={{ true: c.success, false: c.border }}
          thumbColor="#FFFFFF"
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 14, paddingBottom: 40 }}>
        {list.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Txt muted>{t("noOrders")}</Txt>
          </View>
        ) : (
          list.map((o) => <OrderCard key={o.id} o={o} />)
        )}
      </ScrollView>
    </View>
  );
}
