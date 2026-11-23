import * as Location from "expo-location";
import { haversineKm } from "@thanjozmart/shared";
import { create } from "zustand";

export type LatLng = { lat: number; lng: number };

/** What the map picker found at a spot: a human name for the pin plus the pincode if known. */
export type Place = {
  title: string;
  subtitle: string;
  pincode: string | null;
  /** A real street or building name, when the geocoder has one (rural spots often don't). */
  street: string | null;
  /** Village / taluk / district / state, nearest first. */
  parts: string[];
};

/** The spot confirmed on the full-screen picker, handed to the address form. */
export type PinDraft = LatLng & Pick<Place, "title" | "subtitle" | "pincode">;

type DraftState = { draft: PinDraft | null; set: (d: PinDraft) => void; clear: () => void };
export const usePinDraft = create<DraftState>((set) => ({
  draft: null,
  set: (draft) => set({ draft }),
  clear: () => set({ draft: null }),
}));

/** Chettikulam town centre — where the map opens when nothing else is known. */
export const DEFAULT_CENTER: LatLng = { lat: 8.2426, lng: 77.6759 };

export const NO_PLACE: Place = { title: "", subtitle: "", pincode: null, street: null, parts: [] };

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
  if (!r) return NO_PLACE;
  // On rural roads `name` is often just the plus-code; prefer a street or village.
  const useless = (s: string | null) => !s || /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/.test(s) || /unnamed road/i.test(s) || /^[\d\/-]+$/.test(s);
  const street = (useless(r.name) ? null : r.name) ?? (useless(r.street) ? null : r.street) ?? null;
  const parts = uniq([r.district, r.subregion, r.city, r.region]);
  const pincode = r.postalCode && /^\d{6}$/.test(r.postalCode) ? r.postalCode : null;
  const title = street ?? parts[0] ?? "";
  return { title, subtitle: uniq([...parts, pincode]).filter((s) => s !== title).join(", "), pincode, street, parts };
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

export type Zone = { pincode: string; lat: number | null; lng: number | null; area: string | null };

/** A spot this close to a served area's centre is in that area, whatever pincode the geocoder says. */
const NEAR_CENTRE_KM = 5;

/**
 * The delivery area a spot belongs to, or null when we don't deliver there.
 * A served pincode from the geocoder is enough. But the phone's geocoder is
 * coarse in villages (Chettikulam's own centre comes back as the taluk town's
 * pincode), so distance to our area centres decides everything else.
 */
export function zoneFor(p: LatLng, pincode: string | null, zones: Zone[]): Zone | null {
  const byPincode = pincode ? zones.find((z) => z.pincode === pincode) : undefined;
  if (byPincode) return byPincode;
  let best: Zone | null = null;
  let bestKm = NEAR_CENTRE_KM;
  for (const z of zones) {
    if (z.lat == null || z.lng == null) continue;
    const km = haversineKm(p, { lat: z.lat, lng: z.lng });
    if (km <= bestKm) [best, bestKm] = [z, km];
  }
  return best;
}

/** How to name a spot once its area is known: our area name and pincode win over the geocoder's guess. */
export function nameFor(place: Place, zone: Zone | null): { title: string; subtitle: string } {
  if (!zone) return { title: place.title, subtitle: place.subtitle };
  const area = zone.area ?? zone.pincode;
  const title = place.street ?? area;
  return { title, subtitle: uniq([area, ...place.parts, zone.pincode]).filter((s) => s !== title).join(", ") };
}
