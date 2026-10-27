import * as Location from "expo-location";
import { create } from "zustand";

export type LatLng = { lat: number; lng: number };

/** What the map picker found at a spot: a human name for the pin plus the pincode if known. */
export type Place = { title: string; subtitle: string; pincode: string | null };

/** The spot confirmed on the full-screen picker, handed to the address form. */
export type PinDraft = LatLng & Place;

type DraftState = { draft: PinDraft | null; set: (d: PinDraft) => void; clear: () => void };
export const usePinDraft = create<DraftState>((set) => ({
  draft: null,
  set: (draft) => set({ draft }),
  clear: () => set({ draft: null }),
}));

/** Chettikulam town centre — where the map opens when nothing else is known. */
export const DEFAULT_CENTER: LatLng = { lat: 8.2426, lng: 77.6759 };

const uniq = (parts: (string | null | undefined)[]) => {
  const out: string[] = [];
  for (const p of parts) if (p && !out.includes(p)) out.push(p);
  return out;
};

/**
 * Name the spot under the pin ("Main Road · Chettikulam, Tirunelveli 627120").
 * Uses the phone's own geocoder (Google on Android), so no API key is needed.
 */
export async function describePlace(p: LatLng): Promise<Place> {
  const [r] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
  if (!r) return { title: "", subtitle: "", pincode: null };
  // On rural roads `name` is often just the plus-code; prefer a street or village.
  const useless = (s: string | null) => !s || /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/.test(s) || /unnamed road/i.test(s) || /^[\d\/-]+$/.test(s);
  const title = uniq([useless(r.name) ? null : r.name, useless(r.street) ? null : r.street, r.district, r.subregion, r.city])[0] ?? "";
  const subtitle = uniq([r.district, r.subregion, r.city, r.region, r.postalCode]).filter((s) => s !== title).join(", ");
  const pincode = r.postalCode && /^\d{6}$/.test(r.postalCode) ? r.postalCode : null;
  return { title, subtitle, pincode };
}

/** Find a village / street by name, biased to our area. Returns null when nothing matched. */
export async function findPlace(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;
  const biased = /tamil nadu|india/i.test(q) ? q : `${q}, Tirunelveli, Tamil Nadu, India`;
  let [r] = await Location.geocodeAsync(biased);
  if (!r) [r] = await Location.geocodeAsync(q);
  return r ? { lat: r.latitude, lng: r.longitude } : null;
}
