import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

/** Longest side of the uploaded photo: enough to read a scale display, small for 2G. */
const MAX_SIDE = 1024;

/**
 * Open the camera, shrink the shot to ~1024 px JPEG (~100–200 KB) and upload
 * it to order-proofs/<orderId>/<itemId>-<time>.jpg. Returns the storage path,
 * or null if the shop owner backed out of the camera.
 */
export async function captureProof(orderId: string, orderItemId: string): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("camera-denied");

  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: false });
  if (shot.canceled || !shot.assets?.[0]) return null;
  const asset = shot.assets[0];

  const ctx = ImageManipulator.manipulate(asset.uri);
  if ((asset.width ?? 0) > MAX_SIDE || (asset.height ?? 0) > MAX_SIDE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
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
