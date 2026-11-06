import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Floating panel pinned to a field. Rendered on <body> so a scrolling drawer
 * never clips it, and flipped left/up when it would run off the screen.
 * Escape and a click outside close it (Escape doesn't also close the drawer).
 */
export function Popover({ anchor, open, onClose, width, className = "p-3", children }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; width?: number; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const a = anchor.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const w = width ?? r.width;
      const h = box.current?.offsetHeight ?? 0;
      const m = 8;
      const left = Math.max(m, Math.min(r.left, window.innerWidth - w - m));
      const fitsBelow = r.bottom + 6 + h <= window.innerHeight - m;
      const top = fitsBelow || r.top - 6 - h < m ? r.bottom + 6 : r.top - 6 - h;
      setPos({ left, top, width: w });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, width, anchor]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={box}
      style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width ?? width, zIndex: 60 }}
      className={`rounded-xl border border-line bg-surface shadow-xl shadow-ink/10 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
