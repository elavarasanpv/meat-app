import { writeFileSync } from "node:fs";
import { BadRequestException, Controller, Headers, HttpException, HttpStatus, Post, ServiceUnavailableException, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { requireUser } from "../auth";
import { SupabaseService } from "../supabase.service";

type Upload = { buffer: Buffer; mimetype: string; originalname: string; size: number };

/** Each clip costs money, so cap how often one customer can search by voice. */
const LIMIT = 20;
const WINDOW_MS = 10 * 60_000;
const recent = new Map<string, number[]>();
function allow(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) return false;
  hits.push(now);
  recent.set(userId, hits);
  return true;
}

/**
 * Voice search: the app records a short clip (Tamil, English or a mix) and we
 * send it to Sarvam's speech-to-text in translate mode, which returns English
 * text ready for the catalogue search. The key stays on the server.
 */
@Controller("voice")
export class VoiceController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post("transcribe")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2_000_000 } }))
  async transcribe(@Headers("authorization") auth: string | undefined, @UploadedFile() file: Upload | undefined) {
    const user = await requireUser(this.supabase, auth);
    if (!file?.buffer?.length) throw new BadRequestException("No audio");
    if (!allow(user.id)) throw new HttpException("Too many voice searches. Please type, or try again in a few minutes.", HttpStatus.TOO_MANY_REQUESTS);
    const key = process.env.SARVAM_API_KEY;
    if (!key) throw new ServiceUnavailableException("Voice search is not set up");

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "audio/mp4" }), file.originalname || "voice.m4a");
    form.append("model", "saaras:v3");
    form.append("mode", "translate");
    // set VOICE_DEBUG_FILE to a path to keep the last clip for checking a bad recording (off by default)
    if (process.env.VOICE_DEBUG_FILE) writeFileSync(process.env.VOICE_DEBUG_FILE, file.buffer);
    const t0 = Date.now();
    const res = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": key }, body: form });
    const json = (await res.json().catch(() => null)) as { transcript?: string; language_code?: string | null; error?: { message?: string } } | null;
    // one line per clip so a "didn't catch that" can be traced (no audio or key is logged)
    console.log(`[voice] ${file.size}B ${file.mimetype} -> ${res.status} ${Date.now() - t0}ms lang=${json?.language_code ?? "-"} "${json?.transcript ?? json?.error?.message ?? ""}"`);
    if (!res.ok) throw new ServiceUnavailableException(json?.error?.message ?? `Speech service error ${res.status}`);
    return { text: (json?.transcript ?? "").trim(), language: json?.language_code ?? null };
  }
}
