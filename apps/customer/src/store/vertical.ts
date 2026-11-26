import { create } from "zustand";
import { useCart, type Vertical } from "./cart";

/** Which half of Home is showing: Meat & fish (default) or Grocery. Not persisted. */
export const useVertical = create<{ vertical: Vertical; set: (v: Vertical) => void }>((set) => ({
  vertical: "meat",
  set: (vertical) => set({ vertical }),
}));

// The cart shows the basket of the section the customer is in, and adding an item (search, order
// again) moves them to that item's section. Keep the two stores in step, whichever one moved.
useVertical.subscribe((s) => useCart.getState().setActive(s.vertical));
useCart.subscribe((s) => {
  if (s.active !== useVertical.getState().vertical) useVertical.setState({ vertical: s.active });
});
