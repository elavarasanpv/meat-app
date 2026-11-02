import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconPhone } from "../ui/icons";
import { Btn, Chip, Empty, ErrorBox, inr, phone10, when } from "../ui/kit";

type Handover = { id: string; rider: string; date: string; expected: number; submitted: number | null; note: string | null; verified: boolean; at: string };
type CashData = {
  inHand: { id: string; name: string; phone: string | null; online: boolean; cash: number }[];
  totalInHand: number;
  toVerify: Handover[];
  verified: Handover[];
};

export function Cash() {
  const q = useQuery<CashData>({ queryKey: ["admin", "cash"], queryFn: () => api("/admin/cash"), refetchInterval: 30_000 });
  const d = q.data;
  const holding = d?.inHand.filter((r) => r.cash > 0) ?? [];
  const pending = d?.toVerify.reduce((t, h) => t + (h.submitted ?? 0), 0) ?? 0;

  return (
    <div className="pb-6">
      <PageHeader title="Cash" sub="Cash riders collected at the door, and their day-end hand-overs." />
      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-3 md:px-6">
        <Tile label="With riders now" value={d ? inr(d.totalInHand) : "—"} cls="bg-[#FDE6DF] text-primary" />
        <Tile label="Handed over, not counted" value={d ? inr(pending) : "—"} cls="bg-[#FBF3D6] text-warn" />
        <Tile label="Hand-overs to check" value={d ? String(d.toVerify.length) : "—"} cls="bg-[#E3F3EA] text-ok" />
      </div>
      <div className="px-4 pt-3 md:px-6">
        <ErrorBox error={q.error} />
      </div>
      <div className="grid gap-4 px-4 pt-3 md:px-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card">
          <div className="card-title">Cash in hand</div>
          <div className="card-sub">Collected today and not yet handed over</div>
          <div className="mt-2 divide-y divide-line">
            {holding.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-2 text-[12.5px]">
                <span className={`h-2 w-2 rounded-full ${r.online ? "bg-ok" : "bg-line"}`} />
                <span className="flex-1 font-bold">{r.name}</span>
                {r.phone && (
                  <a href={`tel:+91${phone10(r.phone)}`} className="rounded-md border border-line p-1 text-muted hover:text-ink" aria-label={`Call ${r.name}`}>
                    <IconPhone size={13} />
                  </a>
                )}
                <span className="w-20 text-right font-extrabold text-primary">{inr(r.cash)}</span>
              </div>
            ))}
            {d && !holding.length && <Empty>No rider is holding cash.</Empty>}
          </div>
        </section>

        <section className="card">
          <div className="card-title">Hand-overs to count</div>
          <div className="card-sub">Count the cash, enter what you received and confirm</div>
          <div className="mt-2 space-y-2">
            {d?.toVerify.map((h) => <VerifyRow key={h.id} h={h} />)}
            {d && !d.toVerify.length && <Empty>All hand-overs are counted.</Empty>}
          </div>
        </section>
      </div>

      <div className="px-4 pt-4 md:px-6">
        <section className="card">
          <div className="card-title">Counted</div>
          <div className="mt-2 divide-y divide-line">
            {d?.verified.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                <span className="w-24 text-muted">{h.date}</span>
                <span className="flex-1 font-bold">{h.rider}</span>
                {h.note ? <Chip tone="warn">{h.note}</Chip> : <Chip tone="ok">Matched</Chip>}
                <span className="w-20 text-right font-extrabold">{inr(h.submitted ?? 0)}</span>
              </div>
            ))}
            {d && !d.verified.length && <Empty>Nothing counted yet.</Empty>}
          </div>
        </section>
      </div>
    </div>
  );
}

function VerifyRow({ h }: { h: Handover }) {
  const qc = useQueryClient();
  const [received, setReceived] = useState(String(h.submitted ?? h.expected));
  const [note, setNote] = useState("");
  const verify = useMutation({
    mutationFn: () => api(`/admin/cash/${h.id}/verify`, { method: "POST", body: { received: Number(received), note: note || undefined } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  const diff = Number(received) - (h.submitted ?? 0);
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-bold">{h.rider}</span>
        <span className="text-muted">· {h.date} · {when(h.at)}</span>
        <span className="ml-auto text-muted">
          app expected <b className="text-ink">{inr(h.expected)}</b>, rider handed <b className="text-ink">{inr(h.submitted ?? 0)}</b>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex w-28 items-center rounded-lg border border-line focus-within:border-primary">
          <span className="pl-2 text-muted">₹</span>
          <input className="w-full bg-transparent px-1.5 py-1.5 text-[13px] outline-none" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Amount counted" />
        </div>
        <input className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary" value={note} onChange={(e) => setNote(e.target.value)} placeholder={diff ? "Why is it different?" : "Note (optional)"} />
        {diff !== 0 && <span className={`text-[12px] font-bold ${diff < 0 ? "text-bad" : "text-warn"}`}>{diff < 0 ? `short ${inr(-diff)}` : `extra ${inr(diff)}`}</span>}
        <Btn kind="primary" busy={verify.isPending} disabled={received === ""} onClick={() => verify.mutate()}>
          Counted
        </Btn>
      </div>
      {verify.error && <div className="mt-1 text-[11.5px] font-bold text-bad">{(verify.error as Error).message}</div>}
    </div>
  );
}

function Tile({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className={`rounded-xl p-3.5 ${cls}`}>
      <div className="text-[11px] font-bold opacity-80">{label}</div>
      <div className="text-[20px] font-extrabold">{value}</div>
    </div>
  );
}
