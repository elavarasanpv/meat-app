import { create } from "zustand";
import type { Vertical } from "./cart";

/** Which half of Home is showing: Meat & fish (default) or Grocery. Not persisted. */
export const useVertical = create<{ vertical: Vertical; set: (v: Vertical) => void }>((set) => ({
  vertical: "meat",
  set: (vertical) => set({ vertical }),
}));
