import { useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import { useGroceryFee, type GroceryItem } from "@/hooks/useGrocery";
import { basketConflict, useCart, type CartItem } from "@/store/cart";

/** Cart line for a catalog item at a quantity. */
export function groceryLine(r: GroceryItem, qty: number): CartItem {
  return {
    productId: r.master_product_id,
    name: r.name,
    nameTa: r.name_ta ?? undefined,
    unit: r.unit === "kg" ? "kg" : "piece",
    price: r.selling_price,
    qty,
    vertical: "grocery",
    mrp: r.mrp,
    step: r.qty_step,
    minQty: r.min_qty,
    imagePath: r.image_path,
  };
}

/**
 * Add / step grocery items into the basket from any screen. A meat basket
 * must be replaced first: `pending` holds the line until the customer
 * confirms (render a ConfirmSheet with `replaceBasket` / `dismiss`).
 */
export function useGroceryBasket(pincode?: string) {
  const fee = useGroceryFee(pincode);
  const items = useCart((s) => s.items);
  const upsert = useCart((s) => s.upsert);
  const setQty = useCart((s) => s.setQty);
  const clear = useCart((s) => s.clear);
  const setFeeRule = useCart((s) => s.setFeeRule);
  const inCart = useMemo(() => new Map(items.map((i) => [i.productId, i])), [items]);
  const [pending, setPending] = useState<CartItem | null>(null);

  function add(r: GroceryItem, qty = r.min_qty) {
    const line = groceryLine(r, qty);
    if (basketConflict(items, line)) return setPending(line);
    if (!items.length) setFeeRule(fee.data ?? null);
    upsert(line);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  function step(r: GroceryItem, dir: 1 | -1) {
    const cur = inCart.get(r.master_product_id)?.qty ?? 0;
    const max = r.unit === "kg" ? 50 : 99;
    const next = Math.round((cur + dir * r.qty_step) * 1000) / 1000;
    if (next < r.min_qty) return setQty(r.master_product_id, 0);
    setQty(r.master_product_id, Math.min(max, next));
  }
  function replaceBasket() {
    if (!pending) return;
    clear();
    setFeeRule(fee.data ?? null);
    upsert(pending);
    setPending(null);
  }
  return { items, inCart, add, step, pending, replaceBasket, dismiss: () => setPending(null), qtyOf: (id: string) => inCart.get(id)?.qty ?? 0 };
}
