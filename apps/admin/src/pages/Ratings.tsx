import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { Chip, Empty, ErrorBox, Segments, ago } from "../ui/kit";

type Dist = number[]; // index 0 = 1 star … index 4 = 5 stars
type Ratings = {
  app: { avg: number | null; count: number; dist: Dist };
  rider: { avg: number | null; count: number; dist: Dist };
  products: { id: string; name: string; active: boolean; avg: number | null; ratings: number; customers: number }[];
  riders: { id: string; name: string; avg: number | null; ratings: number }[];
  recent: { kind: "app" | "rider" | "product"; stars: number; note: string; who: string | null; order: string | null; at: string }[];
};

const AMBER = "#F2A01B";

function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={value == null ? "No rating yet" : `${value} stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={n <= Math.round(v) ? AMBER : "none"} stroke={AMBER} strokeWidth={1.8} strokeLinejoin="round">
          <path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

function Overview({ title, sub, avg, count, dist }: { title: string; sub: string; avg: number | null; count: number; dist: Dist }) {
  const max = Math.max(1, ...dist);
  return (
    <section className="card">
      <div className="card-title">{title}</div>
      <div className="card-sub">{sub}</div>
      <div className="mt-3 flex items-center gap-4">
        <div>
          <div className="text-[34px] font-extrabold leading-none">{avg == null ? "—" : avg.toFixed(1)}</div>
          <Stars value={avg} size={16} />
          <div className="mt-1 text-[11.5px] text-muted">{count} rating{count === 1 ? "" : "s"}</div>
        </div>
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="flex items-center gap-2 text-[11px]">
              <span className="w-3 text-right font-bold text-muted">{n}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${(dist[n - 1] / max) * 100}%`, background: n >= 4 ? "#1E8A4F" : n === 3 ? AMBER : "#E4461F" }} />
              </div>
              <span className="w-6 text-muted">{dist[n - 1]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const KIND: Record<Ratings["recent"][number]["kind"], { label: string; tone: "info" | "ok" | "warn" }> = {
  app: { label: "App", tone: "info" },
  rider: { label: "Delivery", tone: "ok" },
  product: { label: "Product", tone: "warn" },
};

export function RatingsPage() {
  const q = useQuery<Ratings>({ queryKey: ["admin", "ratings"], queryFn: () => api("/admin/ratings"), refetchInterval: 60_000 });
  const d = q.data;
  const [sort, setSort] = useState<"customers" | "avg" | "ratings">("customers");
  const products = [...(d?.products ?? [])].sort((a, b) => (sort === "customers" ? b.customers - a.customers : sort === "avg" ? (b.avg ?? 0) - (a.avg ?? 0) : b.ratings - a.ratings));
  const maxCustomers = Math.max(1, ...products.map((p) => p.customers));

  return (
    <div className="pb-6">
      <PageHeader title="Ratings" sub="What customers say after delivery: the app, the riders and each product." />
      <div className="px-4 pt-3 md:px-6">
        <ErrorBox error={q.error} />
      </div>
      <div className="grid gap-4 px-4 pt-4 md:px-6 lg:grid-cols-2">
        <Overview title="FreshCut app" sub="Overall experience, rated on every delivered order" avg={d?.app.avg ?? null} count={d?.app.count ?? 0} dist={d?.app.dist ?? [0, 0, 0, 0, 0]} />
        <Overview title="Delivery" sub="How customers rate the rider at the door" avg={d?.rider.avg ?? null} count={d?.rider.count ?? 0} dist={d?.rider.dist ?? [0, 0, 0, 0, 0]} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-4 md:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="card-title">Products</div>
              <div className="card-sub">Ordered by how many customers have bought each one</div>
            </div>
            <Segments
              value={sort}
              onChange={setSort}
              items={[
                { id: "customers", label: "Most bought" },
                { id: "avg", label: "Best rated" },
                { id: "ratings", label: "Most rated" },
              ]}
            />
          </div>
          <div className="mt-2 divide-y divide-line">
            {products.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className="w-5 text-right text-[11px] font-extrabold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`truncate font-bold ${p.active ? "" : "text-muted line-through"}`}>{p.name}</span>
                    {!p.active && <Chip tone="mute">hidden</Chip>}
                  </div>
                  <div className="mt-1 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(p.customers / maxCustomers) * 100}%` }} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                  <div className="whitespace-nowrap text-[11.5px] text-muted">
                    <b className="text-ink">{p.customers}</b> customer{p.customers === 1 ? "" : "s"}
                  </div>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Stars value={p.avg} />
                    <span className="text-[11.5px] font-bold tabular-nums">{p.avg == null ? "—" : p.avg.toFixed(1)}</span>
                    <span className="text-[11px] text-muted">({p.ratings})</span>
                  </div>
                </div>
              </div>
            ))}
            {d && !products.length && <Empty>No products yet.</Empty>}
          </div>
        </section>

        <div className="space-y-4">
          <section className="card">
            <div className="card-title">Riders</div>
            <div className="card-sub">Average stars at the door</div>
            <div className="mt-2 divide-y divide-line">
              {(d?.riders ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                  <Stars value={r.avg} />
                  <span className="w-8 text-right font-bold tabular-nums">{r.avg == null ? "—" : r.avg.toFixed(1)}</span>
                  <span className="w-8 text-right text-[11px] text-muted">({r.ratings})</span>
                </div>
              ))}
              {d && !d.riders.length && <Empty>No riders yet.</Empty>}
            </div>
          </section>

          <section className="card">
            <div className="card-title">What customers wrote</div>
            <div className="card-sub">Latest notes, newest first</div>
            <div className="mt-2 divide-y divide-line">
              {(d?.recent ?? []).map((n, i) => (
                <div key={i} className="py-2.5 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={KIND[n.kind].tone}>{KIND[n.kind].label}</Chip>
                    <Stars value={n.stars} size={12} />
                    <span className="truncate text-[11.5px] text-muted">
                      {n.who ?? "Customer"}
                      {n.order ? ` · ${n.order}` : ""} · {ago(n.at)}
                    </span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{n.note}</div>
                </div>
              ))}
              {d && !d.recent.length && <Empty>No written feedback yet.</Empty>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
