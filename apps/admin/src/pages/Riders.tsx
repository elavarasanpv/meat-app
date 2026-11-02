import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconEdit, IconMap, IconPhone, IconPlus } from "../ui/icons";
import { Btn, Chip, Drawer, Empty, ErrorBox, Field, Section, Segments, ago, inputCls, inr, phone10 } from "../ui/kit";

type Rider = {
  id: string;
  name: string | null;
  phone: string | null;
  vehicle: string | null;
  isOnline: boolean;
  isActive: boolean;
  cash: number;
  carrying: number;
  today: { trips: number; delivered: number; failed: number; km: number };
  lastSeen: string | null;
  location: { lat: number; lng: number } | null;
};

export function Riders() {
  const riders = useQuery<Rider[]>({ queryKey: ["admin", "riders"], queryFn: () => api("/admin/riders"), refetchInterval: 20_000 });
  const [show, setShow] = useState<"all" | "online" | "inactive">("all");
  const [editing, setEditing] = useState<Rider | "new" | null>(null);
  const all = riders.data ?? [];
  const list = all.filter((r) => (show === "online" ? r.isOnline && r.isActive : show === "inactive" ? !r.isActive : r.isActive));

  return (
    <div className="pb-6">
      <PageHeader
        title="Riders"
        sub="Who's online, what they carry, today's work and cash in hand."
        actions={
          <Btn kind="primary" onClick={() => setEditing("new")}>
            <IconPlus size={14} /> Enrol rider
          </Btn>
        }
      />
      <div className="px-4 pt-4 md:px-6">
        <Segments
          value={show}
          onChange={setShow}
          items={[
            { id: "all", label: "Active", count: all.filter((r) => r.isActive).length },
            { id: "online", label: "Online now", count: all.filter((r) => r.isOnline && r.isActive).length },
            { id: "inactive", label: "Inactive", count: all.filter((r) => !r.isActive).length },
          ]}
        />
      </div>
      <div className="px-4 pt-3 md:px-6">
        <div className="card overflow-hidden p-0">
          <ErrorBox error={riders.error} />
          <div className="hidden grid-cols-[1.5fr_.9fr_.8fr_1.4fr_.8fr_auto] gap-3 border-b border-line bg-surface-2/60 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-muted md:grid">
            <span>Rider</span>
            <span>Status</span>
            <span>Carrying</span>
            <span>Today</span>
            <span className="text-right">Cash</span>
            <span className="w-24" />
          </div>
          {list.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-[12.5px] last:border-0 md:grid-cols-[1.5fr_.9fr_.8fr_1.4fr_.8fr_auto]">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-[13px] font-extrabold text-primary">
                  {(r.name ?? "R").charAt(0)}
                  {r.isOnline && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-ok" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold">{r.name ?? "Rider"}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    {phone10(r.phone)}
                    {r.vehicle && ` · ${r.vehicle}`}
                  </div>
                </div>
              </div>
              <div>
                {!r.isActive ? <Chip tone="mute">Inactive</Chip> : r.isOnline ? <Chip tone="ok">Online</Chip> : <Chip tone="mute">Offline</Chip>}
                {r.lastSeen && <div className="mt-0.5 text-[10.5px] text-muted">seen {ago(r.lastSeen)}</div>}
              </div>
              <div className="hidden md:block">{r.carrying ? <span className="font-bold">{r.carrying} order{r.carrying > 1 ? "s" : ""}</span> : <span className="text-muted">—</span>}</div>
              <div className="col-span-2 text-muted md:col-span-1">
                <span className="font-bold text-ink">{r.today.delivered}</span> delivered
                {r.today.failed > 0 && <span className="text-bad"> · {r.today.failed} failed</span>} · {r.today.trips} trips · {r.today.km} km
              </div>
              <div className={`hidden text-right font-extrabold md:block ${r.cash > 0 ? "text-primary" : "text-muted"}`}>{inr(r.cash)}</div>
              <div className="col-span-2 flex justify-end gap-1.5 md:col-span-1 md:w-24">
                {r.location && (
                  <a aria-label="Last location" title="Last location" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.location.lat},${r.location.lng}`} className="rounded-md border border-line p-1.5 text-muted hover:text-ink">
                    <IconMap size={14} />
                  </a>
                )}
                {r.phone && (
                  <a aria-label="Call" title="Call" href={`tel:+91${phone10(r.phone)}`} className="rounded-md border border-line p-1.5 text-muted hover:text-ink">
                    <IconPhone size={14} />
                  </a>
                )}
                <button aria-label="Edit" title="Edit" onClick={() => setEditing(r)} className="rounded-md border border-line p-1.5 text-muted hover:text-ink">
                  <IconEdit size={14} />
                </button>
              </div>
            </div>
          ))}
          {riders.data && !list.length && <Empty>{show === "all" ? "No riders yet. Enrol the first one." : "Nobody here right now."}</Empty>}
          {riders.isLoading && <Empty>Loading…</Empty>}
        </div>
      </div>
      {editing && <RiderForm rider={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RiderForm({ rider, onClose }: { rider: Rider | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(phone10(rider?.phone ?? null));
  const [name, setName] = useState(rider?.name ?? "");
  const [vehicle, setVehicle] = useState(rider?.vehicle ?? "");
  const [active, setActive] = useState(rider?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api(rider ? `/admin/riders/${rider.id}` : "/admin/riders", {
        method: rider ? "PATCH" : "POST",
        body: { phone, name, vehicle: vehicle || null, ...(rider ? { isActive: active } : {}) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    },
  });
  const submit = () => {
    setError(null);
    if (!/^[6-9]\d{9}$/.test(phone)) return setError("Enter a 10-digit mobile number.");
    if (name.trim().length < 2) return setError("Enter the rider's name.");
    if (rider && !active && rider.cash > 0 && !confirm(`${rider.name} still holds ${inr(rider.cash)} cash. Deactivate anyway?`)) return;
    save.mutate();
  };
  return (
    <Drawer
      title={rider ? `Edit ${rider.name ?? "rider"}` : "Enrol a rider"}
      sub="The rider signs in to the FreshCut Partner app with this mobile number (OTP)."
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto self-center text-[12px] font-bold text-bad">{error}</span>}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" busy={save.isPending} onClick={submit}>
            {rider ? "Save changes" : "Enrol rider"}
          </Btn>
        </>
      }
    >
      <ErrorBox error={save.error} />
      <Section title="Rider">
        <div className="space-y-3">
          <Field label="Full name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Selvam" autoFocus />
          </Field>
          <Field label="Mobile (login)" hint="10 digits. This is the Partner app login, and customers call this number.">
            <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-primary">
              <span className="pl-2.5 text-[13px] text-muted">+91</span>
              <input className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="9876543210" />
            </div>
          </Field>
          <Field label="Vehicle number (optional)">
            <input className={inputCls} value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} placeholder="TN 74 AB 1234" />
          </Field>
          {rider && (
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active. Untick to stop this rider getting orders and take them offline.
            </label>
          )}
        </div>
      </Section>
      {!rider && (
        <div className="rounded-xl border border-line bg-surface p-3 text-[12px] text-muted">
          <div className="mb-1 font-bold text-ink">What happens next</div>
          The rider installs the FreshCut Partner app, signs in with this number and the OTP, and lands on the rider screens. They go online to start getting offers within 5 km of a packed order.
        </div>
      )}
    </Drawer>
  );
}
