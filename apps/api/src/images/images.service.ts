import { BadRequestException, Injectable } from "@nestjs/common";
import sharp from "sharp";
import { SupabaseService } from "../supabase.service";

/** What a photo belongs to; also the folder it is stored under. */
export type ImageKind = "product" | "master" | "category" | "catalog_category";

const BUCKET = "product-images";
const MAX_UPLOAD = 6_000_000; // phones send 3–5 MB JPEGs; we shrink them anyway
const MAIN_PX = 800;
const THUMB_PX = 300;

/**
 * Catalogue photos. Every upload is normalised to two WebP files so the apps
 * never download a 4 MB camera JPEG over a village connection:
 *   <kind>/<id>/main.webp       800 px  — product page
 *   <kind>/<id>/main-300.webp   300 px  — lists, cart, order rows
 * `image_path` on the row holds the 800 px path; the small one is the same
 * path with "-300" before the extension (see thumbPath).
 */
@Injectable()
export class ImagesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Path of the 300 px twin of a main image. */
  static thumbPath(path: string): string {
    return path.replace(/\.webp$/, "-300.webp");
  }

  /** Resize + upload; returns the main path to store on the row. */
  async store(kind: ImageKind, id: string, file: { buffer: Buffer; mimetype?: string; size: number }): Promise<{ path: string; thumb: string }> {
    if (!file?.buffer?.length) throw new BadRequestException("No file");
    if (file.size > MAX_UPLOAD) throw new BadRequestException("Image too large (max 6 MB)");
    if (file.mimetype && !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) throw new BadRequestException("Use a JPG, PNG or WebP image");

    let main: Buffer;
    let thumb: Buffer;
    try {
      // rotate() applies the camera's EXIF orientation; PNG transparency is kept by WebP.
      const base = sharp(file.buffer).rotate();
      main = await base.clone().resize({ width: MAIN_PX, height: MAIN_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      thumb = await base.clone().resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    } catch {
      throw new BadRequestException("That file isn't an image we can read");
    }

    // A fresh name per upload so phones that cached the old picture show the new one.
    const stamp = Date.now().toString(36);
    const path = `${kind}/${id}/${stamp}.webp`;
    const thumbPath = ImagesService.thumbPath(path);
    const storage = this.supabase.admin.storage.from(BUCKET);
    const [a, b] = await Promise.all([
      storage.upload(path, main, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
      storage.upload(thumbPath, thumb, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
    ]);
    if (a.error) throw new BadRequestException(a.error.message);
    if (b.error) throw new BadRequestException(b.error.message);
    return { path, thumb: thumbPath };
  }

  /** Delete both files of a stored image; ignores files already gone. */
  async remove(path: string | null | undefined) {
    if (!path) return;
    await this.supabase.admin.storage.from(BUCKET).remove([path, ImagesService.thumbPath(path)]);
  }

  publicUrl(path: string): string {
    return this.supabase.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
}
