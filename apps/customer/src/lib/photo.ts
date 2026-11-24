import { useSyncExternalStore } from "react";
import { PixelRatio, type ImageSourcePropType } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Image } from "expo-image";
import { supabase } from "./supabase";

/**
 * Catalogue photos come in three WebP sizes (see the API's ImagesService):
 *   <kind>/<id>/<stamp>_<hash>.webp       800 px
 *   <kind>/<id>/<stamp>_<hash>-300.webp   300 px
 *   <kind>/<id>/<stamp>_<hash>-160.webp   160 px
 * <hash> is a ThumbHash, painted as a blurred preview while the photo loads.
 * Older uploads ("<stamp>.webp") have no hash and no 160 px file; seed images
 * (.jpg/.png) have only the one file.
 */
const BUCKET = "product-images";
const PUBLIC = `/storage/v1/object/public/${BUCKET}/`;
const NEW_NAME = /\/[0-9a-z]+_([A-Za-z0-9_-]+)\.webp$/;

/** How fast the phone's connection is: "slow" is 3G, "slowest" 2G. */
export type Speed = "fast" | "slow" | "slowest";
let speed: Speed = "fast";
let wifi = false;
const listeners = new Set<() => void>();
NetInfo.addEventListener((s) => {
  const gen = s.type === "cellular" ? s.details?.cellularGeneration : null;
  const next: Speed = gen === "2g" ? "slowest" : gen === "3g" ? "slow" : "fast";
  wifi = s.type === "wifi" || s.type === "ethernet";
  if (next !== speed) {
    speed = next;
    listeners.forEach((l) => l());
  }
});
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useSpeed(): Speed {
  return useSyncExternalStore(subscribe, () => speed);
}

/** The bucket path inside one of our public photo URLs, or null for anything else. */
export function photoPath(uri: string): string | null {
  const i = uri.indexOf(PUBLIC);
  return i < 0 ? null : decodeURIComponent(uri.slice(i + PUBLIC.length).split("?")[0]);
}

export function photoUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The ThumbHash in a photo's name, as the standard base64 expo-image expects. */
export function photoHash(path: string): string | undefined {
  const m = NEW_NAME.exec(path);
  if (!m) return undefined;
  const b = m[1].replace(/-/g, "+").replace(/_/g, "/");
  return b + "=".repeat((4 - (b.length % 4)) % 4);
}

/**
 * The smallest stored size that still looks sharp in a box `widthDp` wide.
 * On 3G the screen's density counts for at most 1.5x, on 2G for 1x, so a
 * 56 dp cart row always gets the 160 px file and a half-screen card gets
 * 160 px on 2G, 300 px on 3G and 800 px on 4G/Wi-Fi.
 */
export function sizedPath(path: string, widthDp: number, s: Speed = speed): string {
  if (!/\.webp$/.test(path)) return path;
  const density = s === "slowest" ? 1 : s === "slow" ? Math.min(PixelRatio.get(), 1.5) : PixelRatio.get();
  const need = widthDp * density * 0.9;
  if (need <= 160 && NEW_NAME.test(path)) return path.replace(/\.webp$/, "-160.webp");
  if (need <= 300) return path.replace(/\.webp$/, "-300.webp");
  return path;
}

/** What expo-image should load for a source from lib/images, plus its blurred preview. */
export function resolvePhoto(source: ImageSourcePropType | undefined, widthDp: number, s: Speed = speed): { source: ImageSourcePropType | string | undefined; hash?: string } {
  if (!source || typeof source === "number" || Array.isArray(source)) return { source };
  const uri = (source as { uri?: string }).uri;
  const path = uri ? photoPath(uri) : null;
  if (!path) return { source };
  return { source: photoUrl(sizedPath(path, widthDp, s)), hash: photoHash(path) };
}

/**
 * Download photos into the disk cache ahead of time (Wi-Fi only, so nobody's
 * mobile data goes on pictures they may never scroll to).
 */
export function prefetchPhotos(sources: (ImageSourcePropType | undefined)[], widthDp: number) {
  if (!wifi) return;
  const urls = sources.map((src) => resolvePhoto(src, widthDp).source).filter((u): u is string => typeof u === "string");
  if (urls.length) Image.prefetch(urls, "disk").catch(() => {});
}
