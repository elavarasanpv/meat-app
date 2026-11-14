import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { Chip, Empty, ErrorBox, Segments, inputCls } from "../ui/kit";

type Pricing = {
  dealers: { id: string; shop_name: string }[];
  pincodes: { pincode: string; area: string | null }[];
  products: { id: string; name: string; nameTa: string | null; unit: "kg" | "piece"; category: string; sellingPrice: number; overrides: Record<string, number>; costs: Record<string, number> }[];
};

/** ₹/kg input that saves when you press Enter or click away (only if changed). */
function PriceCell({ value, placeholder, onSave, saving, label }: { value: number | null; placeholder?: string; onSave: (v: number) => void; saving: boolean; label: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => setText(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (!text.trim() || !Number.isFinite(v) || v <= 0 || v === value) {
      setText(value == null ? "" : String(value));
      return;
    }
    onSave(Math.round(v * 100) / 100);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={`${inputCls} h-8 w-[84px] px-2 text-right font-bold tabular-nums ${saving ? "opacity-50" : ""}`}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      disabled={saving}
    />
  );
}

/** Profit chip: green from 10%, amber from 5%, red below. */
function Profit({ sell, cost }: { sell: number; cost: number | null }) {
  if (cost == null) return <span className="text-[11px] font-bold text-muted">no cost set</span>;
  const p = sell - cost;
  const pct = sell > 0 ? (p / sell) * 100 : 0;
  const tone = p <= 0 ? "bad" : pct < 5 ? "bad" : pct < 10 ? "warn" : "ok";
  return <Chip tone={tone}>₹{Math.round(p)} · {pct.toFixed(1)}%</Chip>;
}

/**
 * Selling price (default or per pincode) and each shop's cost price, with the
 * profit per product worked out live. Every change lands in price_history
 * and the dashboard widget.
 */
export function PricingPage() {
  const qc = useQueryClient();
  const q = useQuery<Pricing>({ queryKey: ["admin", "pricing"], queryFn: () => api("/admin/pricing") });
  const [scope, setScope] = useState<string>("default");
  const d = q.data;
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "pricing"] });
    void qc.invalidateQueries({ queryKey: ["admin", "price-history"] });
  };
  const sell = useMutation({
    mutationFn: (body: { productId: string; pincode: string | null; price: number | null }) => api("/admin/pricing/sell", { method: "POST", body }),
    onSettled: () => {
      setSavingKey(null);
      refresh();
    },
  });
  const shop = useMutation({
    mutationFn: (body: { dealerId: string; productId: string; price: number }) => api("/admin/pricing/shop", { method: "POST", body }),
    onSettled: () => {
      setSavingKey(null);
      refresh();
    },
  });

  const pincode = scope === "default" ? null : scope;
  const scopeItems = [{ id: "default", label: "Default · all pincodes" }, ...(d?.pincodes ?? []).map((p) => ({ id: p.pincode, label: p.area ? `${p.pincode} · ${p.area}` : p.pincode }))];
  let lastCategory = "";

  return (
    <div className="pb-6">
      <PageHeader
        title="Pricing"
        sub="Selling price is what customers pay; shop price is what you owe the shop. Profit is the difference, before delivery costs."
      />
      <div className="px-4 pt-3 md:px-6">
        <ErrorBox error={q.error ?? sell.error ?? shop.error} />
        <Segments value={scope} onChange={setScope} items={scopeItems} />
        {pincode && (
          <div className="mt-2 text-[12px] font-bold text-muted">
            Prices below apply only to {pincode}. Empty boxes use the default; type a price to set an override for this pincode.
          </div>
        )}
      </div>
      <div className="px-4 pt-3 md:px-6">
        <section className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-surface-2/60 text-left text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Product</th>
                <th className="px-3 py-2 text-right">Selling price {pincode ? `· ${pincode}` : "· default"}</th>
                {(d?.dealers ?? []).map((s) => (
                  <th key={s.id} className="px-3 py-2 text-right">{s.shop_name} (cost)</th>
                ))}
                <th className="px-3 py-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {(d?.products ?? []).map((p) => {
                const override = pincode ? p.overrides[pincode] : undefined;
                const effSell = pincode ? override ?? p.sellingPrice : p.sellingPrice;
                const costs = Object.values(p.costs);
                const minCost = costs.length ? Math.min(...costs) : null;
                const head = p.category !== lastCategory;
                lastCategory = p.category;
                return (
                  <>
                    {head && (
                      <tr key={`${p.id}-cat`}>
                        <td colSpan={3 + (d?.dealers.length ?? 0)} className="border-t border-line bg-ground px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-muted">{p.category}</td>
                      </tr>
                    )}
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-4 py-2">
                        <div className="font-bold">{p.name}</div>
                        <div className="text-[11px] text-muted">{p.nameTa ?? ""} · per {p.unit === "kg" ? "kg" : "piece"}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {pincode && override != null && (
                            <button
                              title="Back to the default price"
                              className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-extrabold text-muted hover:text-ink"
                              onClick={() => {
                                setSavingKey(`s-${p.id}`);
                                sell.mutate({ productId: p.id, pincode, price: null });
                              }}
                            >
                              ↺ default
                            </button>
                          )}
                          <PriceCell
                            label={`Selling price for ${p.name}`}
                            value={pincode ? override ?? null : p.sellingPrice}
                            placeholder={pincode ? `₹${p.sellingPrice}` : undefined}
                            saving={savingKey === `s-${p.id}` && (sell.isPending || q.isFetching)}
                            onSave={(v) => {
                              setSavingKey(`s-${p.id}`);
                              sell.mutate({ productId: p.id, pincode, price: v });
                            }}
                          />
                        </div>
                      </td>
                      {(d?.dealers ?? []).map((s) => (
                        <td key={s.id} className="px-3 py-2 text-right">
                          <PriceCell
                            label={`${s.shop_name} cost for ${p.name}`}
                            value={p.costs[s.id] ?? null}
                            placeholder="—"
                            saving={savingKey === `c-${p.id}-${s.id}` && (shop.isPending || q.isFetching)}
                            onSave={(v) => {
                              setSavingKey(`c-${p.id}-${s.id}`);
                              shop.mutate({ dealerId: s.id, productId: p.id, price: v });
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2"><Profit sell={effSell} cost={minCost} /></td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
          {d && !d.products.length && <Empty>No active products.</Empty>}
        </section>
        <div className="mt-2 text-[11px] text-muted">
          New orders use the new price at once; already-placed orders keep the price they were placed at. Profit uses the cheapest shop when several stock a product.
        </div>
      </div>
    </div>
  );
}
