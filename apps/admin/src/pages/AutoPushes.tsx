import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { Btn, Chip, ErrorBox, Field, Segments, inputCls, when } from "../ui/kit";

/**
 * Automatic customer pushes: salary day, weekend and "we miss you". Each is
 * switched on, worded and timed here; the server sends it once on its day.
 */

type Kind = "salary_day" | "weekend" | "inactive" | "reorder";
type Audience = "all" | "ordered" | "never_ordered";
type AutoPush = {
  kind: Kind;
  enabled: boolean;
  title: string;
  body: string;
  titleTa: string | null;
  bodyTa: string | null;
  sendAt: string;
  dayOfMonth: number;
  weekday: number;
  inactiveDays: number;
  audience: Audience;
  pincodes: string[];
  lastSentAt: string | null;
  lastSentCount: number | null;
  nextOn: string | null;
  reach: number;
};
type Draft = Omit<AutoPush, "pincodes" | "lastSentAt" | "lastSentCount" | "nextOn" | "reach"> & { pincodes: string };

const KEY = ["admin", "auto-pushes"];
const NAMES: Record<Kind, { title: string; what: string }> = {
  salary_day: { title: "Salary day", what: "Once a month, on the day most people get paid." },
  weekend: { title: "Weekend", what: "Once a week, on the day you pick." },
  reorder: { title: "Order again", what: "To a customer whose order was delivered on this same weekday last week, e.g. last Sunday's order gets a reminder this Sunday. It names the day and what they ordered. Skipped if they already ordered today." },
  inactive: { title: "We miss you", what: "To a customer who has not ordered for some days. Each customer gets it once, and again only after they order and go quiet again." },
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_TA = ["ஞாயிற்றுக்கிழமை", "திங்கட்கிழமை", "செவ்வாய்க்கிழமை", "புதன்கிழமை", "வியாழக்கிழமை", "வெள்ளிக்கிழமை", "சனிக்கிழமை"];
const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "all", label: "All customers" },
  { id: "ordered", label: "Ordered before" },
  { id: "never_ordered", label: "Never ordered" },
];
const nth = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

function toDraft(a: AutoPush): Draft {
  const { lastSentAt: _a, lastSentCount: _b, nextOn: _c, reach: _d, ...rest } = a;
  return { ...rest, pincodes: a.pincodes.join(", ") };
}

export function AutoPushesPage() {
  const q = useQuery({ queryKey: KEY, queryFn: () => api<AutoPush[]>("/admin/auto-pushes") });
  return (
    <div className="pb-6">
      <PageHeader
        title="Auto notifications"
        sub="Pushes the app sends to customers by itself. Each starts switched off. When switched on, it goes out once on its day at the time you set (Indian time). A customer gets at most one of these a day: the first one due wins."
      />
      <div className="space-y-4 px-4 pt-4 md:px-6">
        <ErrorBox error={q.error} />
        {q.isLoading && <div className="text-[12.5px] text-muted">Loading…</div>}
        {(q.data ?? []).map((a) => (
          <Card key={a.kind} a={a} />
        ))}
      </div>
    </div>
  );
}

function Card({ a }: { a: AutoPush }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(a));
  useEffect(() => setD(toDraft(a)), [a]);
  const [phone, setPhone] = useState("");
  const [tested, setTested] = useState<string | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(a));
  const pins = d.pincodes.split(/[\s,]+/).filter(Boolean);
  const badPin = pins.find((p) => !/^\d{6}$/.test(p));

  const save = useMutation({
    mutationFn: (draft: Draft) =>
      api<AutoPush>(`/admin/auto-pushes/${a.kind}`, {
        method: "POST",
        body: { ...draft, kind: undefined, titleTa: draft.titleTa || null, bodyTa: draft.bodyTa || null, pincodes: draft.pincodes.split(/[\s,]+/).filter(Boolean) },
      }),
    onSuccess: (row) => qc.setQueryData<AutoPush[]>(KEY, (old) => old?.map((x) => (x.kind === row.kind ? row : x))),
  });
  const test = useMutation({
    mutationFn: () => api<{ sent: number }>(`/admin/auto-pushes/${a.kind}/test`, { method: "POST", body: { phone } }),
    onSuccess: () => setTested(phone),
  });

  const schedule =
    a.kind === "salary_day"
      ? `On the ${nth(d.dayOfMonth)} of every month`
      : a.kind === "weekend"
        ? `Every ${DAYS[d.weekday]}`
        : a.kind === "reorder"
          ? "Every day, one week after a delivered order"
          : `${d.inactiveDays} days after a customer's last order`;
  // {day} and {items} are filled in per customer; the preview uses an example.
  const today = new Date().getDay();
  const ex = (text: string, ta: boolean) => (a.kind === "reorder" ? text.split("{day}").join(ta ? DAYS_TA[today] : DAYS[today]).split("{items}").join(ta ? "கோழி கறி துண்டு" : "Chicken curry cut") : text);

  return (
    <section className={`rounded-2xl border bg-surface p-4 ${a.enabled ? "border-ok/50" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-extrabold">{NAMES[a.kind].title}</h2>
            {a.enabled ? <Chip tone="ok">On</Chip> : <Chip>Off</Chip>}
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted">{NAMES[a.kind].what}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-bold">
          <input type="checkbox" className="h-4 w-4 accent-[#E4461F]" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} />
          Send automatically
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {a.kind === "salary_day" && (
              <Field label="Day of the month" hint="31 means the last day of every month.">
                <select className={inputCls} value={d.dayOfMonth} onChange={(e) => setD({ ...d, dayOfMonth: Number(e.target.value) })}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {nth(n)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {a.kind === "weekend" && (
              <Field label="Day of the week">
                <select className={inputCls} value={d.weekday} onChange={(e) => setD({ ...d, weekday: Number(e.target.value) })}>
                  {DAYS.map((n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {a.kind === "inactive" && (
              <Field label="Days without an order" hint="Between 2 and 90 days.">
                <input className={inputCls} type="number" min={2} max={90} value={d.inactiveDays} onChange={(e) => setD({ ...d, inactiveDays: Number(e.target.value) })} />
              </Field>
            )}
            <Field label="Time (Indian time)" hint="If the server is asleep then, it goes within 3 hours, never later.">
              <input className={inputCls} type="time" value={d.sendAt} onChange={(e) => setD({ ...d, sendAt: e.target.value })} />
            </Field>
          </div>

          <Field label="Who gets it">
            {a.kind === "inactive" || a.kind === "reorder" ? (
              <div className="text-[12.5px] font-semibold">{a.kind === "inactive" ? "Customers who ordered before and then went quiet." : "Customers with a delivered order on this weekday last week."}</div>
            ) : (
              <div className="flex">
                <Segments value={d.audience} onChange={(v) => setD({ ...d, audience: v })} items={AUDIENCES} />
              </div>
            )}
          </Field>
          <Field label="Only these pincodes (optional)" hint="Leave empty for everywhere. Separate pincodes with commas." error={badPin ? `"${badPin}" is not a 6-digit pincode` : null}>
            <input className={inputCls} placeholder="Everywhere" value={d.pincodes} onChange={(e) => setD({ ...d, pincodes: e.target.value })} />
          </Field>

          {a.kind === "reorder" && (
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-[11.5px] text-muted">
              Write <b className="text-ink">{"{day}"}</b> for the weekday and <b className="text-ink">{"{items}"}</b> for what they ordered (up to two names, then "and 2 more"). Each customer sees their own.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title (English)">
              <input className={inputCls} maxLength={60} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
            </Field>
            <Field label="Title (Tamil)">
              <input className={inputCls} maxLength={80} value={d.titleTa ?? ""} onChange={(e) => setD({ ...d, titleTa: e.target.value })} />
            </Field>
            <Field label="Message (English)">
              <textarea className={inputCls} rows={3} maxLength={160} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
            </Field>
            <Field label="Message (Tamil)" hint="Customers who use the app in Tamil get this one.">
              <textarea className={inputCls} rows={3} maxLength={220} value={d.bodyTa ?? ""} onChange={(e) => setD({ ...d, bodyTa: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-surface-2 p-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted">What the phone shows</div>
            <div className="mt-2 rounded-xl bg-surface p-3 shadow-sm">
              <div className="text-[11px] font-bold text-muted">Thanjoz Mart · now</div>
              <div className="mt-0.5 text-[13.5px] font-extrabold">{ex(d.title, false) || "Title"}</div>
              <div className="text-[12.5px]">{ex(d.body, false) || "Message"}</div>
            </div>
            {d.titleTa && d.bodyTa && (
              <div className="mt-2 rounded-xl bg-surface p-3 shadow-sm">
                <div className="text-[11px] font-bold text-muted">Thanjoz Mart · now</div>
                <div className="mt-0.5 text-[13.5px] font-extrabold">{ex(d.titleTa, true)}</div>
                <div className="text-[12.5px]">{ex(d.bodyTa, true)}</div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line p-3 text-[12.5px]">
            <div className="font-bold">
              {schedule}, at {time12(d.sendAt)}
            </div>
            <div className="mt-1 text-muted">
              {a.kind === "inactive" || a.kind === "reorder" ? "Would reach today: " : "Would reach now: "}
              <b className="text-ink">{a.reach} {a.reach === 1 ? "customer" : "customers"}</b> with the app
              {dirty && " (as last saved)"}
            </div>
            <div className="mt-1 text-muted">
              {a.enabled && a.nextOn ? (
                <>
                  Next: <b className="text-ink">{day(a.nextOn)}</b>
                </>
              ) : (
                "Switched off: nothing will be sent."
              )}
            </div>
            <div className="mt-1 text-muted">{a.lastSentAt ? `Last sent ${when(a.lastSentAt)} to ${a.lastSentCount ?? 0} ${a.lastSentCount === 1 ? "customer" : "customers"}` : "Never sent yet."}</div>
          </div>

          <div className="rounded-2xl border border-line p-3">
            <div className="text-[12.5px] font-bold">Try it on one phone</div>
            <div className="mt-0.5 text-[11.5px] text-muted">Sends the saved wording to one customer number now. Nobody else gets it.</div>
            <div className="mt-2 flex gap-2">
              <input className={inputCls} inputMode="numeric" maxLength={10} placeholder="10-digit phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              <Btn onClick={() => test.mutate()} disabled={phone.length !== 10 || dirty} busy={test.isPending}>
                Send test
              </Btn>
            </div>
            {dirty && <div className="mt-1 text-[11px] text-muted">Save first, then test.</div>}
            {tested && !test.isPending && !test.error && <div className="mt-1 text-[11.5px] font-bold text-ok">Sent to {tested}.</div>}
            <div className="mt-1">
              <ErrorBox error={test.error} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <ErrorBox error={save.error} />
        {dirty && (
          <Btn onClick={() => setD(toDraft(a))} disabled={save.isPending}>
            Undo changes
          </Btn>
        )}
        <Btn kind="primary" onClick={() => save.mutate(d)} disabled={!dirty || !!badPin} busy={save.isPending}>
          Save
        </Btn>
      </div>
    </section>
  );
}
