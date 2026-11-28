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
  kg: number;
  pieces: number;
  marketValue: number;
  customerSavings: number;
  grossProfit: number;
};
type Part = {
  key: string;
  name: string;
  sub: string | null;
  vertical: "meat" | "grocery" | "both";
  orders: number;
  kg: number;
  pieces: number;
  sales: number;
  cost: number;
  marketValue: number;
  savings: number;
  grossProfit: number;
  orderProfit: number;
};
type Breakdown = { items: Part[]; shops: Part[]; areas: Part[] };
type Spent = { total: number; byCategory: Record<string, number> };
type Pnl = {
  from: string;
  to: string;
  total: Money;
  byVertical: { meat: Money; grocery: Money };
  expenses: Spent & { byVertical: { meat: Spent; grocery: Spent }; shared: number };
  netProfit: number;
  breakdown: { all: Breakdown; meat: Breakdown; grocery: Breakdown };
  estimatedMarketLines: number;
  noMarketLines: number;
  days: (Money & { date: string; spent: number; net: number })[];
  estimatedCostLines: number;
};
type Expense = { id: string; spentOn: string; category: string; amount: number; note: string | null; vertical: "meat" | "grocery" | null; by: string | null };
const VERTICAL_LABEL = { meat: "Meat", grocery: "Grocery" } as const;

/** "12.5 kg · 30 pcs", the quantity sold with kg and pieces kept apart. */
const qtyText = (kg: number, pieces: number) =>
  [kg ? `${Math.round(kg * 100) / 100} kg` : null, pieces ? `${Math.round(pieces * 100) / 100} pc${pieces === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "—";
const signed = (n: number) => `${n < 0 ? "−" : ""}${inr(Math.abs(n))}`;
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—");

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

function Card({ label, value, text, sub, tone }: { label: string; value?: number; text?: string; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : ""}`}>
        {text ?? signed(value ?? 0)}
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

  const [draft, setDraft] = useState({ spentOn: ymd(new Date()), category: "rider_pay", amount: "", note: "", vertical: "" as "" | "meat" | "grocery" });
  const [by, setBy] = useState<"items" | "shops" | "areas">("items");
  const amount = Number(draft.amount);
  const canAdd = !!draft.spentOn && Number.isFinite(amount) && amount > 0;
  const add = useMutation({
    mutationFn: () => api("/admin/expenses", { method: "POST", body: { spentOn: draft.spentOn, category: draft.category, amount: Math.round(amount * 100) / 100, note: draft.note.trim() || null, vertical: draft.vertical || null } }),
    onSuccess: () => setDraft((d) => ({ ...d, amount: "", note: "" })),
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/admin/expenses/${id}`, { method: "DELETE" }), onSettled: refresh });

  const d = q.data;
  const m = d ? (vertical === "all" ? d.total : d.byVertical[vertical]) : null;
  // Meat or grocery: only the spending marked for it. All: every rupee spent.
  const spentBlock = d ? (vertical === "all" ? d.expenses : d.expenses.byVertical[vertical]) : null;
  const spent = spentBlock?.total ?? 0;
  const parts = d ? d.breakdown[vertical] : null;
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
        {vertical !== "all" && d && d.expenses.shared > 0 && ` · ${inr(d.expenses.shared)} of shared spending shows only under All`}
      </div>

      <div className="space-y-4 px-4 pt-3 md:px-6">
        <ErrorBox error={q.error ?? ex.error ?? add.error ?? remove.error} />
        {m && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card label="Quantity sold" text={qtyText(m.kg, m.pieces)} sub={`${m.orders} delivered order${m.orders === 1 ? "" : "s"}`} />
              <Card label="Market value" value={m.marketValue} sub={vertical === "grocery" ? "at MRP" : vertical === "meat" ? "at the shops' counter price" : "meat at counter price, grocery at MRP"} />
              <Card label="Purchase cost" value={m.purchaseCost} sub="what the shops charge us" />
              <Card label="Customer sales" value={m.itemSales} sub="items at our selling price" />
              <Card label="Customer savings" value={m.customerSavings} tone={m.customerSavings >= 0 ? "ok" : "bad"} sub="market value − our price" />
              <Card label="Gross profit" value={m.grossProfit} tone={m.grossProfit >= 0 ? "ok" : "bad"} sub={`sales − purchase cost · ${pct(m.grossProfit, m.itemSales)}`} />
              <Card label="Other expenses" value={spent} sub={vertical === "all" ? "all spending, incl. support credits" : `spending marked for ${VERTICAL_LABEL[vertical].toLowerCase()}`} />
              <Card label="Net profit" value={net} tone={net >= 0 ? "ok" : "bad"} sub="order profit − other expenses" />
            </div>

            {vertical === "all" && (
              <section className="card overflow-x-auto p-0">
                <div className="border-b border-line px-4 py-2.5">
                  <div className="card-title">Meat and grocery side by side</div>
                </div>
                <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-surface-2/60 text-right text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
                      <th className="px-4 py-2 text-left">&nbsp;</th>
                      <th className="px-3 py-2">Orders</th>
                      <th className="px-3 py-2">Sold</th>
                      <th className="px-3 py-2">Purchase cost</th>
                      <th className="px-3 py-2">Customer sales</th>
                      <th className="px-3 py-2">Customer savings</th>
                      <th className="px-3 py-2">Gross profit</th>
                      <th className="px-3 py-2">Order profit</th>
                      <th className="px-3 py-2">Expenses</th>
                      <th className="px-3 py-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Meat", d!.byVertical.meat, d!.expenses.byVertical.meat.total],
                        ["Grocery", d!.byVertical.grocery, d!.expenses.byVertical.grocery.total],
                        ["Shared spending", null, d!.expenses.shared],
                        ["Total", d!.total, d!.expenses.total],
                      ] as [string, Money | null, number][]
                    ).map(([label, x, e]) => (
                      <tr key={label} className={`border-t border-line text-right tabular-nums ${label === "Total" ? "bg-surface-2/50 font-extrabold" : ""}`}>
                        <td className="px-4 py-2 text-left font-bold">{label}</td>
                        <td className="px-3 py-2">{x ? x.orders : ""}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{x ? qtyText(x.kg, x.pieces) : ""}</td>
                        <td className="px-3 py-2">{x ? inr(x.purchaseCost) : ""}</td>
                        <td className="px-3 py-2">{x ? inr(x.itemSales) : ""}</td>
                        <td className="px-3 py-2 text-ok">{x ? signed(x.customerSavings) : ""}</td>
                        <td className="px-3 py-2">{x ? signed(x.grossProfit) : ""}</td>
                        <td className="px-3 py-2">{x ? signed(x.orderProfit) : ""}</td>
                        <td className="px-3 py-2">{e ? `−${inr(e)}` : "—"}</td>
                        <td className={`px-3 py-2 font-extrabold ${(x?.orderProfit ?? 0) - e < 0 ? "text-bad" : "text-ok"}`}>{signed((x?.orderProfit ?? 0) - e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {parts && (
              <section className="card overflow-x-auto p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <div>
                    <div className="card-title">What sold, and where</div>
                    <div className="card-sub">Gross profit = our selling price − the shop's price. Customer savings = market price − our selling price.</div>
                  </div>
                  <Segments
                    value={by}
                    onChange={setBy}
                    items={[
                      { id: "items", label: "By item", count: parts.items.length },
                      { id: "shops", label: "By shop", count: parts.shops.length },
                      { id: "areas", label: "By area", count: parts.areas.length },
                    ]}
                  />
                </div>
                <BreakdownTable rows={parts[by]} by={by} />
              </section>
            )}

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

              {Object.entries(spentBlock!.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, v]) => <Row key={cat} label={catLabel(cat)} hint={cat === "support_credit" ? "Wallet money given for complaints (from Support)" : vertical === "all" ? "Spending" : `Spending marked for ${VERTICAL_LABEL[vertical].toLowerCase()}`} value={v} sign="−" />)}
              <Row label="Net profit" hint="Order profit − other expenses" value={net} sign="=" strong tone={net >= 0 ? "ok" : "bad"} />
            </section>

            {(d!.estimatedMarketLines > 0 || d!.noMarketLines > 0) && (
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] font-bold text-muted">
                {d!.estimatedMarketLines > 0 && `${d!.estimatedMarketLines} meat line${d!.estimatedMarketLines === 1 ? "" : "s"} from before the market price was saved on orders use the shop's market price now. `}
                {d!.noMarketLines > 0 && `${d!.noMarketLines} line${d!.noMarketLines === 1 ? "" : "s"} had no market price or MRP, so they count in sales but not in customer savings.`}
              </div>
            )}
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
              Part of
              <select className={`${inputCls} mt-1 w-auto`} value={draft.vertical} onChange={(e) => setDraft({ ...draft, vertical: e.target.value as "" | "meat" | "grocery" })}>
                <option value="">Both (shared)</option>
                <option value="meat">Meat only</option>
                <option value="grocery">Grocery only</option>
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
                  {e.vertical && <Chip tone="info">{VERTICAL_LABEL[e.vertical]}</Chip>}
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

/** Items, shops or areas: what sold, at what cost, what customers saved and what we kept. */
function BreakdownTable({ rows, by }: { rows: Part[]; by: "items" | "shops" | "areas" }) {
  if (!rows.length) return <Empty>Nothing delivered in these dates.</Empty>;
  const items = by === "items";
  // Per kg or per piece: only for an item sold in one unit.
  const each = (total: number, r: Part) => {
    const q = r.kg && !r.pieces ? r.kg : r.pieces && !r.kg ? r.pieces : 0;
    return q ? inr(total / q) : "—";
  };
  return (
    <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
      <thead>
        <tr className="bg-surface-2/60 text-right text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
          <th className="px-4 py-2 text-left">{items ? "Item" : by === "shops" ? "Shop" : "Area"}</th>
          <th className="px-3 py-2">Orders</th>
          <th className="px-3 py-2">Sold</th>
          {items && <th className="px-3 py-2" title="Average market price per kg or piece">Market</th>}
          {items && <th className="px-3 py-2" title="Average shop price per kg or piece">Cost</th>}
          {items && <th className="px-3 py-2" title="Average selling price per kg or piece">Selling</th>}
          <th className="px-3 py-2">Purchase cost</th>
          <th className="px-3 py-2">Customer sales</th>
          <th className="px-3 py-2">Customer savings</th>
          <th className="px-3 py-2">Gross profit</th>
          {!items && <th className="px-3 py-2" title="After discounts, delivery fees, app charges and rider pay">Order profit</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.vertical}-${r.key}`} className="border-t border-line text-right tabular-nums">
            <td className="px-4 py-2 text-left">
              <div className="font-bold">{r.name}</div>
              <div className="text-[11px] text-muted">
                {[r.vertical !== "both" && items ? VERTICAL_LABEL[r.vertical] : null, r.sub].filter(Boolean).join(" · ")}
              </div>
            </td>
            <td className="px-3 py-2">{r.orders}</td>
            <td className="whitespace-nowrap px-3 py-2">{qtyText(r.kg, r.pieces)}</td>
            {items && <td className="px-3 py-2 text-muted">{r.marketValue ? each(r.marketValue, r) : "—"}</td>}
            {items && <td className="px-3 py-2 text-muted">{each(r.cost, r)}</td>}
            {items && <td className="px-3 py-2 text-muted">{each(r.sales, r)}</td>}
            <td className="px-3 py-2">{inr(r.cost)}</td>
            <td className="px-3 py-2">{inr(r.sales)}</td>
            <td className={`px-3 py-2 ${r.savings < 0 ? "text-bad" : "text-ok"}`}>{r.marketValue ? signed(r.savings) : "—"}</td>
            <td className={`px-3 py-2 font-extrabold ${r.grossProfit < 0 ? "text-bad" : ""}`}>
              {signed(r.grossProfit)}
              <div className="text-[10.5px] font-bold text-muted">{pct(r.grossProfit, r.sales)}</div>
            </td>
            {!items && <td className={`px-3 py-2 font-extrabold ${r.orderProfit < 0 ? "text-bad" : "text-ok"}`}>{signed(r.orderProfit)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
