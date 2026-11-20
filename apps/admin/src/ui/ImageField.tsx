import { useRef, useState } from "react";
import { api, upload } from "../lib/api";
import { supabase } from "../lib/supabase";
import { Btn } from "./kit";

/** Public URL of a stored photo; `thumb` picks the 300 px twin the API writes next to the main file. */
export function imageUrl(path: string | null | undefined, thumb = false): string | null {
  if (!path) return null;
  const p = thumb ? path.replace(/\.webp$/, "-300.webp") : path;
  return supabase.storage.from("product-images").getPublicUrl(p).data.publicUrl;
}

/**
 * Photo for a catalogue row. Uploads straight to the API (which resizes to
 * WebP and stores it), so the row's image_path is live the moment it returns.
 * `endpoint` is the row's image route, e.g. /admin/catalog/master/<id>/image.
 */
export function ImageField({ path, endpoint, onChange, label = "Photo" }: { path: string | null | undefined; endpoint: string; onChange: (path: string | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const url = preview ?? imageUrl(path, true);

  async function send(file: File) {
    setError(null);
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const r = await upload<{ image_path: string | null }>(endpoint, file);
      onChange(r.image_path);
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setError(null);
    setBusy(true);
    try {
      await api(endpoint, { method: "DELETE" });
      setPreview(null);
      onChange(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="text-[11.5px] font-bold text-muted">{label}</div>
      <div
        className={`mt-1 flex items-center gap-3 rounded-xl border p-2 ${busy ? "opacity-60" : ""} border-line bg-surface`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void send(f);
        }}
      >
        <button type="button" onClick={() => input.current?.click()} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-2 text-[11px] font-bold text-muted" aria-label={url ? "Replace photo" : "Add photo"}>
          {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : "+ Add"}
        </button>
        <div className="min-w-0 flex-1 text-[11.5px] text-muted">
          {url ? "Shown on the product card and page." : "Drop a JPG/PNG here or click. Up to 6 MB; we resize it."}
          {error && <div className="mt-1 font-bold text-bad">{error}</div>}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Btn kind="ghost" onClick={() => input.current?.click()} disabled={busy}>
            {url ? "Replace" : "Upload"}
          </Btn>
          {url && (
            <Btn kind="ghost" onClick={() => void clear()} disabled={busy}>
              Remove
            </Btn>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
      </div>
    </div>
  );
}
