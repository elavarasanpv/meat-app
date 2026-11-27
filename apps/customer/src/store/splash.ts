import { create } from "zustand";

/** True once the opening brand animation has cleared, so a screen can hold its own entrance until it is actually seen. */
export const useSplashDone = create<{ done: boolean; finish: () => void }>((set) => ({
  done: false,
  finish: () => set({ done: true }),
}));
