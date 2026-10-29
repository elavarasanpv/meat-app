import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

/** Longest side of the uploaded photo: enough to read a scale display, small for 2G. */
const MAX_SIDE = 1024;

/**
 * Shrink a captured photo to ~1024 px JPEG (~50–200 KB) and upload it to
 * order-proofs/<orderId>/<itemId>-<time>.jpg. Returns the storage path.
 */
export async function uploadProof(orderId: string, orderItemId: string, photo: { uri: string; width: number; height: number }): Promise<string> {
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (photo.width > MAX_SIDE || photo.height > MAX_SIDE) {
    ctx.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await ctx.renderAsync();
  const small = await rendered.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });

  const body = await (await fetch(small.uri)).arrayBuffer();
  const path = `${orderId}/${orderItemId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("order-proofs").upload(path, body, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

/** Short-lived link to show a proof photo inside the app. */
export async function proofUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("order-proofs").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
