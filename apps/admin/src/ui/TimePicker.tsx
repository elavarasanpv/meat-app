import { useRef, useState } from "react";
import { IconClock } from "./icons";
import { Popover } from "./Popover";

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 15, 30, 45];

/** "HH:MM" (24h) ⇄ parts on a 12-hour clock. */
function split(v: string) {
  const [h, m] = v.split(":").map(Number);
  return { h12: h % 12 === 0 ? 12 : h % 12, m, pm: h >= 12 };
}
function join(h12: number, m: number, pm: boolean) {
  const h = (h12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export function formatTime(v: string) {
  const { h12, m, pm } = split(v);
  return `${h12}:${String(m).padStart(2, "0")} ${pm ? "pm" : "am"}`;
}

/** Time field in FreshCut style: tap to open hours, minutes and am/pm. Value is "HH:MM" 24h. */
export function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const { h12, m, pm } = split(value);

  const cell = (on: boolean) =>
    `rounded-lg py-1.5 text-[12.5px] font-bold transition ${on ? "bg-primary text-white shadow-sm shadow-primary/30" : "text-ink hover:bg-tint hover:text-primary"}`;

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-32 items-center justify-between rounded-lg border bg-surface px-2.5 py-1.5 text-[13px] font-bold transition ${open ? "border-primary ring-2 ring-primary/15" : "border-line hover:border-muted/50"}`}
      >
        {formatTime(value)}
        <IconClock size={14} className={open ? "text-primary" : "text-muted"} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={240}>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">Hour</span>
            <div className="flex rounded-lg bg-surface-2 p-0.5">
              {[false, true].map((isPm) => (
                <button key={String(isPm)} type="button" onClick={() => onChange(join(h12, m, isPm))} className={`rounded-md px-2.5 py-0.5 text-[11.5px] font-extrabold transition ${pm === isPm ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                  {isPm ? "PM" : "AM"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {HOURS.map((h) => (
              <button key={h} type="button" className={cell(h === h12)} onClick={() => onChange(join(h, m, pm))}>
                {h}
              </button>
            ))}
          </div>
          <div className="mb-1.5 mt-3 text-[10.5px] font-extrabold uppercase tracking-wide text-muted">Minute</div>
          <div className="grid grid-cols-4 gap-1">
            {MINUTES.map((x) => (
              <button key={x} type="button" className={cell(x === m)} onClick={() => onChange(join(h12, x, pm))}>
                :{String(x).padStart(2, "0")}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-lg bg-primary py-1.5 text-[12.5px] font-extrabold text-white hover:bg-primary-dark">
            Done · {formatTime(value)}
          </button>
        </div>
      </Popover>
    </>
  );
}
