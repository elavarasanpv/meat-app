import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Longest side of a product photo: 960 x 960 at most, so always under 1 megapixel. */
const MAX_SIDE = 960;
/** The API refuses anything over 1 MB; stay well inside it. */
const MAX_BYTES = 900_000;

export type PickedPhoto = { uri: string; name: string; type: string };
export class PhotoError extends Error {
  constructor(public code: "denied" | "tooBig") {
    super(code);
  }
}

async function sizeOf(uri: string): Promise<number> {
  return (await (await fetch(uri)).blob()).size;
}

/**
 * Take or choose a product photo, then shrink it on the phone to a small JPEG
 * (under 1 MP and under 1 MB) so it uploads on a slow connection.
 * Returns null when the shop owner backs out.
 */
export async function pickProductPhoto(from: "camera" | "gallery"): Promise<PickedPhoto | null> {
  if (from === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PhotoError("denied");
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const res = from === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;

  for (const compress of [0.8, 0.6, 0.4]) {
    const ctx = ImageManipulator.manipulate(a.uri);
    if (a.width > MAX_SIDE || a.height > MAX_SIDE) ctx.resize(a.width >= a.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const small = await (await ctx.renderAsync()).saveAsync({ compress, format: SaveFormat.JPEG });
    if ((await sizeOf(small.uri)) <= MAX_BYTES) return { uri: small.uri, name: "product.jpg", type: "image/jpeg" };
  }
  throw new PhotoError("tooBig");
}
