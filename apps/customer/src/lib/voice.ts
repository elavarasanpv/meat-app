import { Platform } from "react-native";
import { supabase } from "./supabase";
import { ApiError } from "./api";

const configured = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const base = () => (Platform.OS === "android" ? configured.replace(/localhost|127\.0\.0\.1/, "10.0.2.2") : configured);

/** Send a recorded clip to the API; it comes back as English text (Tamil is translated). */
export async function transcribe(uri: string): Promise<{ text: string; language: string | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const form = new FormData();
  // React Native uploads a local file from { uri, name, type }.
  // Android gives a bare path; the upload needs a file:// URI.
  const fileUri = uri.startsWith("file://") || uri.startsWith("content://") ? uri : `file://${uri}`;
  form.append("file", { uri: fileUri, name: "voice.m4a", type: "audio/mp4" } as unknown as Blob);
  const res = await fetch(base() + "/voice/transcribe", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.message ?? `HTTP ${res.status}`, res.status);
  return json;
}

/** Words people say around what they want ("I need one kilo of …, please"). */
const FILLER = new Set(
  "i i'd i'm id im we want wants wanted need needs needed would like to buy get give me us please show some a an the of for and or with kilo kilos kg kgs kilogram kilograms gram grams gm g half quarter one two three four five six seven eight nine ten can you order my have any is there do".split(" "),
);

/** "I need one kilo of mutton." → "mutton". Falls back to the whole sentence if nothing is left. */
export function toQuery(text: string): string {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !FILLER.has(w) && !/^\d+(\.\d+)?$/.test(w));
  return (kept.length ? kept : words).join(" ").trim();
}
