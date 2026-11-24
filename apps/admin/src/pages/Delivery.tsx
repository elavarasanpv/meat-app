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
type VerticalTerms = { type: string; label: string; isLive: boolean; firstOrderFree: boolean; defaultRule: Rule | null; pincodeRules: Rule[] };
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
      <PageHeader title="Delivery & minimum order" sub="What customers pay for delivery and the smallest order they can place. Orders already placed keep their fee." />
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
