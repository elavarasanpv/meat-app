import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProductUnit } from "@/hooks/useCatalog";

export type Vertical = "meat" | "grocery";
/** Delivery terms for a pincode, set by the admin (delivery_quote()). */
export type FeeRule = { minOrder: number; fee: number; freeAbove: number | null; /** This customer's first order: no delivery fee. */ firstOrderFree?: boolean };

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

/** Meat delivery terms until the live ones have loaded once (what the app charged before they were configurable). */
export const DELIVERY_FEE = 20;
export const FREE_DELIVERY_ABOVE = 499;

type Baskets = Record<Vertical, CartItem[]>;

type CartState = {
  /** One basket per section. A section's order is placed from its own basket only. */
  baskets: Baskets;
  /** The section the customer is in. Follows the Home section switch (store/vertical.ts). */
  active: Vertical;
  setActive: (v: Vertical) => void;
  /** The basket of the section the customer is in: what the cart bar, badge, cart and checkout show. */
  items: CartItem[];
  /** Grocery delivery rule captured when the basket was started. */
  feeRule: FeeRule | null;
  setFeeRule: (rule: FeeRule | null) => void;
  /** Meat delivery terms last seen for the chosen address. */
  meatRule: FeeRule | null;
  setMeatRule: (rule: FeeRule | null) => void;
  /** The line most recently added/changed — lets the floating cart bar say "X added". */
  lastAdded: { name: string; nameTa?: string; at: number } | null;
  /** Coupon the customer typed; the server still picks the single best offer. */
  coupon: string | null;
  setCoupon: (code: string | null) => void;
  /** Add or replace the line for a product, in its own section's basket; the app moves to that section. */
  upsert: (item: CartItem) => void;
  /** Set quantity; 0 or less removes the line. */
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  /** Empty the basket of the section the customer is in; the other baskets stay. */
  clear: () => void;
};

/** The active basket changed: keep `items` and `baskets` saying the same thing. */
const put = (s: CartState, items: CartItem[]) => ({ items, baskets: { ...s.baskets, [s.active]: items } });

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      baskets: { meat: [], grocery: [] },
      active: "meat",
      setActive: (active) => set((s) => (active === s.active ? s : { active, items: s.baskets[active], lastAdded: null })),
      items: [],
      feeRule: null,
      setFeeRule: (feeRule) => set({ feeRule }),
      meatRule: null,
      setMeatRule: (meatRule) => set({ meatRule }),
      lastAdded: null,
      coupon: null,
      setCoupon: (code) => set({ coupon: code }),
      upsert: (item) =>
        set((s) => {
          const active = item.vertical ?? "meat";
          const items = [...s.baskets[active].filter((i) => i.productId !== item.productId), item];
          return { active, items, baskets: { ...s.baskets, [active]: items }, lastAdded: { name: item.name, nameTa: item.nameTa, at: Date.now() } };
        }),
      setQty: (productId, qty) =>
        set((s) => put(s, qty <= 0 ? s.items.filter((i) => i.productId !== productId) : s.items.map((i) => (i.productId === productId ? { ...i, qty } : i)))),
      remove: (productId) => set((s) => put(s, s.items.filter((i) => i.productId !== productId))),
      // The first-order offer is asked afresh for the next basket: an order may just have used it.
      clear: () =>
        set((s) => ({
          ...put(s, []),
          lastAdded: null,
          coupon: null,
          feeRule: s.active === "grocery" ? null : s.feeRule,
          meatRule: s.meatRule ? { ...s.meatRule, firstOrderFree: false } : null,
        })),
    }),
    {
      name: "thanjozmart.cart",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ baskets: s.baskets, coupon: s.coupon, feeRule: s.feeRule, meatRule: s.meatRule }),
      // Builds before per-section baskets saved one `items` list, all of one section.
      migrate: (saved) => {
        const old = (saved ?? {}) as { items?: CartItem[]; baskets?: Baskets };
        if (old.baskets) return old;
        const items = old.items ?? [];
        const { items: _, ...rest } = old;
        return { ...rest, baskets: { meat: [], grocery: [], [cartVertical(items)]: items } };
      },
      // The app opens on Meat & fish, so that basket is the one showing.
      merge: (saved, current) => {
        const s = { ...current, ...(saved as Partial<CartState>) };
        const baskets = { meat: s.baskets?.meat ?? [], grocery: s.baskets?.grocery ?? [] };
        return { ...s, baskets, active: "meat", items: baskets.meat };
      },
    },
  ),
);

export function lineTotal(i: CartItem): number {
  return Math.round(i.price * i.qty);
}

/** Which section a basket's lines belong to: meat (default) or grocery. */
export function cartVertical(items: CartItem[]): Vertical {
  return items[0]?.vertical ?? "meat";
}

/** Nothing stops a line joining now: each section has its own basket, and upsert() files it there. */
export function basketConflict(_items: CartItem[], _item: CartItem): "vertical" | null {
  return null;
}

export function cartTotals(items: CartItem[], feeRule?: FeeRule | null) {
  const itemTotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  const grocery = cartVertical(items) === "grocery";
  const rule: FeeRule = feeRule ?? (grocery ? { minOrder: 0, fee: 0, freeAbove: null } : { minOrder: 0, fee: DELIVERY_FEE, freeAbove: FREE_DELIVERY_ABOVE });
  const fee = rule.fee;
  // A rule with no fee has nothing to unlock.
  const freeAbove = fee > 0 ? rule.freeAbove : null;
  const minOrder = rule.minOrder;
  const firstFree = !!rule.firstOrderFree && fee > 0 && itemTotal > 0;
  const delivery = itemTotal === 0 || firstFree || (freeAbove != null && itemTotal >= freeAbove) ? 0 : fee;
  return { itemTotal, delivery, toPay: itemTotal + delivery, fee, freeAbove, minOrder, firstFree, belowMin: itemTotal > 0 && itemTotal < minOrder };
}

/** Step for the +/- controls: 0.5 kg or 1 piece for meat; the master's step for grocery. */
export function qtyStep(unit: ProductUnit, step?: number): number {
  if (step) return step;
  return unit === "kg" ? 0.5 : 1;
}

export function formatQty(qty: number, unit: ProductUnit): string {
  return unit === "kg" ? `${qty} kg` : `${qty}`;
}
