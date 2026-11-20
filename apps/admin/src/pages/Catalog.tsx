import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, upload } from "../lib/api";
import { ImageField, imageUrl } from "../ui/ImageField";
import { supabase } from "../lib/supabase";
import { PageHeader } from "../shell/Shell";
import { IconAlert, IconCheck, IconPlus, IconX } from "../ui/icons";
import { Btn, Chip, Empty, ErrorBox, Field, Modal, Segments, ago, inputCls, inr } from "../ui/kit";

/**
 * Catalog (grocery vertical, G1). Five tabs:
 *   Categories · Master (approved) · Pending (approval queue) · Imports · Fees
 * plus the vertical switch. Everything here is admin-only and invisible to
 * shoppers until the grocery vertical is switched on.
 */

const VERTICAL = "grocery";
const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

type Vertical = { type: string; label: string; label_ta: string | null; sort: number; is_active: boolean };
type Category = { id: string; vertical_type: string; parent_id: string | null; name: string; name_ta: string | null; image_path: string | null; sort: number; is_active: boolean };
type Master = {
  id: string;
  category_id: string | null;
  barcode: string | null;
  name: string;
  name_ta: string | null;
  brand: string | null;
  pack_size: string | null;
  unit: "piece" | "pack" | "kg";
  mrp: number | null;
  image_path: string | null;
  description: string | null;
  description_ta: string | null;
  scope: "shared" | "store";
  status: "pending" | "approved" | "rejected";
  owner_shop: string | null;
  listed_by: number;
  created_at: string;
};
type Import = { id: string; shop: string | null; dealer_id: string; source: string; status: string; total_rows: number; matched: number; needs_review: number; new_items: number; created_at: string };
type ImportRow = {
  id: number;
  row_no: number;
  barcode: string | null;
  name: string | null;
  mrp: number | null;
  rate: number | null;
  unit: string | null;
  match_status: "matched" | "review" | "new" | "rejected" | "applied";
  issue: string | null;
  matched: { id: string; name: string; pack_size: string | null; mrp: number | null } | null;
  suggestion: { id: string; name: string; pack_size: string | null; mrp: number | null } | null;
};
type FeeRule = { id: string; vertical_type: string; zone_id: string | null; zone: string | null; min_order: number; fee: number; free_above: number | null; is_active: boolean };

const TABS = [
  { id: "categories", label: "Categories" },
  { id: "master", label: "Master" },
  { id: "pending", label: "Pending" },
  { id: "imports", label: "Imports" },
  { id: "fees", label: "Delivery fees" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Multipart upload with the admin's token (the JSON `api` helper can't carry a file). */

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "pending") as Tab;
  const go = (t: Tab) => setParams({ tab: t }, { replace: true });
  const qc = useQueryClient();
  const verticals = useQuery({ queryKey: ["catalog", "verticals"], queryFn: () => api<Vertical[]>("/admin/catalog/verticals") });
  const grocery = verticals.data?.find((v) => v.type === VERTICAL);
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => api(`/admin/catalog/verticals/${VERTICAL}`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["catalog", "verticals"] }),
  });
  const [confirmLive, setConfirmLive] = useState(false);

  return (
    <div className="pb-6">
      <PageHeader title="Catalog" sub="Grocery products, the approval queue, shop imports and delivery fees." />
      <div className="px-4 pt-4 md:px-6">
        {grocery && (
          <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${grocery.is_active ? "border-ok/40 bg-ok/5" : "border-line bg-surface"}`}>
            <div>
              <div className="text-[13px] font-extrabold">
                Grocery is {grocery.is_active ? <span className="text-ok">live</span> : <span className="text-muted">switched off</span>}
              </div>
              <div className="text-[11.5px] text-muted">
                {grocery.is_active ? "Customers can see grocery shops and products." : "Nothing here is visible to customers. Shops can still be onboarded."}
              </div>
            </div>
            {grocery.is_active ? (
              <Btn kind="ghost" busy={toggle.isPending} onClick={() => toggle.mutate(false)}>
                Switch off
              </Btn>
            ) : (
              <Btn kind="primary" busy={toggle.isPending} onClick={() => setConfirmLive(true)}>
                Switch grocery on
              </Btn>
            )}
          </div>
        )}
        <Segments value={tab} onChange={go} items={TABS.map((t) => ({ id: t.id, label: t.label }))} />
      </div>
      <div className="px-4 pt-4 md:px-6">
        {tab === "categories" && <CategoriesTab />}
        {tab === "master" && <MasterTab status="approved" />}
        {tab === "pending" && <MasterTab status="pending" />}
        {tab === "imports" && <ImportsTab />}
        {tab === "fees" && <FeesTab />}
      </div>
      {confirmLive && (
        <Modal pad title="Switch grocery on for customers?" sub="Every active grocery shop and approved product becomes visible in the customer app immediately." onClose={() => setConfirmLive(false)}>
          <div className="flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => setConfirmLive(false)}>
              Not yet
            </Btn>
            <Btn
              kind="primary"
              busy={toggle.isPending}
              onClick={() => toggle.mutate(true, { onSuccess: () => setConfirmLive(false) })}
            >
              Switch on
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ───────────────────────────── categories ─────────────────────────────
function CategoriesTab() {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["catalog", "categories"], queryFn: () => api<Category[]>(`/admin/catalog/categories?vertical=${VERTICAL}`) });
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const save = useMutation({
    mutationFn: (c: Partial<Category>) =>
      c.id
        ? api(`/admin/catalog/categories/${c.id}`, { method: "PATCH", body: { name: c.name, nameTa: c.name_ta ?? null, parentId: c.parent_id ?? null, sort: c.sort ?? 0, isActive: c.is_active ?? true } })
        : api("/admin/catalog/categories", { method: "POST", body: { verticalType: VERTICAL, name: c.name, nameTa: c.name_ta ?? null, parentId: c.parent_id ?? null, sort: c.sort ?? 0 } }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["catalog", "categories"] });
    },
  });
  const tops = (cats.data ?? []).filter((c) => !c.parent_id);
  const kids = (p: string) => (cats.data ?? []).filter((c) => c.parent_id === p);
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="card-title">Categories</div>
          <div className="card-sub">Two levels: Staples → Rice, Dal. Shops pick from these; they can't add their own.</div>
        </div>
        <Btn kind="primary" onClick={() => setEditing({ sort: tops.length + 1, is_active: true })}>
          <IconPlus size={14} /> Add category
        </Btn>
      </div>
      {cats.data && cats.data.length === 0 && <Empty>No grocery categories yet. Start with Staples, Snacks, Dairy, Household.</Empty>}
      <ul className="divide-y divide-line">
        {tops.map((c) => (
          <li key={c.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className={`text-[13px] font-extrabold ${c.is_active ? "" : "text-muted line-through"}`}>{c.name}</span>
              {c.name_ta && <span className="text-[12px] text-muted">{c.name_ta}</span>}
              <span className="ml-auto flex gap-1">
                <Btn kind="ghost" onClick={() => setEditing({ parent_id: c.id, sort: kids(c.id).length + 1, is_active: true })}>
                  + sub
                </Btn>
                <Btn kind="ghost" onClick={() => setEditing(c)}>
                  Edit
                </Btn>
              </span>
            </div>
            {kids(c.id).length > 0 && (
              <ul className="ml-4 mt-1 flex flex-wrap gap-1.5">
                {kids(c.id).map((k) => (
                  <li key={k.id}>
                    <button onClick={() => setEditing(k)} className={`rounded-lg border border-line px-2 py-0.5 text-[12px] ${k.is_active ? "" : "text-muted line-through"}`}>
                      {k.name}
                      {k.name_ta ? ` · ${k.name_ta}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <Modal pad title={editing.id ? "Edit category" : editing.parent_id ? "New sub-category" : "New category"} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            {editing.id ? (
              <ImageField path={editing.image_path} endpoint={`/admin/catalog/categories/${editing.id}/image`} onChange={(p) => { setEditing({ ...editing, image_path: p }); void qc.invalidateQueries({ queryKey: ["catalog", "categories"] }); }} label="Tile photo" />
            ) : (
              <div className="text-[11.5px] text-muted">Save the category first, then add its tile photo.</div>
            )}
            <Field label="Name (English)">
              <input className={inputCls} value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Staples" />
            </Field>
            <Field label="Name (Tamil)" hint="Shown when the customer's language is Tamil.">
              <input className={inputCls} value={editing.name_ta ?? ""} onChange={(e) => setEditing({ ...editing, name_ta: e.target.value })} placeholder="மளிகை" />
            </Field>
            {editing.parent_id && (
              <Field label="Group" hint="The heading this tile sits under on the customer's home.">
                <select className={inputCls} value={editing.parent_id} onChange={(e) => setEditing({ ...editing, parent_id: e.target.value })}>
                  {tops.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort">
                <input className={inputCls} type="number" value={editing.sort ?? 0} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) })} />
              </Field>
              {editing.id && (
                <Field label="Active">
                  <select className={inputCls} value={editing.is_active ? "1" : "0"} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "1" })}>
                    <option value="1">Active</option>
                    <option value="0">Hidden</option>
                  </select>
                </Field>
              )}
            </div>
            <ErrorBox error={save.error} />
            <div className="flex justify-end gap-2">
              <Btn kind="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Btn>
              <Btn kind="primary" busy={save.isPending} disabled={!editing.name?.trim()} onClick={() => save.mutate(editing)}>
                Save
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ───────────────────────────── master + pending ───────────────────────
function MasterTab({ status }: { status: "approved" | "pending" }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Partial<Master> | null>(null);
  const [merging, setMerging] = useState<Master | null>(null);
  const cats = useQuery({ queryKey: ["catalog", "categories"], queryFn: () => api<Category[]>(`/admin/catalog/categories?vertical=${VERTICAL}`) });
  const list = useQuery({
    queryKey: ["catalog", "master", status, q],
    queryFn: () => api<{ total: number; items: Master[] }>(`/admin/catalog/master?vertical=${VERTICAL}&status=${status}&q=${encodeURIComponent(q)}&limit=100`),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["catalog", "master"] });
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "keep_own" | "reject" }) => api(`/admin/catalog/master/${id}/review`, { method: "POST", body: { action } }),
    onSuccess: refresh,
  });
  const bulk = useMutation({
    mutationFn: (action: "approve" | "reject") => api("/admin/catalog/master/bulk-review", { method: "POST", body: { ids: [...selected], action } }),
    onSuccess: () => {
      setSelected(new Set());
      refresh();
    },
  });
  const save = useMutation({
    mutationFn: (m: Partial<Master>) => {
      const body = { name: m.name, nameTa: m.name_ta ?? null, brand: m.brand ?? null, packSize: m.pack_size ?? null, unit: m.unit ?? "piece", mrp: m.mrp ?? null, description: m.description ?? null, descriptionTa: m.description_ta ?? null, barcode: m.barcode || null, categoryId: m.category_id ?? null };
      return m.id ? api(`/admin/catalog/master/${m.id}`, { method: "PATCH", body }) : api("/admin/catalog/master", { method: "POST", body: { ...body, verticalType: VERTICAL } });
    },
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const merge = useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string }) => api(`/admin/catalog/master/${id}/merge`, { method: "POST", body: { targetId } }),
    onSuccess: () => {
      setMerging(null);
      refresh();
    },
  });
  const catName = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name])), [cats.data]);
  const items = list.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((m) => selected.has(m.id));

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0 flex-1 basis-72">
          <div className="card-title">{status === "pending" ? "Pending approval" : "Master catalog"}</div>
          <div className="card-sub">
            {status === "pending" ? "Items shops added that aren't in the shared master yet. They're already sellable in the shop that added them." : "Approved shared products every grocery shop can list."}
            {list.data ? ` · ${list.data.total}` : ""}
          </div>
        </div>
        <input className={`${inputCls} !w-60`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or barcode" />
        {status === "pending" && selected.size > 0 && (
          <>
            <Btn kind="primary" busy={bulk.isPending} onClick={() => bulk.mutate("approve")}>
              Approve {selected.size}
            </Btn>
            <Btn kind="ghost" busy={bulk.isPending} onClick={() => bulk.mutate("reject")}>
              Reject {selected.size}
            </Btn>
          </>
        )}
        {status === "approved" && (
          <Btn kind="primary" onClick={() => setEditing({ unit: "pack" })}>
            <IconPlus size={14} /> Add product
          </Btn>
        )}
      </div>
      <ErrorBox error={review.error ?? bulk.error ?? merge.error} />
      {items.length === 0 ? (
        <Empty>{status === "pending" ? "Nothing waiting. Shop imports and custom items land here." : "No products yet — add one or import a shop's billing export."}</Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-surface-2/60 text-left text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
                {status === "pending" && (
                  <th className="w-px py-2 pl-4 pr-1 md:pl-5">
                    <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((m) => m.id)) : new Set())} />
                  </th>
                )}
                <th className="px-4 py-2 md:px-5">Product</th>
                <th className="w-px whitespace-nowrap px-3 py-2">Category</th>
                <th className="w-px whitespace-nowrap px-3 py-2">Barcode</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-right">MRP</th>
                <th className="w-px whitespace-nowrap px-3 py-2 text-right">Shops</th>
                <th className="w-px whitespace-nowrap px-3 py-2">{status === "pending" ? "From" : ""}</th>
                <th className="w-px py-2 pl-3 pr-4 md:pr-5" />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t border-line hover:bg-surface-2/40">
                  {status === "pending" && (
                    <td className="w-px py-2 pl-4 pr-1 md:pl-5">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5 md:px-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 text-[9px] font-bold text-muted">
                        {imageUrl(m.image_path, true) ? <img src={imageUrl(m.image_path, true)!} alt="" className="h-full w-full object-contain" /> : "no photo"}
                      </div>
                      <div>
                    <div className="font-bold">{m.name}</div>
                    <div className="text-[11px] text-muted">
                      {[m.brand, m.pack_size, m.unit === "kg" ? "per kg" : null, m.name_ta].filter(Boolean).join(" · ")}
                    </div>
                      </div>
                    </div>
                  </td>
                  <td className="w-px whitespace-nowrap px-3 py-2.5 text-muted">{m.category_id ? catName.get(m.category_id) ?? "—" : <span className="text-warn">none</span>}</td>
                  <td className="w-px whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-muted">{m.barcode ?? "—"}</td>
                  <td className="w-px whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{m.mrp != null ? inr(m.mrp) : "—"}</td>
                  <td className="w-px whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted">{m.listed_by}</td>
                  <td className="w-px whitespace-nowrap px-3 py-2.5 text-[11px] text-muted">
                    {status === "pending" ? (
                      <>
                        {m.owner_shop ?? "—"} · {ago(m.created_at)}
                      </>
                    ) : m.scope === "store" ? (
                      <Chip tone="info">store-only · {m.owner_shop}</Chip>
                    ) : null}
                  </td>
                  <td className="w-px whitespace-nowrap py-2 pl-3 pr-4 text-right md:pr-5">
                    <Btn kind="ghost" onClick={() => setEditing(m)}>
                      Edit
                    </Btn>
                    {status === "pending" ? (
                      <>
                        <Btn kind="primary" busy={review.isPending} onClick={() => review.mutate({ id: m.id, action: "approve" })}>
                          <IconCheck size={13} /> Approve
                        </Btn>
                        <Btn kind="ghost" busy={review.isPending} onClick={() => review.mutate({ id: m.id, action: "keep_own" })}>
                          Keep store-only
                        </Btn>
                        <Btn kind="ghost" busy={review.isPending} onClick={() => review.mutate({ id: m.id, action: "reject" })}>
                          <IconX size={13} /> Reject
                        </Btn>
                      </>
                    ) : (
                      <Btn kind="ghost" onClick={() => setMerging(m)}>
                        Merge into…
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal pad title={editing.id ? "Edit product" : "New product"} sub="Name and MRP are what customers see; the barcode is what shops scan." onClose={() => setEditing(null)}>
          <div className="space-y-3">
            {editing.id ? (
              <ImageField path={editing.image_path} endpoint={`/admin/catalog/master/${editing.id}/image`} onChange={(p) => { setEditing({ ...editing, image_path: p }); refresh(); }} />
            ) : (
              <div className="text-[11.5px] text-muted">Save the product first, then add its photo.</div>
            )}
            <Field label="Name (English)">
              <input className={inputCls} value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Aachi Chilli Powder" />
            </Field>
            <Field label="Name (Tamil)">
              <input className={inputCls} value={editing.name_ta ?? ""} onChange={(e) => setEditing({ ...editing, name_ta: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand">
                <input className={inputCls} value={editing.brand ?? ""} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} />
              </Field>
              <Field label="Pack size">
                <input className={inputCls} value={editing.pack_size ?? ""} onChange={(e) => setEditing({ ...editing, pack_size: e.target.value })} placeholder="100 g" />
              </Field>
              <Field label="Unit">
                <select className={inputCls} value={editing.unit ?? "pack"} onChange={(e) => setEditing({ ...editing, unit: e.target.value as Master["unit"] })}>
                  <option value="pack">Pack</option>
                  <option value="piece">Piece</option>
                  <option value="kg">Per kg (loose)</option>
                </select>
              </Field>
              <Field label="MRP" hint="Leave blank for loose items.">
                <input className={inputCls} type="number" value={editing.mrp ?? ""} onChange={(e) => setEditing({ ...editing, mrp: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Barcode">
                <input className={inputCls} value={editing.barcode ?? ""} onChange={(e) => setEditing({ ...editing, barcode: e.target.value.replace(/\D/g, "") })} placeholder="8901234567890" />
              </Field>
              <Field label="Category">
                <select className={inputCls} value={editing.category_id ?? ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}>
                  <option value="">—</option>
                  {(cats.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent_id ? `  ↳ ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description" hint="Shown on the product page. Keep it to two or three lines.">
              <textarea className={`${inputCls} h-20 resize-none`} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Old-crop Thanjavur ponni, double boiled. Cooks fluffy." />
            </Field>
            <Field label="Description (Tamil)">
              <textarea className={`${inputCls} h-20 resize-none`} value={editing.description_ta ?? ""} onChange={(e) => setEditing({ ...editing, description_ta: e.target.value })} />
            </Field>
            <ErrorBox error={save.error} />
            <div className="flex justify-end gap-2">
              <Btn kind="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Btn>
              <Btn kind="primary" busy={save.isPending} disabled={!editing.name || editing.name.trim().length < 2} onClick={() => save.mutate(editing)}>
                Save
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {merging && <MergeModal source={merging} onClose={() => setMerging(null)} onMerge={(targetId) => merge.mutate({ id: merging.id, targetId })} busy={merge.isPending} />}
    </section>
  );
}

function MergeModal({ source, onClose, onMerge, busy }: { source: Master; onClose: () => void; onMerge: (targetId: string) => void; busy: boolean }) {
  const [q, setQ] = useState(source.name.split(" ").slice(0, 2).join(" "));
  const list = useQuery({
    queryKey: ["catalog", "master", "merge-search", q],
    queryFn: () => api<{ items: Master[] }>(`/admin/catalog/master?vertical=${VERTICAL}&status=approved&q=${encodeURIComponent(q)}&limit=20`),
  });
  return (
    <Modal pad title={`Merge "${source.name}" into…`} sub="Its shop listings move to the product you pick; this one is retired." onClose={onClose}>
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the master" />
      <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto">
        {(list.data?.items ?? [])
          .filter((m) => m.id !== source.id)
          .map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold">{m.name}</span>
                <span className="text-[11px] text-muted">{[m.pack_size, m.barcode, m.mrp != null ? inr(m.mrp) : null].filter(Boolean).join(" · ")}</span>
              </span>
              <Btn kind="primary" busy={busy} onClick={() => onMerge(m.id)}>
                Merge here
              </Btn>
            </li>
          ))}
      </ul>
    </Modal>
  );
}

// ───────────────────────────── imports ────────────────────────────────
function ImportsTab() {
  const qc = useQueryClient();
  const imports = useQuery({ queryKey: ["catalog", "imports"], queryFn: () => api<Import[]>("/admin/catalog/imports") });
  const shops = useQuery({ queryKey: ["catalog", "grocery-shops"], queryFn: () => api<{ id: string; name: string; storeType: string }[]>("/admin/shops").then((s) => s.filter((x) => x.storeType === "grocery")) });
  const [open, setOpen] = useState<string | null>(null);
  const [dealerId, setDealerId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const start = useMutation({
    mutationFn: () => upload<{ id: string }>(`/admin/catalog/stores/${dealerId}/imports`, file!),
    onSuccess: (r) => {
      setFile(null);
      setOpen(r.id);
      void qc.invalidateQueries({ queryKey: ["catalog", "imports"] });
    },
  });
  const tone = (s: string) => (s === "applied" ? "ok" : s === "review" ? "warn" : s === "failed" ? "bad" : "mute");
  return (
    <section className="card">
      <div className="mb-3">
        <div className="card-title">Billing-software imports</div>
        <div className="card-sub">Upload a shop's item export (CSV from Tally, Marg, Vyapar, GoFrugal, Busy…). Barcodes match automatically; the rest you confirm.</div>
      </div>
      <div className="mb-4 rounded-2xl border border-line bg-surface-2/50 p-3">
        <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
        <Field label="Shop">
          <select className={inputCls} value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
            <option value="">{shops.data && shops.data.length === 0 ? "No grocery shops yet — set a shop's type on the Shops page" : "Pick a shop…"}</option>
            {(shops.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        </div>
        <div className="min-w-0 flex-1 basis-64">
        <Field label="CSV file">
          <label className={`${inputCls} flex cursor-pointer items-center gap-2`}>
            <span className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11.5px] font-bold">Choose file</span>
            <span className={`truncate ${file ? "" : "text-muted/60"}`}>{file ? file.name : "No file chosen"}</span>
            <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        </div>
        <Btn kind="primary" busy={start.isPending} disabled={!dealerId || !file} onClick={() => start.mutate()}>
          Upload & match
        </Btn>
        </div>
        <div className="mt-2 text-[11px] text-muted">Columns we look for: Item name · Barcode · MRP · Rate · Unit</div>
      </div>
      <ErrorBox error={start.error} />
      {imports.data && imports.data.length === 0 && <Empty>No imports yet.</Empty>}
      <ul className="divide-y divide-line">
        {(imports.data ?? []).map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-bold">{i.shop ?? i.dealer_id}</span>
              <span className="text-[11px] text-muted">
                {i.total_rows} rows · {i.matched} matched · {i.needs_review} to confirm · {i.new_items} new · {ago(i.created_at)}
              </span>
            </span>
            <Chip tone={tone(i.status)}>{i.status}</Chip>
            <Btn kind="ghost" onClick={() => setOpen(i.id)}>
              {i.status === "review" ? "Review" : "View"}
            </Btn>
          </li>
        ))}
      </ul>
      {open && <ImportReview id={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ImportReview({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const imp = useQuery({ queryKey: ["catalog", "import", id], queryFn: () => api<Import & { rows: ImportRow[] }>(`/admin/catalog/imports/${id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["catalog", "import", id] });
    void qc.invalidateQueries({ queryKey: ["catalog", "imports"] });
  };
  const decide = useMutation({
    mutationFn: ({ rowId, action }: { rowId: number; action: "confirm" | "new" | "reject" }) => api(`/admin/catalog/imports/${id}/rows/${rowId}`, { method: "POST", body: { action } }),
    onSuccess: refresh,
  });
  const apply = useMutation({
    mutationFn: () => api<{ listed: number; updated: number; created_pending: number }>(`/admin/catalog/imports/${id}/apply`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["catalog", "master"] });
    },
  });
  const [filter, setFilter] = useState<"all" | "review" | "new" | "rejected">("review");
  const rows = (imp.data?.rows ?? []).filter((r) => filter === "all" || r.match_status === filter);
  const toneOf = (s: ImportRow["match_status"]) => (s === "matched" || s === "applied" ? "ok" : s === "review" ? "warn" : s === "rejected" ? "bad" : "info");
  return (
    <Modal
      pad
      title={`Import · ${imp.data?.shop ?? ""}`}
      sub={imp.data ? `${imp.data.matched} matched · ${imp.data.needs_review} to confirm · ${imp.data.new_items} new · status ${imp.data.status}` : "Loading…"}
      onClose={onClose}
      wide
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segments value={filter} onChange={setFilter} items={[{ id: "review", label: "To confirm" }, { id: "new", label: "New" }, { id: "rejected", label: "Rejected" }, { id: "all", label: "All" }]} />
        {imp.data?.status === "review" && (
          <span className="ml-auto flex items-center gap-2">
            {apply.data && (
              <span className="text-[12px] font-bold text-ok">
                Listed {apply.data.listed}, updated {apply.data.updated}, {apply.data.created_pending} new pending
              </span>
            )}
            <Btn kind="primary" busy={apply.isPending} onClick={() => apply.mutate()}>
              Apply matched + new
            </Btn>
          </span>
        )}
      </div>
      <ErrorBox error={decide.error ?? apply.error} />
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-2 pr-2">#</th>
              <th className="pb-2 pr-2 font-bold">From the file</th>
              <th className="pb-2 pr-2 text-right font-bold">Rate</th>
              <th className="pb-2 pr-2 text-right font-bold">MRP</th>
              <th className="pb-2 pr-2 font-bold">We think it is</th>
              <th className="pb-2 font-bold">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-2 text-muted">{r.row_no}</td>
                <td className="py-1.5 pr-2">
                  <div className="font-bold">{r.name ?? <span className="text-bad">(no name)</span>}</div>
                  <div className="text-[11px] text-muted">{[r.barcode, r.unit].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.rate != null ? inr(r.rate) : "—"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.mrp != null ? inr(r.mrp) : "—"}</td>
                <td className="py-1.5 pr-2">
                  {(r.matched ?? r.suggestion) ? (
                    <>
                      <div>{(r.matched ?? r.suggestion)!.name}</div>
                      <div className="text-[11px] text-muted">{[(r.matched ?? r.suggestion)!.pack_size, (r.matched ?? r.suggestion)!.mrp != null ? `MRP ${inr((r.matched ?? r.suggestion)!.mrp!)}` : null].filter(Boolean).join(" · ")}</div>
                    </>
                  ) : (
                    <span className="text-muted">new item</span>
                  )}
                  {r.issue && (
                    <div className="flex items-center gap-1 text-[11px] text-bad">
                      <IconAlert size={12} /> {r.issue}
                    </div>
                  )}
                </td>
                <td className="py-1.5">
                  <Chip tone={toneOf(r.match_status)}>{r.match_status}</Chip>
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {imp.data?.status === "review" && r.match_status === "review" && (
                    <>
                      <Btn kind="primary" busy={decide.isPending} onClick={() => decide.mutate({ rowId: r.id, action: "confirm" })}>
                        Yes
                      </Btn>
                      <Btn kind="ghost" busy={decide.isPending} onClick={() => decide.mutate({ rowId: r.id, action: "new" })}>
                        No, new
                      </Btn>
                      <Btn kind="ghost" busy={decide.isPending} onClick={() => decide.mutate({ rowId: r.id, action: "reject" })}>
                        Skip
                      </Btn>
                    </>
                  )}
                  {imp.data?.status === "review" && r.match_status === "new" && (
                    <Btn kind="ghost" busy={decide.isPending} onClick={() => decide.mutate({ rowId: r.id, action: "reject" })}>
                      Skip
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ───────────────────────────── fees ───────────────────────────────────
function FeesTab() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["catalog", "fees"], queryFn: () => api<FeeRule[]>("/admin/catalog/fee-rules") });
  const [editing, setEditing] = useState<Partial<FeeRule> | null>(null);
  const save = useMutation({
    mutationFn: (r: Partial<FeeRule>) => {
      const body = { verticalType: VERTICAL, zoneId: r.zone_id ?? null, minOrder: r.min_order ?? 0, fee: r.fee ?? 0, freeAbove: r.free_above ?? null, isActive: r.is_active ?? true };
      return r.id ? api(`/admin/catalog/fee-rules/${r.id}`, { method: "PATCH", body }) : api("/admin/catalog/fee-rules", { method: "POST", body });
    },
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["catalog", "fees"] });
    },
  });
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="card-title">Delivery fees — grocery</div>
          <div className="card-sub">The platform's revenue floor. Meat keeps its own rule (free above ₹499, else ₹20).</div>
        </div>
        <Btn kind="primary" onClick={() => setEditing({ min_order: 99, fee: 20, free_above: 499, is_active: true })}>
          <IconPlus size={14} /> Add rule
        </Btn>
      </div>
      <ul className="divide-y divide-line">
        {(rules.data ?? [])
          .filter((r) => r.vertical_type === VERTICAL)
          .map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-[12.5px]">
              <span className="font-bold">{r.zone ?? "All zones"}</span>
              <span className="text-muted">
                min order {inr(r.min_order)} · fee {inr(r.fee)} · {r.free_above != null ? `free above ${inr(r.free_above)}` : "never free"}
              </span>
              {!r.is_active && <Chip tone="mute">off</Chip>}
              <Btn kind="ghost" onClick={() => setEditing(r)}>
                Edit
              </Btn>
            </li>
          ))}
      </ul>
      {editing && (
        <Modal pad title={editing.id ? "Edit fee rule" : "New fee rule"} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum order (₹)">
              <input className={inputCls} type="number" value={editing.min_order ?? 0} onChange={(e) => setEditing({ ...editing, min_order: Number(e.target.value) })} />
            </Field>
            <Field label="Delivery fee (₹)">
              <input className={inputCls} type="number" value={editing.fee ?? 0} onChange={(e) => setEditing({ ...editing, fee: Number(e.target.value) })} />
            </Field>
            <Field label="Free above (₹)" hint="Blank = never free.">
              <input className={inputCls} type="number" value={editing.free_above ?? ""} onChange={(e) => setEditing({ ...editing, free_above: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Active">
              <select className={inputCls} value={editing.is_active === false ? "0" : "1"} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "1" })}>
                <option value="1">On</option>
                <option value="0">Off</option>
              </select>
            </Field>
          </div>
          <ErrorBox error={save.error} />
          <div className="mt-3 flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Btn>
            <Btn kind="primary" busy={save.isPending} onClick={() => save.mutate(editing)}>
              Save
            </Btn>
          </div>
        </Modal>
      )}
    </section>
  );
}
