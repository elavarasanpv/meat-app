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
