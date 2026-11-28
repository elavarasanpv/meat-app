import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushService } from "../push/push.service";

const DEAD = ["CANCELLED", "REFUNDED", "RETURNED", "DELIVERY_FAILED"];

/**
 * What a grocery order's new status means for next-order coupons:
 *  - delivered: an order that earned one gives the customer their coupon;
 *  - cancelled / failed: a coupon spent on it goes back to the customer.
 * Never throws: a coupon problem must not undo a delivery.
 */
export async function couponsAfterTransition(db: SupabaseClient, push: PushService, orderId: string, to: string) {
  try {
    if (to === "DELIVERED") {
      const { data: o } = await db.from("orders").select("customer_id, dealer_id, earns_offer_id").eq("id", orderId).maybeSingle();
      if (!o?.earns_offer_id) return;
      const { data: offer } = await db.from("shop_offers").select("pct, max_discount, valid_days, paid_by").eq("id", o.earns_offer_id).maybeSingle();
      if (!offer?.pct) return;
      const days = Number(offer.valid_days ?? 7);
      const pct = Number(offer.pct);
      const max = Number(offer.max_discount ?? 0);
      // source_order_id is unique: a second DELIVERED for the same order gives nothing more.
      const { error } = await db.from("customer_coupons").insert({
        customer_id: o.customer_id,
        dealer_id: o.dealer_id,
        shop_offer_id: o.earns_offer_id,
        source_order_id: orderId,
        pct,
        max_discount: max,
        paid_by: offer.paid_by ?? "shop",
        expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
      });
      if (error) return;
      await push.toProfiles([o.customer_id as string], {
        title: `🎁 ${pct}% off your next order`,
        body: `Thank you! Save up to ₹${max} on your next grocery order. Valid for ${days} days.`,
        ta: { title: `🎁 அடுத்த ஆர்டரில் ${pct}% தள்ளுபடி`, body: `நன்றி! அடுத்த மளிகை ஆர்டரில் ₹${max} வரை சேமிக்கலாம். ${days} நாட்கள் செல்லும்.` },
        data: { kind: "grocery_offer" },
        channelId: "offers",
      });
    } else if (DEAD.includes(to)) {
      await db.from("customer_coupons").update({ used_order_id: null, used_at: null }).eq("used_order_id", orderId);
    }
  } catch (e) {
    console.warn("[offers] coupon hook", (e as Error).message);
  }
}
