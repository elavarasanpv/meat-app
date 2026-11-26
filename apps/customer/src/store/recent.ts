import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Vertical } from "./cart";

/** How many past searches each section remembers. */
const KEEP = 8;

type State = {
  /** What the customer searched for, newest first, kept apart for Meat & fish and Grocery. */
  recent: Record<Vertical, string[]>;
  add: (vertical: Vertical, query: string) => void;
  clear: (vertical: Vertical) => void;
};

/** Recent searches, saved on the phone so the search page can offer them again. */
export const useRecentSearches = create<State>()(
  persist(
    (set) => ({
      recent: { meat: [], grocery: [] },
      add: (vertical, query) => {
        const q = query.trim().replace(/\s+/g, " ");
        if (q.length < 2) return;
        set((s) => ({
          recent: { ...s.recent, [vertical]: [q, ...s.recent[vertical].filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, KEEP) },
        }));
      },
      clear: (vertical) => set((s) => ({ recent: { ...s.recent, [vertical]: [] } })),
    }),
    { name: "recent-searches", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
