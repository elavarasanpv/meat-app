import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { imageUrl } from "../ui/ImageField";
import { Btn, Chip, Empty, ErrorBox, Modal, inputCls, inr } from "../ui/kit";
import { ProductEditor, type Master } from "./Catalog";

type Listing = {
  master_product_id: string;
  shop_price: number;
  selling_price: number;
  mrp: number | null;
  price_mode: "same" | "custom";
  selling_set_by: "store" | "admin";
  out_of_stock_until: string | null;
  is_active: boolean;
  platform_margin: number;
  product: Master & { owner_dealer_id: string | null };
};

const inStock = (l: Listing) => !l.out_of_stock_until || new Date(l.out_of_stock_until).getTime() <= Date.now();
const money = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Everything one grocery shop sells: what the shop gets, what the customer pays, our margin. */
export function ShopProducts({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ["admin", "shop-products", id];
  const list = useQuery<Listing[]>({ queryKey: key, queryFn: () => api(`/admin/catalog/stores/${id}/products`) });
  const [editing, setEditing] = useState<string | null>(null);
  const [details, setDetails] = useState<Master | null>(null);
  const patch = useMutation({
    mutationFn: ({ masterId, body }: { masterId: string; body: Record<string, unknown> }) => api(`/admin/catalog/stores/${id}/products/${masterId}`, { method: "PATCH", body }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["catalog", "master"] });
    },
  });
  const rows = list.data ?? [];
  const live = rows.filter((l) => l.is_active);
  const removed = rows.filter((l) => !l.is_active);

  return (
    <Modal wide title={`${name}: products`} sub="Shop price is what the shop gets. Customer price is what the app shows. The difference is your margin." onClose={onClose}>
      <div className="space-y-3 p-4 md:p-5">
        <ErrorBox error={list.error ?? patch.error} />
        {list.isLoading && <Empty>Loading…</Empty>}
        {list.data && !rows.length && <Empty>This shop sells nothing yet. Use Sell in shop on the Catalog page.</Empty>}
        {live.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">MRP</th>
                  <th className="px-3 py-2 text-right">Shop price</th>
                  <th className="px-3 py-2 text-right">Customer price</th>
                  <th className="px-3 py-2 text-right">Margin</th>
                  <th className="px-3 py-2">Stock</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {live.map((l) =>
                  editing === l.master_product_id ? (
                    <EditRow key={l.master_product_id} l={l} busy={patch.isPending} onCancel={() => setEditing(null)} onSave={(body) => patch.mutate({ masterId: l.master_product_id, body })} />
                  ) : (
                    <tr key={l.master_product_id}>
                      <td className="px-3 py-2"><Product l={l} /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted">{l.mrp != null ? money(l.mrp) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(l.shop_price)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-extrabold tabular-nums">{money(l.selling_price)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${l.platform_margin > 0 ? "font-bold text-ok" : "text-muted"}`}>{money(l.platform_margin)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <button
                          className="text-left"
                          title={inStock(l) ? "Mark out of stock" : "Mark in stock"}
                          onClick={() => patch.mutate({ masterId: l.master_product_id, body: { outOfStockUntil: inStock(l) ? "infinity" : null } })}
                        >
                          {inStock(l) ? <Chip tone="ok">In stock</Chip> : <Chip tone="bad">Out of stock</Chip>}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Btn onClick={() => setEditing(l.master_product_id)}>Prices</Btn>
                        <Btn onClick={() => setDetails(l.product)}>Details</Btn>
                        <Btn kind="ghost" busy={patch.isPending} onClick={() => patch.mutate({ masterId: l.master_product_id, body: { isActive: false } })}>
                          Hide
                        </Btn>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        {live.length > 0 && (
          <div className="text-[11.5px] text-muted">
            {live.length} products · tap the stock chip to switch it · margin = customer price − shop price, per item
          </div>
        )}
        {removed.length > 0 && (
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 text-[12px] font-extrabold">Hidden ({removed.length})</div>
            <div className="divide-y divide-line">
              {removed.map((l) => (
                <div key={l.master_product_id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1 opacity-60"><Product l={l} /></div>
                  <Btn onClick={() => setDetails(l.product)}>Details</Btn>
                  <Btn busy={patch.isPending} onClick={() => patch.mutate({ masterId: l.master_product_id, body: { isActive: true } })}>
                    Show again
                  </Btn>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {details && (
        <ProductEditor
          initial={details}
          onClose={() => setDetails(null)}
          onChanged={() => {
            void qc.invalidateQueries({ queryKey: key });
            void qc.invalidateQueries({ queryKey: ["catalog", "master"] });
          }}
        />
      )}
    </Modal>
  );
}

function Product({ l }: { l: Listing }) {
  const img = imageUrl(l.product.image_path, true);
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
        {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <span className="text-[11px] font-bold text-muted">{l.product.name.charAt(0)}</span>}
      </div>
      <div className="min-w-0">
        <div className="font-bold">
          {l.product.name}
          {l.product.scope === "store" ? <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">Shop's own</span> : null}
        </div>
        <div className="text-[11px] text-muted">{[l.product.brand, l.product.pack_size, l.product.unit === "kg" ? "per kg" : null].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
  );
}

function EditRow({ l, busy, onCancel, onSave }: { l: Listing; busy: boolean; onCancel: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [shopPrice, setShopPrice] = useState(String(l.shop_price));
  const [sellPrice, setSellPrice] = useState(String(l.selling_price));
  const shop = Number(shopPrice);
  const sell = sellPrice === "" ? shop : Number(sellPrice);
  const problem =
    !(shop > 0) ? "Enter the shop price."
    : l.mrp != null && shop > l.mrp ? `Shop price can't be above MRP ${inr(l.mrp)}.`
    : !(sell > 0) ? "Enter the customer price."
    : sell < shop ? "Customer price can't be below the shop price."
    : l.mrp != null && sell > l.mrp ? `Customer price can't be above MRP ${inr(l.mrp)}.`
    : null;
  const clean = (v: string) => v.replace(/[^\d.]/g, "");
  return (
    <tr className="bg-tint/40">
      <td className="px-3 py-2"><Product l={l} /></td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted">{l.mrp != null ? money(l.mrp) : "—"}</td>
      <td className="px-3 py-2"><input className={`${inputCls} w-24 text-right`} inputMode="decimal" value={shopPrice} onChange={(e) => setShopPrice(clean(e.target.value))} aria-label="Shop price" /></td>
      <td className="px-3 py-2"><input className={`${inputCls} w-24 text-right`} inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(clean(e.target.value))} placeholder="Same" aria-label="Customer price" /></td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted">{problem ? "—" : money(Math.round((sell - shop) * 100) / 100)}</td>
      <td className="px-3 py-2 text-[11px] font-bold text-bad">{problem}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn kind="primary" busy={busy} disabled={!!problem} onClick={() => onSave(sell === shop ? { shopPrice: shop, priceMode: "same" } : { shopPrice: shop, sellingPrice: sell, priceMode: "custom" })}>
          Save
        </Btn>
      </td>
    </tr>
  );
}
