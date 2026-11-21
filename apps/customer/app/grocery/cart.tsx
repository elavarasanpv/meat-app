import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useBill } from "@/components/BillSummary";
import { GroceryCart } from "@/components/GroceryCart";
import { useHomePincode } from "@/hooks/useOffers";
import { useAddresses, usePlaceGroceryOrder, useSlots } from "@/hooks/useOrders";
import { useT } from "@/i18n";
import { errorMessage } from "@/lib/network";
import { useCart } from "@/store/cart";
import { useVertical } from "@/store/vertical";
import { Accent, useTheme, withAccent } from "@/theme";

/**
 * Full-screen grocery cart (no tab bar): back arrow to Home. The bottom
 * button depends on the address book — exactly one address places the
 * order right here (shown slot, cash on delivery); none or several sends
 * the customer to checkout to pick one.
 */
export default function GroceryCartScreen() {
  const theme = useTheme();
  const c = withAccent(theme.c, "grocery", theme.dark);
  const t = useT();
  const router = useRouter();
  const pincode = useHomePincode();
  const bill = useBill(pincode);
  const addresses = useAddresses();
  const slots = useSlots();
  const items = useCart((s) => s.items);
  const clearCart = useCart((s) => s.clear);
  const setVertical = useVertical((s) => s.set);
  const place = usePlaceGroceryOrder();
  const [error, setError] = useState<string | null>(null);

  const single = addresses.data?.length === 1 ? addresses.data[0] : null;
  const slot = slots.data?.[0];

  const back = () => {
    setVertical("grocery");
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  async function placeNow() {
    if (!single || !slot) return;
    setError(null);
    try {
      const result = await place.mutateAsync({
        addressId: single.id,
        slot: { startsAt: slot.startsAt, endsAt: slot.endsAt },
        paymentMode: "cod",
        items: items.map((i) => ({ masterProductId: i.productId, qty: i.qty, notes: i.notes })),
      });
      clearCart();
      router.replace({ pathname: "/order/[id]", params: { id: result.orderId, placed: "1" } });
    } catch (e) {
      setError(`${t("orderFailed")} — ${errorMessage(e, t)}`);
    }
  }

  // An empty basket has nothing to show here; Home has the empty state.
  useEffect(() => {
    if (items.length === 0) back();
  }, [items.length]);
  if (items.length === 0) return null;

  return (
    <Accent value="grocery">
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.ground }}>
        <GroceryCart
          bill={bill}
          onBack={back}
          cta={
            single
              ? { label: `${t("placeOrder")} · ₹ ${bill.toPay}`, onPress: placeNow, busy: place.isPending, disabled: bill.belowMin || !slot }
              : { label: t("selectAddress"), onPress: () => router.push("/checkout"), disabled: bill.belowMin }
          }
          address={single}
        />
        {error ? (
          <View style={{ position: "absolute", left: 16, right: 16, bottom: 92 }}>
            <AppText variant="caption" color={c.danger} style={{ textAlign: "center" }}>{error}</AppText>
          </View>
        ) : null}
      </SafeAreaView>
    </Accent>
  );
}
