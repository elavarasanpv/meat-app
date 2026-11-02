import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconPhone } from "../ui/icons";
import { Btn, Chip, Drawer, Empty, ErrorBox, Field, Section, Segments, StatusChip, type Tone, ago, inputCls, inr, phone10, when } from "../ui/kit";

type Row = {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  source: string;
  body: string | null;
  creditAmount: number | null;
  resolution: string | null;
  customer: string | null;
  phone: string | null;
  order: string | null;
  createdAt: string;
  updatedAt: string;
};
type Msg = { id: string; sender: "customer" | "admin" | "system"; body: string | null; photoUrl: string | null; at: string };
type Thread = {
  id: string;
  customer: { name: string | null; phone: string | null };
  orderId: string | null;
  order: { displayId: string; status: string; amount: number } | null;
  type: string;
  typeLabel: string;
  status: string;
  source: string;
  fault: string | null;
  resolution: string | null;
  creditAmount: number | null;
  createdAt: string;
  messages: Msg[];
  orderDetail: {
    items: { id: string; name: string; qty: number; unit: string; price: number; unavailable: boolean }[];
    photos: { kind: string; at: string; url: string | null }[];
    shop: { name: string } | null;
    rider: { name: string | null } | null;
  } | null;
};

const TICKET_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Needs reply", tone: "bad" },
  waiting_customer: { label: "Waiting on customer", tone: "warn" },
  resolved: { label: "Resolved", tone: "ok" },
  closed: { label: "Closed", tone: "mute" },
};
const SOURCE: Record<string, string> = { customer: "Customer", shop: "Shop", rider: "Rider", auto: "Automatic" };

export function Support() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<"open" | "waiting" | "done" | "all">("open");
  const openId = params.get("id");
  const list = useQuery<Row[]>({ queryKey: ["admin", "support", filter], queryFn: () => api(`/admin/support?filter=${filter}`), refetchInterval: 20_000 });
  const open = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("id", id);
    else p.delete("id");
    setParams(p, { replace: true });
  };

  return (
    <div className="pb-6">
      <PageHeader title="Support" sub="Customer complaints and questions. Reply fast; resolve with a credit when we owe them." />
      <div className="px-4 pt-4 md:px-6">
        <Segments
          value={filter}
          onChange={setFilter}
          items={[
            { id: "open", label: "Needs reply" },
            { id: "waiting", label: "Waiting on customer" },
            { id: "done", label: "Resolved" },
            { id: "all", label: "All" },
          ]}
        />
      </div>
      <div className="px-4 pt-3 md:px-6">
        <div className="card overflow-hidden p-0">
          <ErrorBox error={list.error} />
          {list.data?.map((t) => {
            const st = TICKET_STATUS[t.status] ?? { label: t.status, tone: "info" as Tone };
            return (
              <button key={t.id} onClick={() => open(t.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5 text-left text-[12.5px] last:border-0 hover:bg-tint/30">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-extrabold">{t.customer ?? "Customer"}</span>
                  <Chip tone="info">{t.typeLabel}</Chip>
                  {t.source !== "customer" && <Chip tone="mute">{SOURCE[t.source]}</Chip>}
                  {t.order && <span className="hidden text-muted sm:inline">· {t.order}</span>}
                </span>
                <Chip tone={st.tone}>{st.label}</Chip>
                <span className="col-span-2 truncate text-muted md:col-span-1">{t.body}</span>
                <span className="text-right text-[11px] text-muted">
                  {t.status === "open" ? `waiting ${ago(t.updatedAt)}` : ago(t.updatedAt)}
                  {t.creditAmount != null && <span className="ml-2 font-bold text-ok">{inr(t.creditAmount)} credited</span>}
                </span>
              </button>
            );
          })}
          {list.data && !list.data.length && <Empty>{filter === "open" ? "Nobody is waiting. Nice." : "Nothing here."}</Empty>}
          {list.isLoading && <Empty>Loading…</Empty>}
        </div>
      </div>
      {openId && <TicketDrawer id={openId} onClose={() => open(null)} />}
    </div>
  );
}

function TicketDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery<Thread>({ queryKey: ["admin", "support-ticket", id], queryFn: () => api(`/admin/support/${id}`), refetchInterval: 15_000 });
  const t = q.data;
  const [reply, setReply] = useState("");
  const [resolving, setResolving] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin"] });
  const send = useMutation({
    mutationFn: () => api(`/admin/support/${id}/reply`, { method: "POST", body: { body: reply } }),
    onSuccess: () => {
      setReply("");
      refresh();
    },
  });
  const close = useMutation({ mutationFn: () => api(`/admin/support/${id}/close`, { method: "POST" }), onSuccess: refresh });
  const st = t ? (TICKET_STATUS[t.status] ?? { label: t.status, tone: "info" as Tone }) : null;
  const canAct = t && (t.status === "open" || t.status === "waiting_customer");

  return (
    <Drawer
      wide
      onClose={onClose}
      title={t ? <span className="flex items-center gap-2">{t.customer.name ?? "Customer"} {st && <Chip tone={st.tone}>{st.label}</Chip>}</span> : "Ticket"}
      sub={t ? `${t.typeLabel} · ${SOURCE[t.source]} · opened ${when(t.createdAt)}` : undefined}
      footer={
        canAct ? (
          <>
            <Btn kind="ghost" onClick={() => confirm("Close without resolving? The customer can't reply after this.") && close.mutate()}>
              Close
            </Btn>
            <Btn kind="primary" onClick={() => setResolving(true)}>
              Resolve…
            </Btn>
          </>
        ) : undefined
      }
    >
      <ErrorBox error={q.error ?? send.error ?? close.error} />
      {!t ? (
        <Empty>Loading…</Empty>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-[12.5px]">
            <span className="font-bold">{t.customer.name ?? "Customer"}</span>
            {t.customer.phone && (
              <a href={`tel:+91${phone10(t.customer.phone)}`} className="flex items-center gap-1 rounded-md bg-ok-bg px-2 py-0.5 text-[11.5px] font-bold text-ok">
                <IconPhone size={12} /> {phone10(t.customer.phone)}
              </a>
            )}
            {t.order && t.orderId && (
              <Link to={`/orders?filter=all&id=${t.orderId}`} className="ml-auto flex items-center gap-2 font-bold text-primary">
                {t.order.displayId} · {inr(t.order.amount)} <StatusChip status={t.order.status} />
              </Link>
            )}
          </div>

          {t.orderDetail && (
            <Section title="Order at a glance">
              <div className="rounded-xl border border-line bg-surface p-3 text-[12px]">
                <div className="text-muted">
                  {t.orderDetail.shop && <span className="mr-3">Shop: <b className="text-ink">{t.orderDetail.shop.name}</b></span>}
                  {t.orderDetail.rider?.name && <span>Rider: <b className="text-ink">{t.orderDetail.rider.name}</b></span>}
                </div>
                <div className="mt-1.5 divide-y divide-line">
                  {t.orderDetail.items.map((i) => (
                    <div key={i.id} className={`flex justify-between py-1 ${i.unavailable ? "line-through opacity-50" : ""}`}>
                      <span>{i.name} · {i.qty} {i.unit === "piece" ? "pc" : i.unit}</span>
                      <span className="font-bold">{inr(i.qty * i.price)}</span>
                    </div>
                  ))}
                </div>
                {t.orderDetail.photos.some((p) => p.url) && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {t.orderDetail.photos.map((p, i) =>
                      p.url ? (
                        <a key={i} href={p.url} target="_blank" rel="noreferrer" className="relative shrink-0 overflow-hidden rounded-lg border border-line">
                          <img src={p.url} alt={p.kind} className="h-16 w-16 object-cover" />
                          <span className="absolute inset-x-0 bottom-0 bg-ink/60 px-1 text-[9px] font-bold text-white">{p.kind}</span>
                        </a>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="Conversation">
            <div className="space-y-2">
              {t.messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] ${m.sender === "admin" ? "rounded-br-md bg-primary text-white" : m.sender === "system" ? "border border-dashed border-line bg-surface-2/60 text-muted" : "rounded-bl-md border border-line bg-surface"}`}>
                    {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}
                    {m.photoUrl && (
                      <a href={m.photoUrl} target="_blank" rel="noreferrer">
                        <img src={m.photoUrl} alt="attachment" className="mt-1.5 max-h-40 rounded-lg" />
                      </a>
                    )}
                    <div className={`mt-0.5 text-[10px] ${m.sender === "admin" ? "text-white/70" : "text-muted"}`}>{when(m.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {t.resolution && (
            <div className="mb-3 rounded-xl bg-ok-bg/70 px-3 py-2 text-[12.5px] text-ok">
              Resolved: {t.resolution}{t.creditAmount != null ? ` · ${inr(t.creditAmount)} credited` : ""}{t.fault ? ` · fault: ${t.fault}` : ""}
            </div>
          )}

          {canAct && !resolving && (
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reply.trim() && send.mutate()}
                placeholder="Reply to the customer… (they get a notification)"
              />
              <Btn kind="primary" busy={send.isPending} disabled={!reply.trim()} onClick={() => send.mutate()}>
                Send
              </Btn>
            </div>
          )}
          {canAct && resolving && <ResolveBox id={id} suggested={t.order?.amount ?? null} onDone={() => setResolving(false)} />}
        </div>
      )}
    </Drawer>
  );
}

function ResolveBox({ id, suggested, onDone }: { id: string; suggested: number | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState<"credit" | "refund_upi" | "apology" | "none">("credit");
  const [fault, setFault] = useState<"shop" | "rider" | "freshcut" | "customer" | "none">("shop");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: () =>
      api(`/admin/support/${id}/resolve`, { method: "POST", body: { resolution, fault, amount: resolution === "credit" ? Number(amount) : undefined, note: note || undefined } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      onDone();
    },
  });
  return (
    <div className="rounded-xl border border-primary/30 bg-tint/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How do we make it right?">
          <select className={inputCls} value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)}>
            <option value="credit">Wallet credit</option>
            <option value="refund_upi">Refund by UPI (you send it)</option>
            <option value="apology">Apology only</option>
            <option value="none">No action</option>
          </select>
        </Field>
        <Field label="Whose fault was it? Counts in their stats.">
          <select className={inputCls} value={fault} onChange={(e) => setFault(e.target.value as typeof fault)}>
            <option value="shop">Shop</option>
            <option value="rider">Rider</option>
            <option value="freshcut">FreshCut</option>
            <option value="customer">Customer</option>
            <option value="none">Nobody</option>
          </select>
        </Field>
        {resolution === "credit" && (
          <Field label="Credit amount" hint={suggested ? `Order was ${inr(suggested)}` : undefined}>
            <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-primary">
              <span className="pl-2.5 text-muted">₹</span>
              <input className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} autoFocus />
            </div>
          </Field>
        )}
        <Field label="Message to the customer (optional)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sorry about the wait…" />
        </Field>
      </div>
      {resolve.error && <div className="mt-2 text-[12px] font-bold text-bad">{(resolve.error as Error).message}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <Btn onClick={onDone}>Back</Btn>
        <Btn kind="primary" busy={resolve.isPending} disabled={resolution === "credit" && !(Number(amount) > 0)} onClick={() => resolve.mutate()}>
          {resolution === "credit" && Number(amount) > 0 ? `Credit ${inr(Number(amount))} & resolve` : "Resolve"}
        </Btn>
      </div>
    </div>
  );
}
