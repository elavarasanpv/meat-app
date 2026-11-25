import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * A checkout the server has not answered yet. The id goes with every attempt,
 * so the server makes one order however many times it is sent. Kept on the
 * phone (it survives closing the app) until the server gives a clear answer.
 */
type Pending = { id: string; /** What was being ordered: same basket again = same id. */ sig: string };

type CheckoutState = {
  pending: Pending | null;
  setPending: (p: Pending | null) => void;
};

export const useCheckout = create<CheckoutState>()(
  persist((set) => ({ pending: null, setPending: (pending) => set({ pending }) }), { name: "thanjozmart.checkout", storage: createJSONStorage(() => AsyncStorage) }),
);

/** Random v4 UUID. Only has to be unique among one customer's checkouts. */
export function newRequestId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
