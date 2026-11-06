import { useRef, useState, type ReactNode } from "react";
import { IconCalendar, IconCheck, IconChevron, IconChevronDown, IconChevronLeft, IconImage } from "./icons";
import { Popover } from "./Popover";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const formatDate = (v: string) => (v ? parse(v).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Pick a date");

const fieldBtn = (open: boolean) =>
  `flex items-center justify-between gap-2 rounded-lg border bg-surface px-2.5 py-1.5 text-left text-[13px] font-bold transition ${open ? "border-primary ring-2 ring-primary/15" : "border-line hover:border-muted/50"}`;

/** Date field in FreshCut style: a month grid instead of the browser's picker. Value is "YYYY-MM-DD". */
export function DatePicker({ value, onChange, label, min }: { value: string; onChange: (v: string) => void; label?: string; min?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [month, setMonth] = useState(() => parse(value || ymd(new Date())));
  const today = ymd(new Date());

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          if (!open) setMonth(parse(value || today));
          setOpen((o) => !o);
        }}
        className={`${fieldBtn(open)} w-44`}
      >
        <span className="truncate">{formatDate(value)}</span>
        <IconCalendar size={14} className={open ? "text-primary" : "text-muted"} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={264}>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink">
            <IconChevronLeft size={16} />
          </button>
          <span className="text-[13px] font-extrabold">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink">
            <IconChevron size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <span key={d} className="py-1 text-[10.5px] font-extrabold uppercase text-muted">
              {d}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />;
            const on = d === value;
            const off = !!min && d < min;
            return (
              <button
                key={d}
                type="button"
                disabled={off}
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                }}
                className={`h-8 rounded-lg text-[12.5px] font-bold transition ${on ? "bg-primary text-white shadow-sm shadow-primary/30" : off ? "text-muted/40" : d === today ? "text-primary ring-1 ring-inset ring-primary/40 hover:bg-tint" : "text-ink hover:bg-tint hover:text-primary"}`}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-2">
          <button type="button" disabled={!!min && today < min} onClick={() => { onChange(today); setOpen(false); }} className="rounded-lg px-2 py-1 text-[12px] font-extrabold text-primary hover:bg-tint disabled:text-muted/40">
            Today
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-[12px] font-bold text-muted hover:text-ink">
            Close
          </button>
        </div>
      </Popover>
    </>
  );
}

/** Dropdown in FreshCut style, in place of the browser's <select>. */
export function Select<T extends string>({ value, onChange, options, placeholder = "Choose…", label }: { value: T | ""; onChange: (v: T) => void; options: { value: T; label: string }[]; placeholder?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <button ref={ref} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${fieldBtn(open)} w-full`}>
        <span className={`truncate ${cur ? "" : "font-normal text-muted/70"}`}>{cur?.label ?? placeholder}</span>
        <IconChevronDown size={15} className={`shrink-0 transition ${open ? "rotate-180 text-primary" : "text-muted"}`} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} className="p-1">
        <div role="listbox" className="max-h-64 overflow-y-auto">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${on ? "bg-tint font-extrabold text-primary" : "font-bold text-ink hover:bg-surface-2"}`}
              >
                <span className="truncate">{o.label}</span>
                {on && <IconCheck size={14} />}
              </button>
            );
          })}
          {!options.length && <div className="px-2.5 py-2 text-[12px] text-muted">Nothing to choose yet.</div>}
        </div>
      </Popover>
    </>
  );
}

/** Tick box in FreshCut style; the whole row is the hit area. */
export function Check({ checked, onChange, children, className = "" }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <label className={`flex cursor-pointer select-none items-center gap-2.5 text-[12.5px] ${className}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 ${checked ? "border-primary bg-primary text-white" : "border-line bg-surface"}`}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className={checked ? "opacity-100" : "opacity-0"}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/**
 * Photo drop zone with a preview on a checkerboard, so a transparent PNG
 * reads as transparent. Click or drop a file.
 */
export function PhotoPicker({ url, name, onPick, onRemove, hint }: { url: string | null; name?: string | null; onPick: (f: File) => void; onRemove?: () => void; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith("image/")) onPick(f);
      }}
      className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-2.5 transition ${over ? "border-primary bg-tint/50" : "border-line bg-surface hover:border-muted/50"}`}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={url ? "Replace photo" : "Upload photo"}
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line"
        style={url ? { backgroundImage: "repeating-conic-gradient(#EEE6DF 0% 25%, #FFFFFF 0% 50%)", backgroundSize: "12px 12px" } : undefined}
      >
        {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <IconImage size={22} className="text-muted" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-extrabold">{url ? name || "Photo added" : "Add a photo"}</div>
        <div className="text-[11.5px] leading-snug text-muted">{hint ?? "Drop a file here or click Upload. PNG, JPG or WebP."}</div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" onClick={() => input.current?.click()} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-extrabold text-ink hover:border-primary hover:text-primary">
          {url ? "Replace" : "Upload"}
        </button>
        {url && onRemove && (
          <button type="button" onClick={onRemove} className="rounded-lg px-2 py-1 text-[12px] font-bold text-muted hover:text-bad">
            Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
