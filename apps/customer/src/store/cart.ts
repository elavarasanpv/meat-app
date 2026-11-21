import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProductUnit } from "@/hooks/useCatalog";

export type Vertical = "meat" | "grocery";
/** Grocery delivery rule for the chosen shop's area (from grocery_fee()); meat uses the constants below. */
export type FeeRule = { minOrder: number; fee: number; freeAbove: number | null };

export type CartItem = {
  /** Meat: products.id. Grocery: master_products.id. */
  productId: string;
  /** English name (also used to pick the image). */
  name: string;
  /** Tamil name, if the product has one. */
  nameTa?: string;
  unit: ProductUnit;
  /** Price per kg or per piece. */
  price: number;
  /** Kg (0.5 steps) or piece count. */
  qty: number;
  size?: "small" | "medium" | "large";
  notes?: string;
  /** Missing on lines saved by older builds = meat. */
  vertical?: Vertical;
  /** Left over from builds where a grocery basket was tied to one shop; ignored now. */
  dealerId?: string;
  dealerName?: string;
  mrp?: number | null;
  /** Grocery: quantity step and minimum from the master product. */
  step?: number;
  minQty?: number;
  imagePath?: string | null;
};

/** Delivery pricing (v1; moves to the API with checkout). */
export const DELIVERY_FEE = 20;
export const FREE_DELIVERY_ABOVE = 499;

type CartState = {
  items: CartItem[];
  /** Grocery delivery rule captured when the basket was started. */
  feeRule: FeeRule | null;
  setFeeRule: (rule: FeeRule | null) => void;
  /** The line most recently added/changed — lets the floating cart bar say "X added". */
  lastAdded: { name: string; nameTa?: string; at: number } | null;
  /** Coupon the customer typed; the server still picks the single best offer. */
  coupon: string | null;
  setCoupon: (code: string | null) => void;
  /** Add or replace the line for a product. */
  upsert: (item: CartItem) => void;
  /** Set quantity; 0 or less removes the line. */
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      feeRule: null,
      setFeeRule: (feeRule) => set({ feeRule }),
      lastAdded: null,
      coupon: null,
      setCoupon: (code) => set({ coupon: code }),
      upsert: (item) =>
        set((s) => ({
          items: [...s.items.filter((i) => i.productId !== item.productId), item],
          lastAdded: { name: item.name, nameTa: item.nameTa, at: Date.now() },
        })),
      setQty: (productId, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.productId !== productId)
              : s.items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
        })),
      remove: (productId) => set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      clear: () => set({ items: [], lastAdded: null, coupon: null, feeRule: null }),
    }),
    { name: "thanjozmart.cart", storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ items: s.items, coupon: s.coupon, feeRule: s.feeRule }) },
  ),
);

export function lineTotal(i: CartItem): number {
  return Math.round(i.price * i.qty);
}

/** What the basket is for: meat (default) or grocery. Baskets never mix. */
export function cartVertical(items: CartItem[]): Vertical {
  return items[0]?.vertical ?? "meat";
}

/** Why this line can't join the basket: meat and grocery never share one. */
export function basketConflict(items: CartItem[], item: CartItem): "vertical" | null {
  if (!items.length) return null;
  return (item.vertical ?? "meat") !== cartVertical(items) ? "vertical" : null;
}

export function cartTotals(items: CartItem[], feeRule?: FeeRule | null) {
  const itemTotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  const grocery = cartVertical(items) === "grocery";
  const fee = grocery ? feeRule?.fee ?? 0 : DELIVERY_FEE;
  const freeAbove = grocery ? feeRule?.freeAbove ?? null : FREE_DELIVERY_ABOVE;
  const minOrder = grocery ? feeRule?.minOrder ?? 0 : 0;
  const delivery = itemTotal === 0 || (freeAbove != null && itemTotal >= freeAbove) ? 0 : fee;
  return { itemTotal, delivery, toPay: itemTotal + delivery, freeAbove, minOrder, belowMin: itemTotal > 0 && itemTotal < minOrder };
}

/** Step for the +/- controls: 0.5 kg or 1 piece for meat; the master's step for grocery. */
export function qtyStep(unit: ProductUnit, step?: number): number {
  if (step) return step;
  return unit === "kg" ? 0.5 : 1;
}

export function formatQty(qty: number, unit: ProductUnit): string {
  return unit === "kg" ? `${qty} kg` : `${qty}`;
}
