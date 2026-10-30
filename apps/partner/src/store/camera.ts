import { create } from "zustand";

/**
 * What the shared camera is photographing right now:
 *  • "scale": a packed item on the weighing scale (shop) — saved as the item's proof;
 *  • "door":  the customer's door/gate on a failed delivery (rider) — the
 *    uploaded path is handed back through onDone.
 */
export type CameraRequest =
  | { kind?: "scale"; orderId: string; orderItemId: string; title: string }
  | { kind: "door"; orderId: string; title: string; onDone: (photoPath: string) => void };

type CameraState = {
  request: CameraRequest | null;
  open: (r: CameraRequest) => void;
  close: () => void;
};

/**
 * One camera for the whole app (mounted once in the tab layout). Order cards
 * appear on several tabs, so the camera must not live inside a card — a card
 * re-rendering or unmounting would close it mid-shot.
 */
export const useScaleCamera = create<CameraState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));
