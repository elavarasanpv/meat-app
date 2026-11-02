/** Tiny dependency-free charts: a sparkline for stat tiles and a two-line flow chart. */

function path(values: number[], w: number, h: number, pad = 2): string {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, pad + (h - pad * 2) * (1 - (v - min) / span)] as const);
  // smooth with simple cubic joins
  return pts
    .map((p, i) => {
      if (i === 0) return `M${p[0]},${p[1]}`;
      const q = pts[i - 1];
      const cx = (q[0] + p[0]) / 2;
      return `C${cx},${q[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
    })
    .join(" ");
}

export function Sparkline({ values, color, width = 120, height = 40 }: { values: number[]; color: string; width?: number; height?: number }) {
  const d = path(values, width, height, 3);
  const id = `sp-${color.replace("#", "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {d && <path d={`${d} L${width - 3},${height} L3,${height} Z`} fill={`url(#${id})`} />}
      {d && <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />}
    </svg>
  );
}

export function FlowChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[];
  series: { name: string; values: number[]; color: string; dashed?: boolean; format: (v: number) => string }[];
  height?: number;
}) {
  const w = 720;
  const padL = 44;
  const padB = 28;
  const padT = 14;
  const plotW = w - padL - 12;
  const plotH = height - padT - padB;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  const ticks = 4;
  const x = (i: number) => padL + (labels.length > 1 ? (i * plotW) / (labels.length - 1) : plotW / 2);
  const y = (v: number) => padT + plotH * (1 - v / max);

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max * i) / ticks;
        return (
          <g key={i}>
            <line x1={padL} x2={w - 12} y1={y(v)} y2={y(v)} stroke="#E8DFD8" strokeDasharray="3 4" />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6E625B">{series[0].format(v)}</text>
          </g>
        );
      })}
      {labels.map((l, i) => (
        <text key={l} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="#6E625B">{l}</text>
      ))}
      {series.map((s) => {
        const pts = s.values.map((v, i) => [x(i), y(v)] as const);
        const d = pts
          .map((p, i) => {
            if (i === 0) return `M${p[0]},${p[1]}`;
            const q = pts[i - 1];
            const cx = (q[0] + p[0]) / 2;
            return `C${cx},${q[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
          })
          .join(" ");
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? "6 5" : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="#fff" stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Rounded bar chart (one bar per label), highlights the last bar. */
export function Bars({ values, labels, color = "#E4461F", height = 110, format }: { values: number[]; labels: string[]; color?: string; height?: number; format?: (v: number) => string }) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {values.map((v, i) => {
          const last = i === values.length - 1;
          const h = Math.max(6, (v / max) * (height - 18));
          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end">
              {format && (
                <div className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">{format(v)}</div>
              )}
              <div className="w-full max-w-[22px] rounded-md transition-all" style={{ height: h, background: color, opacity: last ? 1 : 0.35 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {labels.map((l) => (
          <div key={l} className="flex-1 text-center text-[10px] text-muted">{l}</div>
        ))}
      </div>
    </div>
  );
}

/** Donut with the share in the middle. */
export function Donut({ pct, color = "#1E8A4F", size = 84, label }: { pct: number; color?: string; size?: number; label: string }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3ECE6" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold leading-none">{Math.round(pct)}%</span>
        <span className="text-[10px] text-muted">{label}</span>
      </div>
    </div>
  );
}
