import { create } from "zustand";

/** What the shared scale camera is photographing right now. */
export type CameraRequest = { orderId: string; orderItemId: string; title: string };

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
