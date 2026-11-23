import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * The address the customer delivers to. Home shows it, both carts and
 * checkout start from it, and picking another one in checkout (or saving a
 * new one) changes it everywhere. Persisted so it survives a restart.
 */
export const useChosenAddress = create<{ id: string | null; set: (id: string | null) => void }>()(
  persist((set) => ({ id: null, set: (id) => set({ id }) }), { name: "thanjozmart.address", storage: createJSONStorage(() => AsyncStorage) }),
);
