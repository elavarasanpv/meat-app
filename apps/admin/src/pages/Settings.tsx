import { useState, type ReactNode } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminMe } from "../auth/Gate";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { PageHeader, displayName } from "../shell/Shell";
import { IconCheck, IconCopy, IconHistory, IconLock, IconSliders, IconUser, IconUsers, IconX } from "../ui/icons";
import { Avatar, Btn, Chip, Empty, ErrorBox, Field, Segments, ago, inputCls, inr, when } from "../ui/kit";

const TABS = [
  { id: "profile", label: "Profile", Icon: IconUser, sub: "Your name and email" },
  { id: "password", label: "Password", Icon: IconLock, sub: "Change your sign-in password" },
  { id: "team", label: "Admin team", Icon: IconUsers, sub: "Who can sign in here" },
  { id: "rules", label: "Business rules", Icon: IconSliders, sub: "Fees, timers and limits" },
  { id: "activity", label: "Activity log", Icon: IconHistory, sub: "Every change an admin made" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "profile") as Tab;
  const go = (t: Tab) => setParams({ tab: t }, { replace: true });
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="pb-6">
      <PageHeader title="Settings" sub="Your account, the admin team and how FreshCut runs." />
      <div className="px-4 pt-4 md:hidden">
        <Segments value={tab} onChange={go} items={TABS.map((t) => ({ id: t.id, label: t.label }))} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-4 md:grid-cols-[220px_minmax(0,1fr)] md:px-6">
        <nav className="hidden self-start rounded-2xl border border-line bg-surface p-1.5 md:block">
          {TABS.map(({ id, label, Icon, sub }) => (
            <button key={id} onClick={() => go(id)} className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${tab === id ? "bg-tint" : "hover:bg-surface-2/70"}`}>
              <Icon size={16} className={`mt-0.5 ${tab === id ? "text-primary" : "text-muted"}`} />
              <span>
                <span className={`block text-[12.5px] font-extrabold ${tab === id ? "text-primary" : ""}`}>{label}</span>
                <span className="block text-[10.5px] text-muted">{sub}</span>
              </span>
            </button>
          ))}
        </nav>
        <section className="card min-w-0">
          <div className="mb-4 border-b border-line pb-3">
            <div className="card-title">{current.label}</div>
            <div className="card-sub">{current.sub}</div>
          </div>
          {tab === "profile" && <ProfileTab />}
          {tab === "password" && <PasswordTab />}
          {tab === "team" && <TeamTab />}
          {tab === "rules" && <RulesTab />}
          {tab === "activity" && <ActivityTab />}
        </section>
      </div>
    </div>
  );
}

function Saved({ show, children = "Saved" }: { show: boolean; children?: ReactNode }) {
  return show ? (
    <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ok">
      <IconCheck size={13} /> {children}
    </span>
  ) : null;
}

function ProfileTab() {
  const me = useOutletContext<AdminMe>();
  const qc = useQueryClient();
  const [name, setName] = useState(me.name ?? "");
  const save = useMutation({
    mutationFn: () => api("/admin/me", { method: "PATCH", body: { name } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "me"] }),
  });
  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={name || displayName(me)} size={56} />
        <div>
          <div className="text-[15px] font-extrabold">{name || displayName(me)}</div>
          <Chip tone="ok">Admin · full access</Chip>
        </div>
      </div>
      <Field label="Your name" hint="Shown in the top bar and the activity log.">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Elavarasan" />
      </Field>
      <Field label="Email" hint="Your sign-in. Ask another admin to change it.">
        <input className={`${inputCls} bg-surface-2 text-muted`} value={me.email} readOnly />
      </Field>
      <ErrorBox error={save.error} />
      <div className="flex items-center gap-3">
        <Btn kind="primary" busy={save.isPending} disabled={name.trim().length < 2 || name === (me.name ?? "")} onClick={() => save.mutate()}>
          Save profile
        </Btn>
        <Saved show={save.isSuccess && name === (me.name ?? "")} />
      </div>
    </div>
  );
}

function PasswordTab() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const change = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
    },
    onSuccess: () => {
      setPw("");
      setPw2("");
    },
  });
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  return (
    <div className="max-w-md space-y-4">
      <Field label="New password" error={tooShort ? "Use at least 8 characters." : null} hint="At least 8 characters. A short sentence is easy to remember.">
        <input type={show ? "text" : "password"} autoComplete="new-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Type it again" error={mismatch ? "The two passwords don't match." : null}>
        <input type={show ? "text" : "password"} autoComplete="new-password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-[12px] text-muted">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
      </label>
      <ErrorBox error={change.error} />
      <div className="flex items-center gap-3">
        <Btn kind="primary" busy={change.isPending} disabled={pw.length < 8 || pw !== pw2} onClick={() => change.mutate()}>
          Change password
        </Btn>
        <Saved show={change.isSuccess}>Password changed</Saved>
      </div>
    </div>
  );
}

type AdminRow = { email: string; note: string | null; addedAt: string; name: string | null; status: "active" | "invited"; lastSignIn: string | null };

function TeamTab() {
  const me = useOutletContext<AdminMe>();
  const qc = useQueryClient();
  const team = useQuery<AdminRow[]>({ queryKey: ["admin", "team"], queryFn: () => api("/admin/admins") });
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const invite = useMutation({
    mutationFn: () => api<{ email: string; link: string }>("/admin/admins", { method: "POST", body: { email, note: note || undefined, appUrl: window.location.origin } }),
    onSuccess: (r) => {
      setLink(r);
      setEmail("");
      setNote("");
      setCopied(false);
      void qc.invalidateQueries({ queryKey: ["admin", "team"] });
    },
  });
  const remove = useMutation({
    mutationFn: (e: string) => api(`/admin/admins/${encodeURIComponent(e)}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "team"] }),
  });

  return (
    <div className="space-y-5">
      <div className="divide-y divide-line rounded-xl border border-line">
        {team.data?.map((a) => (
          <div key={a.email} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <Avatar name={a.name ?? a.email} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-extrabold">
                {a.name ?? a.email.split("@")[0]} {a.email === me.email && <span className="font-normal text-muted">(you)</span>}
              </div>
              <div className="truncate text-[11.5px] text-muted">
                {a.email}
                {a.note && ` · ${a.note}`}
              </div>
            </div>
            {a.status === "active" ? <Chip tone="ok">Active{a.lastSignIn ? ` · ${ago(a.lastSignIn)}` : ""}</Chip> : <Chip tone="warn">Invited</Chip>}
            {a.email !== me.email && (
              <button
                onClick={() => confirm(`Remove ${a.email}? They lose admin access straight away.`) && remove.mutate(a.email)}
                className="rounded-lg border border-line p-1.5 text-muted transition hover:border-bad/40 hover:text-bad"
                aria-label={`Remove ${a.email}`}
                title="Remove admin"
              >
                <IconX size={14} />
              </button>
            )}
          </div>
        ))}
        {team.isLoading && <Empty>Loading…</Empty>}
      </div>
      <ErrorBox error={team.error ?? remove.error} />

      <div className="rounded-xl border border-dashed border-line bg-surface-2/40 p-4">
        <div className="text-[13px] font-extrabold">Invite an admin</div>
        <div className="text-[11.5px] text-muted">They get full access. You'll get a personal link to send them; they choose their own password.</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Email">
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Who is this? (optional)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Operations, Kudankulam" />
          </Field>
          <Btn kind="primary" busy={invite.isPending} disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={() => invite.mutate()}>
            Create invite
          </Btn>
        </div>
        <div className="mt-2">
          <ErrorBox error={invite.error} />
        </div>
        {link && (
          <div className="mt-3 rounded-xl border border-ok/30 bg-ok-bg/60 p-3">
            <div className="text-[12px] font-extrabold text-ok">Invite ready for {link.email}</div>
            <div className="mt-1 text-[11.5px] text-muted">Send this link privately (WhatsApp or email). It works once, for about 24 hours.</div>
            <div className="mt-2 flex gap-2">
              <input readOnly className={`${inputCls} font-mono text-[11px]`} value={link.link} onFocus={(e) => e.target.select()} />
              <Btn
                onClick={() => {
                  void navigator.clipboard?.writeText(link.link).then(() => setCopied(true));
                }}
              >
                {copied ? <IconCheck size={13} /> : <IconCopy size={13} />} {copied ? "Copied" : "Copy"}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type Rules = { deliveryFee: number; freeDeliveryAbove: number; shopAcceptMinutes: number; riderRadiusKm: number; riderMaxOrders: number; detourKm: number; weightTolerancePct: number; riderWaitAlertMin: number };

function RulesTab() {
  const r = useQuery<Rules>({ queryKey: ["admin", "rules"], queryFn: () => api("/admin/rules"), staleTime: 600_000 });
  const d = r.data;
  const groups: { title: string; items: [string, string, string][] }[] = d
    ? [
        {
          title: "Customers",
          items: [
            ["Delivery fee", inr(d.deliveryFee), "Added to each order below the free-delivery amount."],
            ["Free delivery above", inr(d.freeDeliveryAbove), "Orders at or above this pay no delivery fee."],
            ["Weight tolerance", `±${d.weightTolerancePct}%`, "How far a packed weight may differ from what was ordered."],
          ],
        },
        {
          title: "Shops",
          items: [["Time to accept an order", `${d.shopAcceptMinutes} min`, "After this the order moves to the next nearest shop."]],
        },
        {
          title: "Riders",
          items: [
            ["Offer radius", `${d.riderRadiusKm} km`, "Online riders this close to the shop see a packed order."],
            ["Orders at once", `${d.riderMaxOrders}`, "Most undelivered orders a rider can carry."],
            ["On-the-way detour", `${d.detourKm} km`, "A later stop may go first if it costs the earlier customer less than this."],
            ["Waiting-for-rider alert", `${d.riderWaitAlertMin} min`, "Packed orders waiting longer show in Notifications."],
          ],
        },
      ]
    : [];
  return (
    <div className="space-y-4">
      <ErrorBox error={r.error} />
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">{g.title}</div>
          <div className="divide-y divide-line rounded-xl border border-line">
            {g.items.map(([label, value, hint]) => (
              <div key={label} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold">{label}</div>
                  <div className="text-[11px] text-muted">{hint}</div>
                </div>
                <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[13px] font-extrabold tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {d && <div className="rounded-xl bg-surface-2/60 px-3 py-2 text-[11.5px] text-muted">These are fixed in the apps for now. Editing them here comes with rider pay and pricing controls.</div>}
    </div>
  );
}

type Activity = { id: number; action: string; target: string | null; detail: Record<string, unknown> | null; at: string; by: string };
const ACTION: Record<string, string> = {
  "order.cancel": "Cancelled an order",
  "order.reassign_shop": "Moved an order to another shop",
  "order.release_rider": "Released a rider from an order",
  "shop.enrol": "Enrolled a shop",
  "shop.update": "Updated a shop",
  "rider.enrol": "Enrolled a rider",
  "rider.update": "Updated a rider",
  "cash.verify": "Counted a cash hand-over",
  "admin.invite": "Invited an admin",
  "admin.remove": "Removed an admin",
  "admin.profile": "Updated their profile",
};
function describe(a: Activity) {
  const d = a.detail ?? {};
  const bits: string[] = [];
  if (typeof d.shop === "string") bits.push(d.shop);
  if (typeof d.name === "string") bits.push(d.name);
  if (typeof d.reason === "string") bits.push(`“${d.reason}”`);
  if (typeof d.received === "number") bits.push(`counted ${inr(d.received)} of ${inr(Number(d.submitted ?? 0))}`);
  if (a.action.startsWith("admin.") && a.target && a.action !== "admin.profile") bits.push(a.target);
  if (d.active === false) bits.push("set inactive");
  return bits.join(" · ");
}

function ActivityTab() {
  const q = useQuery<Activity[]>({ queryKey: ["admin", "activity"], queryFn: () => api("/admin/activity") });
  return (
    <div>
      <ErrorBox error={q.error} />
      <ol className="relative ml-1.5 border-l-2 border-line">
        {q.data?.map((a) => (
          <li key={a.id} className="mb-3 pl-4">
            <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
            <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
              <span className="font-extrabold">{ACTION[a.action] ?? a.action}</span>
              <span className="text-muted">by {a.by}</span>
              <span className="ml-auto text-[11px] text-muted">{when(a.at)}</span>
            </div>
            {describe(a) && <div className="text-[11.5px] text-muted">{describe(a)}</div>}
          </li>
        ))}
      </ol>
      {q.data && !q.data.length && <Empty>No changes yet.</Empty>}
      {q.isLoading && <Empty>Loading…</Empty>}
    </div>
  );
}
