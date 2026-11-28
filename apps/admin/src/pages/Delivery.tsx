import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconPlus } from "../ui/icons";
import { Btn, Chip, Empty, ErrorBox, Field, Modal, Segments, ago, inputCls, inr } from "../ui/kit";

/**
 * Delivery & minimum order. One default rule per vertical (all pincodes),
 * optional pincode rules that win over the default, and a first-order-free
 * switch. The server works out every fee from these; an order keeps the fee
 * it was placed with.
 */

type Rule = { id: string; verticalType: string; pincode: string | null; minOrder: number; fee: number; freeAbove: number | null; isActive: boolean; updatedAt: string | null };
type ChargeMode = "none" | "percent" | "flat";
type ShopCharge = { id: string; name: string; mode: ChargeMode | null; value: number | null };
type VerticalTerms = { type: string; label: string; isLive: boolean; firstOrderFree: boolean; defaultRule: Rule | null; pincodeRules: Rule[]; appCharge: { mode: ChargeMode; value: number }; shops: ShopCharge[] };
type TestResult = {
  rule: "none" | "default" | "pincode";
  rulePincode: string | null;
  minOrder: number;
  fee: number;
  freeAbove: number | null;
  belowMin: boolean;
  shortBy: number;
  charge: number;
  reason: "fee" | "free_above" | "first_order" | "no_fee";
  toPay: number;
};
type Draft = { id?: string; pincode: string; minOrder: string; fee: string; freeAbove: string; isActive: boolean };

const KEY = ["admin", "delivery"];
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
const terms = (r: Rule) =>
  `${r.minOrder > 0 ? `minimum order ${inr(r.minOrder)}` : "no minimum order"} · ${r.fee > 0 ? `fee ${inr(r.fee)}` : "no delivery fee"}${r.fee > 0 ? ` · ${r.freeAbove != null ? `free above ${inr(r.freeAbove)}` : "never free"}` : ""}`;

export function DeliveryPage() {
  const q = useQuery({ queryKey: KEY, queryFn: () => api<VerticalTerms[]>("/admin/delivery") });
  const [tab, setTab] = useState("meat");
  const list = q.data ?? [];
  const v = list.find((x) => x.type === tab) ?? list[0];
  return (
    <div className="pb-6">
      <PageHeader title="Delivery & charges" sub="What customers pay for delivery, the smallest order they can place, and what grocery shops give the app per order. Orders already placed keep their fee." />
      <div className="space-y-4 px-4 pt-4 md:px-6">
        <ErrorBox error={q.error} />
        {list.length > 1 && <div className="flex"><Segments value={v?.type ?? tab} onChange={setTab} items={list.map((x) => ({ id: x.type, label: x.label }))} /></div>}
        {v ? <VerticalPanel key={v.type} v={v} /> : !q.error && <Empty>Loading…</Empty>}
      </div>
    </div>
  );
}

function VerticalPanel({ v }: { v: VerticalTerms }) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const [editing, setEditing] = useState<Draft | null>(null);
  const firstFree = useMutation({
    mutationFn: (on: boolean) => api("/admin/delivery/first-order", { method: "PATCH", body: { verticalType: v.type, on } }),
    onSuccess: refresh,
  });
  const pause = useMutation({
    mutationFn: (r: Rule) => api(`/admin/delivery/rules/${r.id}`, { method: "PATCH", body: { verticalType: r.verticalType, pincode: r.pincode, minOrder: r.minOrder, fee: r.fee, freeAbove: r.freeAbove, isActive: !r.isActive } }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/admin/delivery/rules/${id}`, { method: "DELETE" }), onSuccess: refresh });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <DefaultRule v={v} onSaved={refresh} />

        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="card-title">Pincode rules</div>
              <div className="card-sub">A pincode with its own rule uses it instead of the default.</div>
            </div>
            <Btn
              kind="primary"
              onClick={() =>
                setEditing({ pincode: "", minOrder: String(v.defaultRule?.minOrder ?? 0), fee: String(v.defaultRule?.fee ?? 0), freeAbove: v.defaultRule?.freeAbove != null ? String(v.defaultRule.freeAbove) : "", isActive: true })
              }
            >
              <IconPlus size={14} /> Add pincode
            </Btn>
          </div>
          <ErrorBox error={pause.error ?? remove.error} />
          {v.pincodeRules.length === 0 ? (
            <Empty>No pincode rules. Every pincode uses the default.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {v.pincodeRules.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-[12.5px]">
                  <span className="font-extrabold tabular-nums">{r.pincode}</span>
                  <span className="min-w-0 flex-1 text-muted">{terms(r)}</span>
                  {!r.isActive && <Chip tone="mute">paused</Chip>}
                  <div className="flex gap-1.5">
                    <Btn onClick={() => setEditing({ id: r.id, pincode: r.pincode ?? "", minOrder: String(r.minOrder), fee: String(r.fee), freeAbove: r.freeAbove != null ? String(r.freeAbove) : "", isActive: r.isActive })}>Edit</Btn>
                    <Btn disabled={pause.isPending} onClick={() => pause.mutate(r)}>{r.isActive ? "Pause" : "Resume"}</Btn>
                    <Btn
                      kind="danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove the rule for ${r.pincode}? That pincode goes back to the default.`)) remove.mutate(r.id);
                      }}
                    >
                      Remove
                    </Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {v.type === "grocery" && <AppChargeCard v={v} onSaved={refresh} />}

        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="card-title">Free delivery on the first order</div>
              <div className="card-sub">
                A customer's very first order across the app pays no delivery fee. The minimum order still applies. A cancelled order does not use it up.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone={v.firstOrderFree ? "ok" : "mute"}>{v.firstOrderFree ? "On" : "Off"}</Chip>
              <Btn kind={v.firstOrderFree ? "ghost" : "primary"} busy={firstFree.isPending} onClick={() => firstFree.mutate(!v.firstOrderFree)}>
                {v.firstOrderFree ? "Switch off" : "Switch on"}
              </Btn>
            </div>
          </div>
          <ErrorBox error={firstFree.error} />
        </section>
      </div>

      <TestBox v={v} />

      {editing && <PincodeModal vertical={v.type} draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

/** The three numbers every rule has. */
function RuleFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  const noFee = num(d.fee) === 0;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Minimum order (₹)" hint="0 = any amount can be ordered.">
        <input className={inputCls} type="number" min={0} inputMode="numeric" value={d.minOrder} onChange={(e) => set({ ...d, minOrder: e.target.value })} />
      </Field>
      <Field label="Delivery fee (₹)" hint="0 = delivery is always free.">
        <input className={inputCls} type="number" min={0} inputMode="numeric" value={d.fee} onChange={(e) => set({ ...d, fee: e.target.value })} />
      </Field>
      <Field label="Free delivery above (₹)" hint={noFee ? "Not needed when the fee is 0." : "Leave blank = never free."}>
        <input className={inputCls} type="number" min={0} inputMode="numeric" disabled={noFee} value={noFee ? "" : d.freeAbove} onChange={(e) => set({ ...d, freeAbove: e.target.value })} />
      </Field>
    </div>
  );
}

const body = (vertical: string, d: Draft, pincode: string | null) => ({
  verticalType: vertical,
  pincode,
  minOrder: num(d.minOrder),
  fee: num(d.fee),
  freeAbove: num(d.fee) === 0 || d.freeAbove.trim() === "" ? null : Number(d.freeAbove),
  isActive: d.isActive,
});
const invalid = (d: Draft) => {
  const vals = [num(d.minOrder), num(d.fee), d.freeAbove.trim() === "" ? 0 : Number(d.freeAbove)];
  if (vals.some((n) => !Number.isFinite(n) || n < 0)) return "Amounts must be 0 or more.";
  return null;
};

function DefaultRule({ v, onSaved }: { v: VerticalTerms; onSaved: () => void }) {
  const r = v.defaultRule;
  const from = (): Draft => ({ id: r?.id, pincode: "", minOrder: String(r?.minOrder ?? 0), fee: String(r?.fee ?? 0), freeAbove: r?.freeAbove != null ? String(r.freeAbove) : "", isActive: true });
  const [d, setD] = useState<Draft>(from);
  useEffect(() => setD(from()), [r?.id, r?.minOrder, r?.fee, r?.freeAbove]);
  const save = useMutation({
    mutationFn: () => (r ? api(`/admin/delivery/rules/${r.id}`, { method: "PATCH", body: body(v.type, d, null) }) : api("/admin/delivery/rules", { method: "POST", body: body(v.type, d, null) })),
    onSuccess: onSaved,
  });
  const changed = !r || num(d.minOrder) !== r.minOrder || num(d.fee) !== r.fee || (num(d.fee) === 0 || d.freeAbove.trim() === "" ? null : Number(d.freeAbove)) !== (r.fee === 0 ? null : r.freeAbove);
  const bad = invalid(d);
  return (
    <section className="card">
      <div className="mb-3">
        <div className="card-title">Default rule · all pincodes</div>
        <div className="card-sub">
          {r ? `Now: ${terms(r)}.` : "No rule yet. Customers pay no delivery fee until you save one."}
          {r?.updatedAt ? ` Changed ${ago(r.updatedAt)}.` : ""}
        </div>
      </div>
      <RuleFields d={d} set={setD} />
      <ErrorBox error={bad ? new Error(bad) : save.error} />
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {changed && r && <Btn onClick={() => setD(from())}>Undo</Btn>}
        <Btn kind="primary" busy={save.isPending} disabled={!changed || !!bad} onClick={() => save.mutate()}>
          Save
        </Btn>
      </div>
    </section>
  );
}

function PincodeModal({ vertical, draft, onClose, onSaved }: { vertical: string; draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const save = useMutation({
    mutationFn: () => (d.id ? api(`/admin/delivery/rules/${d.id}`, { method: "PATCH", body: body(vertical, d, d.pincode) }) : api("/admin/delivery/rules", { method: "POST", body: body(vertical, d, d.pincode) })),
    onSuccess: onSaved,
  });
  const pinOk = /^\d{6}$/.test(d.pincode);
  const bad = invalid(d);
  return (
    <Modal pad title={d.id ? `Rule for ${d.pincode}` : "New pincode rule"} sub="Used instead of the default for addresses in this pincode." onClose={onClose}>
      <div className="space-y-3">
        {!d.id && (
          <Field label="Pincode" error={d.pincode && !pinOk ? "A pincode has 6 digits." : null}>
            <input className={inputCls} inputMode="numeric" maxLength={6} placeholder="613001" value={d.pincode} onChange={(e) => setD({ ...d, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
          </Field>
        )}
        <RuleFields d={d} set={setD} />
        <ErrorBox error={bad ? new Error(bad) : save.error} />
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" busy={save.isPending} disabled={!pinOk || !!bad} onClick={() => save.mutate()}>
            Save
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

const REASON: Record<TestResult["reason"], string> = {
  fee: "Delivery fee applies",
  free_above: "Free: order is above the free-delivery amount",
  first_order: "Free: first order",
  no_fee: "Free: this rule has no delivery fee",
};

/** Try a pincode and a cart amount against the saved rules. */
function TestBox({ v }: { v: VerticalTerms }) {
  const [pincode, setPincode] = useState("");
  const [amount, setAmount] = useState("300");
  const [first, setFirst] = useState(false);
  const run = useMutation({
    mutationFn: () => api<TestResult>("/admin/delivery/test", { method: "POST", body: { verticalType: v.type, pincode: /^\d{6}$/.test(pincode) ? pincode : null, amount: num(amount), firstOrder: first } }),
  });
  const t = run.data;
  const pinBad = pincode !== "" && !/^\d{6}$/.test(pincode);
  return (
    <section className="card self-start">
      <div className="card-title">Test a cart</div>
      <div className="card-sub">Uses the saved rules. Nothing is ordered.</div>
      <div className="mt-3 space-y-3">
        <Field label="Pincode" hint="Blank = the default rule." error={pinBad ? "A pincode has 6 digits." : null}>
          <input className={inputCls} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        </Field>
        <Field label="Cart amount (₹)">
          <input className={inputCls} type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-[12.5px] font-bold">
          <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> Customer's first order
        </label>
        <Btn kind="primary" className="w-full" disabled={run.isPending || pinBad || !(num(amount) >= 0)} onClick={() => run.mutate()}>
          {run.isPending ? "Checking…" : "Check"}
        </Btn>
        <ErrorBox error={run.error} />
        {t && (
          <div className="divide-y divide-line rounded-xl border border-line text-[12.5px]">
            <Row label="Rule used" value={t.rule === "pincode" ? `Pincode ${t.rulePincode}` : t.rule === "default" ? "Default" : "No rule"} />
            {t.belowMin ? (
              <div className="px-3 py-2.5 font-bold text-bad">Order refused. Minimum order is {inr(t.minOrder)}; add {inr(t.shortBy)} more.</div>
            ) : (
              <>
                <Row label="Delivery fee" value={t.charge > 0 ? inr(t.charge) : "Free"} />
                <div className="px-3 py-2 text-[11.5px] text-muted">{REASON[t.reason]}</div>
                <Row label="Customer pays" value={inr(t.toPay)} strong />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <span className="text-muted">{label}</span>
      <span className={`text-right ${strong ? "font-extrabold" : "font-bold"}`}>{value}</span>
    </div>
  );
}

const chargeText = (mode: ChargeMode, value: number) => (mode === "percent" ? `${value}% of the items` : mode === "flat" ? `${inr(value)} per order` : "no charge");
const SAMPLE = 300;
const sampleCharge = (mode: ChargeMode, value: number) => Math.round(mode === "percent" ? (SAMPLE * value) / 100 : mode === "flat" ? value : 0);

/** Mode switch plus the amount box, shared by the default and each shop. */
function ChargeFields({ mode, value, setMode, setValue }: { mode: ChargeMode; value: string; setMode: (m: ChargeMode) => void; setValue: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Segments<ChargeMode> value={mode} onChange={setMode} items={[{ id: "none", label: "No charge" }, { id: "percent", label: "Percent" }, { id: "flat", label: "₹ per order" }]} />
      {mode !== "none" && (
        <div className="w-36">
          <Field label={mode === "percent" ? "Percent (%)" : "Amount (₹)"}>
            <input className={inputCls} type="number" min={0} max={mode === "percent" ? 100 : undefined} step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}
const chargeBad = (mode: ChargeMode, value: string) => {
  if (mode === "none") return null;
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n) || n < 0) return "Enter the charge (0 or more).";
  if (mode === "percent" && n > 100) return "A percentage can't be more than 100.";
  return null;
};

/**
 * App charge: what a shop gives Thanjoz Mart for each order. It comes off the
 * shop's amount; the customer pays the same. Saved on the order when the shop
 * accepts, so a change here only affects orders accepted after it.
 */
function AppChargeCard({ v, onSaved }: { v: VerticalTerms; onSaved: () => void }) {
  const cur = v.appCharge;
  const [mode, setMode] = useState<ChargeMode>(cur.mode);
  const [value, setValue] = useState(cur.mode === "none" ? "" : String(cur.value));
  useEffect(() => {
    setMode(cur.mode);
    setValue(cur.mode === "none" ? "" : String(cur.value));
  }, [cur.mode, cur.value]);
  const save = useMutation({
    mutationFn: () => api("/admin/delivery/app-charge", { method: "PATCH", body: { verticalType: v.type, mode, value: mode === "none" ? 0 : Number(value) } }),
    onSuccess: onSaved,
  });
  const bad = chargeBad(mode, value);
  const changed = mode !== cur.mode || (mode !== "none" && Number(value) !== cur.value);
  const own = v.shops.filter((s) => s.mode != null).length;
  return (
    <section className="card">
      <div className="mb-3">
        <div className="card-title">App charge · paid by the shop</div>
        <div className="card-sub">
          What each shop gives Thanjoz Mart per order. It is taken off the shop's amount; the customer pays the same. A percentage is of the items at the customer price
          (delivery not included). An order keeps the charge it was accepted with. Now: {chargeText(cur.mode, cur.value)}.
        </div>
      </div>
      <ChargeFields mode={mode} value={value} setMode={setMode} setValue={setValue} />
      {!bad && mode !== "none" && (
        <div className="mt-2 text-[12px] text-muted">
          Example: on a {inr(SAMPLE)} order the shop gives {inr(sampleCharge(mode, Number(value)))}.
        </div>
      )}
      <ErrorBox error={bad && changed ? new Error(bad) : save.error} />
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {changed && <Btn onClick={() => { setMode(cur.mode); setValue(cur.mode === "none" ? "" : String(cur.value)); }}>Undo</Btn>}
        <Btn kind="primary" busy={save.isPending} disabled={!changed || !!bad} onClick={() => save.mutate()}>
          Save
        </Btn>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="card-title text-[13px]">Shops</div>
        <div className="card-sub">A shop with its own charge uses it instead of the default.{own ? ` ${own} shop${own > 1 ? "s have" : " has"} its own.` : ""}</div>
        {v.shops.length === 0 ? (
          <Empty>No {v.label.toLowerCase()} shops yet.</Empty>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {v.shops.map((s) => (
              <ShopChargeRow key={s.id} shop={s} fallback={cur} onSaved={onSaved} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ShopChargeRow({ shop, fallback, onSaved }: { shop: ShopCharge; fallback: { mode: ChargeMode; value: number }; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [useDefault, setUseDefault] = useState(shop.mode == null);
  const [mode, setMode] = useState<ChargeMode>(shop.mode ?? fallback.mode);
  const [value, setValue] = useState(String(shop.value ?? (fallback.mode === "none" ? "" : fallback.value)));
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/delivery/app-charge/shops/${shop.id}`, {
        method: "PATCH",
        body: useDefault ? { mode: null, value: null } : { mode, value: mode === "none" ? 0 : Number(value) },
      }),
    onSuccess: () => {
      setOpen(false);
      onSaved();
    },
  });
  const bad = useDefault ? null : chargeBad(mode, value);
  return (
    <li className="py-2.5 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 font-extrabold">{shop.name}</span>
        {shop.mode == null ? <Chip tone="mute">default · {chargeText(fallback.mode, fallback.value)}</Chip> : <Chip tone="ok">own · {chargeText(shop.mode, shop.value ?? 0)}</Chip>}
        <Btn onClick={() => setOpen(!open)}>{open ? "Close" : "Change"}</Btn>
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-surface p-3">
          <Segments<"default" | "own"> value={useDefault ? "default" : "own"} onChange={(x) => setUseDefault(x === "default")} items={[{ id: "default", label: "Use the default" }, { id: "own", label: "Own charge" }]} />
          {!useDefault && <ChargeFields mode={mode} value={value} setMode={setMode} setValue={setValue} />}
          <ErrorBox error={bad ? new Error(bad) : save.error} />
          <div className="flex justify-end">
            <Btn kind="primary" busy={save.isPending} disabled={!!bad} onClick={() => save.mutate()}>
              Save
            </Btn>
          </div>
        </div>
      )}
    </li>
  );
}
