import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { Btn, Chip, Empty, ErrorBox, Segments, inputCls, inr } from "../ui/kit";
import { IconX } from "../ui/icons";

type Money = {
  orders: number;
  itemSales: number;
  deliveryFees: number;
  discountOurs: number;
  discountShops: number;
  paid: number;
  purchaseCost: number;
  freeItemsOurs: number;
  appCharges: number;
  shopPaid: number;
  riderPay: number;
  adjustments: number;
  orderProfit: number;
  freeDeliveries: number;
};
type Pnl = {
  from: string;
  to: string;
  total: Money;
  byVertical: { meat: Money; grocery: Money };
  expenses: { total: number; byCategory: Record<string, number> };
  netProfit: number;
  days: (Money & { date: string; spent: number; net: number })[];
  estimatedCostLines: number;
};
type Expense = { id: string; spentOn: string; category: string; amount: number; note: string | null; by: string | null };

const CATEGORIES: { id: string; label: string }[] = [
  { id: "rider_pay", label: "Rider pay" },
  { id: "marketing", label: "Marketing & ads" },
  { id: "fuel", label: "Fuel & travel" },
  { id: "staff", label: "Staff salary" },
  { id: "packaging", label: "Packaging" },
  { id: "rent", label: "Rent & bills" },
  { id: "tech", label: "Apps & tech" },
  { id: "other", label: "Other" },
];
const catLabel = (id: string) => (id === "support_credit" ? "Support credits to customers" : CATEGORIES.find((c) => c.id === id)?.label ?? id);

/** A date in India as YYYY-MM-DD. */
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nice = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

type Range = "today" | "yesterday" | "7d" | "month" | "lastMonth" | "custom";
function rangeOf(r: Range, custom: { from: string; to: string }) {
  const today = ymd(new Date());
  const monthStart = today.slice(0, 8) + "01";
  if (r === "today") return { from: today, to: today };
  if (r === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (r === "7d") return { from: addDays(today, -6), to: today };
  if (r === "month") return { from: monthStart, to: today };
  if (r === "lastMonth") {
    const end = addDays(monthStart, -1);
    return { from: end.slice(0, 8) + "01", to: end };
  }
  return custom;
}

/** One line of the statement: a label, an explanation, and a signed amount. */
function Row({ label, hint, value, sign, strong, tone }: { label: string; hint?: string; value: number; sign?: "+" | "−" | "="; strong?: boolean; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "";
  return (
    <div className={`flex items-start gap-3 px-4 py-2 ${strong ? "border-t border-line bg-surface-2/50" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className={strong ? "font-extrabold" : "font-bold"}>{label}</div>
        {hint && <div className="text-[11.5px] text-muted">{hint}</div>}
      </div>
      <div className={`whitespace-nowrap text-right tabular-nums ${strong ? "text-[15px] font-extrabold" : "font-bold"} ${color}`}>
        {sign && sign !== "=" ? <span className="mr-1 text-muted">{sign}</span> : null}
        {inr(Math.abs(value))}
      </div>
    </div>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : ""}`}>
        {value < 0 ? "−" : ""}
        {inr(Math.abs(value))}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

/**
 * Profit and loss: what customers paid, what the shops are owed, and what is
 * left after discounts, free items, rider pay and the money spent outside orders.
 */
export function PnlPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("month");
  const [custom, setCustom] = useState(() => ({ from: addDays(ymd(new Date()), -29), to: ymd(new Date()) }));
  const [vertical, setVertical] = useState<"all" | "meat" | "grocery">("all");
  const { from, to } = rangeOf(range, custom);
  const q = useQuery<Pnl>({ queryKey: ["admin", "pnl", from, to], queryFn: () => api(`/admin/pnl?from=${from}&to=${to}`) });
  const ex = useQuery<Expense[]>({ queryKey: ["admin", "expenses", from, to], queryFn: () => api(`/admin/expenses?from=${from}&to=${to}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "pnl"] });
    void qc.invalidateQueries({ queryKey: ["admin", "expenses"] });
  };

  const [draft, setDraft] = useState({ spentOn: ymd(new Date()), category: "rider_pay", amount: "", note: "" });
  const amount = Number(draft.amount);
  const canAdd = !!draft.spentOn && Number.isFinite(amount) && amount > 0;
  const add = useMutation({
    mutationFn: () => api("/admin/expenses", { method: "POST", body: { spentOn: draft.spentOn, category: draft.category, amount: Math.round(amount * 100) / 100, note: draft.note.trim() || null } }),
    onSuccess: () => setDraft((d) => ({ ...d, amount: "", note: "" })),
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/admin/expenses/${id}`, { method: "DELETE" }), onSettled: refresh });

  const d = q.data;
  const m = d ? (vertical === "all" ? d.total : d.byVertical[vertical]) : null;
  const spent = vertical === "all" ? d?.expenses.total ?? 0 : 0;
  const net = m ? m.orderProfit - spent : 0;
  const discount = m ? m.discountOurs + m.discountShops : 0;

  return (
    <div className="pb-6">
      <PageHeader title="Profit & loss" sub="Delivered orders only. Profit uses the shop (purchase) price, never the market price." />
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 md:px-6">
        <Segments
          value={range}
          onChange={setRange}
          items={[
            { id: "today", label: "Today" },
            { id: "yesterday", label: "Yesterday" },
            { id: "7d", label: "Last 7 days" },
            { id: "month", label: "This month" },
            { id: "lastMonth", label: "Last month" },
            { id: "custom", label: "Pick dates" },
          ]}
        />
        {range === "custom" && (
          <span className="flex items-center gap-1.5 text-[12px] font-bold text-muted">
            <input type="date" aria-label="From" className={`${inputCls} w-auto`} value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            to
            <input type="date" aria-label="To" className={`${inputCls} w-auto`} value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </span>
        )}
        <Segments value={vertical} onChange={setVertical} items={[{ id: "all", label: "All" }, { id: "meat", label: "Meat" }, { id: "grocery", label: "Grocery" }]} />
      </div>
      <div className="px-4 pt-1.5 text-[12px] font-bold text-muted md:px-6">
        {from === to ? nice(from) : `${nice(from)} to ${nice(to)}`}
        {vertical !== "all" && " · spending is not split by meat and grocery, so it shows only under All"}
      </div>

      <div className="space-y-4 px-4 pt-3 md:px-6">
        <ErrorBox error={q.error ?? ex.error ?? add.error ?? remove.error} />
        {m && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Card label="Customers paid" value={m.paid} sub={`${m.orders} delivered order${m.orders === 1 ? "" : "s"}`} />
              <Card label="Paid to shops" value={m.shopPaid} />
              <Card label="Order profit" value={m.orderProfit} tone={m.orderProfit >= 0 ? "ok" : "bad"} sub={m.orders ? `${inr(m.orderProfit / m.orders)} per order` : undefined} />
              <Card label="Spending" value={spent} />
              <Card label="Net profit" value={net} tone={net >= 0 ? "ok" : "bad"} />
            </div>

            <section className="card overflow-hidden p-0 text-[13px]">
              <div className="border-b border-line px-4 py-2.5">
                <div className="card-title">Statement</div>
                <div className="card-sub">How the customer's money splits between the shops, the riders and Thanjoz Mart</div>
              </div>
              <Row label="Item sales" hint="Items at our selling price, before any discount" value={m.itemSales} sign="+" />
              <Row label="Discounts on orders" hint={`Offers and coupons the customers used${m.discountShops ? `: ${inr(m.discountOurs)} paid by us, ${inr(m.discountShops)} by shops` : ""}`} value={discount} sign="−" tone={discount ? "bad" : undefined} />
              <Row label="Delivery fees collected" hint={m.freeDeliveries ? `${m.freeDeliveries} order${m.freeDeliveries === 1 ? "" : "s"} had free delivery (first order or above the free limit)` : undefined} value={m.deliveryFees} sign="+" />
              {m.adjustments !== 0 && <Row label="Weighing and rounding" hint="The final bill after weighing, against the lines above" value={m.adjustments} sign={m.adjustments > 0 ? "+" : "−"} />}
              <Row label="Customers paid" value={m.paid} sign="=" strong />

              <Row label="Purchase cost" hint="Items at the shop's price to Thanjoz Mart" value={m.purchaseCost} sign="−" />
              {m.freeItemsOurs !== 0 && <Row label="Free offer items we pay for" hint="Buy-and-get-free and gift items where Thanjoz Mart pays the shop" value={m.freeItemsOurs} sign="−" tone="bad" />}
              <Row label="App charges from shops" hint="Comes off what the shops are paid" value={m.appCharges} sign="+" tone={m.appCharges ? "ok" : undefined} />
              {m.discountShops !== 0 && <Row label="Discounts the shops paid for" hint="Their own next-order coupons: comes off what the shops are paid" value={m.discountShops} sign="+" />}
              <Row label="Paid to shops" value={m.shopPaid} sign="=" strong />

              {m.riderPay !== 0 && <Row label="Rider pay on orders" value={m.riderPay} sign="−" />}
              <Row label="Order profit" hint="Customers paid − paid to shops − rider pay" value={m.orderProfit} sign="=" strong tone={m.orderProfit >= 0 ? "ok" : "bad"} />

              {vertical === "all" &&
                Object.entries(d!.expenses.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, v]) => <Row key={cat} label={catLabel(cat)} hint={cat === "support_credit" ? "Wallet money given for complaints (from Support)" : "Spending"} value={v} sign="−" />)}
              {vertical === "all" && <Row label="Net profit" hint="Order profit − spending" value={net} sign="=" strong tone={net >= 0 ? "ok" : "bad"} />}
            </section>

            {d!.estimatedCostLines > 0 && (
              <div className="rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-[12px] font-bold text-warn">
                {d!.estimatedCostLines} meat order line{d!.estimatedCostLines === 1 ? "" : "s"} from before the shop price was saved on orders use today's shop price.
              </div>
            )}

            {d!.days.length > 1 && (
              <section className="card overflow-x-auto p-0">
                <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-surface-2/60 text-left text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
                      <th className="px-4 py-2">Day</th>
                      <th className="px-3 py-2 text-right">Orders</th>
                      <th className="px-3 py-2 text-right">Customers paid</th>
                      <th className="px-3 py-2 text-right">Order profit</th>
                      <th className="px-3 py-2 text-right">Spending</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...d!.days].reverse().map((x) => (
                      <tr key={x.date} className="border-t border-line tabular-nums">
                        <td className="px-4 py-1.5 font-bold">{nice(x.date)}</td>
                        <td className="px-3 py-1.5 text-right">{x.orders}</td>
                        <td className="px-3 py-1.5 text-right">{inr(x.paid)}</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${x.orderProfit < 0 ? "text-bad" : ""}`}>{x.orderProfit < 0 ? "−" : ""}{inr(Math.abs(x.orderProfit))}</td>
                        <td className="px-3 py-1.5 text-right">{x.spent ? inr(x.spent) : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-extrabold ${x.net < 0 ? "text-bad" : "text-ok"}`}>{x.net < 0 ? "−" : ""}{inr(Math.abs(x.net))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        <section className="card p-0">
          <div className="border-b border-line px-4 py-2.5">
            <div className="card-title">Spending</div>
            <div className="card-sub">Money spent outside orders: rider pay, ads, fuel, staff and so on. It comes off the profit.</div>
          </div>
          <form
            className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canAdd) add.mutate();
            }}
          >
            <label className="text-[11px] font-extrabold uppercase tracking-wide text-muted">
              Date
              <input type="date" className={`${inputCls} mt-1 w-auto`} value={draft.spentOn} max={ymd(new Date())} onChange={(e) => setDraft({ ...draft, spentOn: e.target.value })} />
            </label>
            <label className="text-[11px] font-extrabold uppercase tracking-wide text-muted">
              For
              <select className={`${inputCls} mt-1 w-auto`} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-extrabold uppercase tracking-wide text-muted">
              Amount ₹
              <input inputMode="decimal" className={`${inputCls} mt-1 w-28 text-right font-bold`} value={draft.amount} placeholder="0" onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^0-9.]/g, "") })} />
            </label>
            <label className="min-w-[180px] flex-1 text-[11px] font-extrabold uppercase tracking-wide text-muted">
              Note
              <input className={`${inputCls} mt-1`} value={draft.note} maxLength={200} placeholder="optional, e.g. Rider Kumar, week 2" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </label>
            <Btn kind="primary" type="submit" disabled={!canAdd} busy={add.isPending}>Add spending</Btn>
          </form>
          {(ex.data ?? []).length ? (
            <div className="divide-y divide-line">
              {ex.data!.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <span className="w-16 shrink-0 text-[12px] font-bold text-muted">{nice(e.spentOn)}</span>
                  <Chip tone="mute">{catLabel(e.category)}</Chip>
                  <span className="min-w-0 flex-1 text-muted">{e.note ?? ""}{e.by ? <span className="text-[11px]"> · {e.by}</span> : null}</span>
                  <span className="font-extrabold tabular-nums">{inr(e.amount)}</span>
                  <button
                    type="button"
                    title="Delete this spending"
                    aria-label={`Delete ${catLabel(e.category)} ${inr(e.amount)} on ${nice(e.spentOn)}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`Delete ${catLabel(e.category)} ${inr(e.amount)} on ${nice(e.spentOn)}?`)) remove.mutate(e.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted hover:border-bad/40 hover:text-bad"
                  >
                    <IconX size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No spending in these dates.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}
