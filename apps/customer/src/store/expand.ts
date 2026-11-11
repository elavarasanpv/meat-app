import { create } from "zustand";

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * A one-shot "grow this rectangle into a full-screen sheet" request. The
 * CartBar starts it from its measured frame; ExpandSheet at the root plays it.
 */
export const useExpand = create<{ rect: Rect | null; key: number; start: (r: Rect) => void; end: () => void }>((set) => ({
  rect: null,
  key: 0,
  start: (rect) => set((s) => ({ rect, key: s.key + 1 })),
  end: () => set({ rect: null }),
}));
