/** Small shared pieces for the admin pages: chips, drawer, fields, buttons, formatters. */
import { useEffect, type ReactNode } from "react";
import { IconX } from "./icons";

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
export const phone10 = (p: string | null) => (p ? p.replace(/^91(?=\d{10}$)/, "") : "");

export type Tone = "ok" | "warn" | "bad" | "info" | "mute";
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  PLACED: { label: "Placed", tone: "info" },
  DEALER_ASSIGNED: { label: "Offered to shop", tone: "warn" },
  ACCEPTED: { label: "Preparing", tone: "info" },
  PACKING: { label: "Cutting", tone: "warn" },
  PACKED: { label: "Packed", tone: "ok" },
  RIDER_ASSIGNED: { label: "Rider assigned", tone: "info" },
  PICKED_UP: { label: "Picked up", tone: "info" },
  OUT_FOR_DELIVERY: { label: "On the way", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
  DELIVERY_FAILED: { label: "Failed", tone: "bad" },
  RETURNED: { label: "Returned", tone: "bad" },
  REFUNDED: { label: "Refunded", tone: "mute" },
};
export const toneCls = (t: Tone) =>
  t === "ok" ? "bg-ok-bg text-ok" : t === "warn" ? "bg-warn-bg text-warn" : t === "bad" ? "bg-tint text-bad" : t === "mute" ? "bg-surface-2 text-muted" : "bg-[#DFEAFB] text-[#2F6FD1]";

export function Chip({ tone = "mute", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip whitespace-nowrap ${toneCls(tone)}`}>{children}</span>;
}
export function StatusChip({ status, late }: { status: string; late?: boolean }) {
  if (late) return <span className="chip bg-bad text-white">Late</span>;
  const s = STATUS[status] ?? { label: status, tone: "info" as Tone };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function Btn({
  children,
  onClick,
  kind = "ghost",
  type = "button",
  disabled,
  busy,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const k =
    kind === "primary"
      ? "bg-primary text-white hover:bg-primary-dark border-primary"
      : kind === "danger"
        ? "bg-surface text-bad border-bad/40 hover:bg-tint"
        : "bg-surface text-ink border-line hover:bg-surface-2";
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition disabled:opacity-50 ${k} ${className}`}>
      {busy ? "Saving…" : children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-bold text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-[11px] font-bold text-bad">{error}</span> : hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}
export const inputCls =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none transition placeholder:text-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/15";

/** Segmented filter (tabs) with counts. */
export function Segments<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-0.5">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-bold transition ${value === i.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
        >
          {i.label}
          {i.count != null && <span className="ml-1 opacity-70">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Right-hand panel over the page (full screen on phones). Esc closes it. */
export function Drawer({ title, sub, onClose, children, footer, wide }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className={`relative flex h-full w-full flex-col bg-ground shadow-2xl ${wide ? "md:max-w-2xl" : "md:max-w-lg"}`}>
        <div className="flex items-start gap-3 border-b border-line bg-surface px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-extrabold">{title}</div>
            {sub && <div className="text-[12px] text-muted">{sub}</div>}
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg border border-line p-1.5 text-muted hover:text-ink">
            <IconX size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-[12.5px] text-muted">{children}</div>;
}
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded-lg bg-tint px-3 py-2 text-[12px] font-bold text-bad">{(error as Error).message}</div>;
}
