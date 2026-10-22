import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProductUnit } from "@/hooks/useCatalog";

export type CartItem = {
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
};

/** Delivery pricing (v1; moves to the API with checkout). */
export const DELIVERY_FEE = 20;
export const FREE_DELIVERY_ABOVE = 499;

type CartState = {
  items: CartItem[];
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
      upsert: (item) =>
        set((s) => ({ items: [...s.items.filter((i) => i.productId !== item.productId), item] })),
      setQty: (productId, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.productId !== productId)
              : s.items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
        })),
      remove: (productId) => set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      clear: () => set({ items: [] }),
    }),
    { name: "freshcut.cart", storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export function lineTotal(i: CartItem): number {
  return Math.round(i.price * i.qty);
}

export function cartTotals(items: CartItem[]) {
  const itemTotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  const delivery = itemTotal === 0 || itemTotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  return { itemTotal, delivery, toPay: itemTotal + delivery };
}

/** Step for the +/- controls: 0.5 kg or 1 piece. */
export function qtyStep(unit: ProductUnit): number {
  return unit === "kg" ? 0.5 : 1;
}

export function formatQty(qty: number, unit: ProductUnit): string {
  return unit === "kg" ? `${qty} kg` : `${qty}`;
}
