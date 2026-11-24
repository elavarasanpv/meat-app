import { BadRequestException, Injectable } from "@nestjs/common";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import { SupabaseService } from "../supabase.service";

/** What a photo belongs to; also the folder it is stored under. */
export type ImageKind = "product" | "master" | "category" | "catalog_category" | "offer";

const BUCKET = "product-images";
const MAX_UPLOAD = 6_000_000; // phones send 3–5 MB JPEGs; we shrink them anyway
const MAIN_PX = 800;
const THUMB_PX = 300;
const TINY_PX = 160;

/**
 * Catalogue photos. Every upload is normalised to three WebP files so the apps
 * never download a 4 MB camera JPEG over a village connection:
 *   <kind>/<id>/<stamp>_<hash>.webp       800 px  product page
 *   <kind>/<id>/<stamp>_<hash>-300.webp   300 px  cards
 *   <kind>/<id>/<stamp>_<hash>-160.webp   160 px  small rows, and cards on 2G
 * `image_path` on the row holds the 800 px path; the others are the same path
 * with "-300"/"-160" before the extension. <hash> is the photo's ThumbHash
 * (URL-safe base64, about 30 characters): the apps paint it as a blurred
 * preview before a single byte of the photo has arrived, with no extra column
 * or query. A name without "_<hash>" is an older upload that has no -160 file.
 */
@Injectable()
export class ImagesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Path of the 300 px twin of a main image. */
  static thumbPath(path: string): string {
    return path.replace(/\.webp$/, "-300.webp");
  }

  static tinyPath(path: string): string {
    return path.replace(/\.webp$/, "-160.webp");
  }

  /** Resize + upload; returns the main path to store on the row. */
  async store(kind: ImageKind, id: string, file: { buffer: Buffer; mimetype?: string; size: number }): Promise<{ path: string; thumb: string }> {
    if (!file?.buffer?.length) throw new BadRequestException("No file");
    if (file.size > MAX_UPLOAD) throw new BadRequestException("Image too large (max 6 MB)");
    if (file.mimetype && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) throw new BadRequestException("Use a JPG, PNG or WebP image");

    let main: Buffer;
    let thumb: Buffer;
    let tiny: Buffer;
    let hash: string;
    try {
      // rotate() applies the camera's EXIF orientation; PNG transparency is kept by WebP.
      const base = sharp(file.buffer).rotate();
      main = await base.clone().resize({ width: MAIN_PX, height: MAIN_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      thumb = await base.clone().resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      tiny = await base.clone().resize({ width: TINY_PX, height: TINY_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
      // ThumbHash works on at most 100x100 pixels.
      const { data, info } = await base.clone().resize({ width: 100, height: 100, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      hash = Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64url");
    } catch {
      throw new BadRequestException("That file isn't an image we can read");
    }

    // A fresh name per upload so phones that cached the old picture show the new one.
    const stamp = Date.now().toString(36);
    const path = `${kind}/${id}/${stamp}_${hash}.webp`;
    const thumbPath = ImagesService.thumbPath(path);
    const storage = this.supabase.admin.storage.from(BUCKET);
    const done = await Promise.all(
      ([[path, main], [thumbPath, thumb], [ImagesService.tinyPath(path), tiny]] as const).map(([p, body]) =>
        storage.upload(p, body, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
      ),
    );
    const failed = done.find((r) => r.error);
    if (failed?.error) throw new BadRequestException(failed.error.message);
    return { path, thumb: thumbPath };
  }

  /** Delete every size of a stored image; ignores files already gone. */
  async remove(path: string | null | undefined) {
    if (!path) return;
    await this.supabase.admin.storage.from(BUCKET).remove([path, ImagesService.thumbPath(path), ImagesService.tinyPath(path)]);
  }

  publicUrl(path: string): string {
    return this.supabase.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
}
