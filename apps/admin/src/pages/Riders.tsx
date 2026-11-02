import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../shell/Shell";
import { IconEdit, IconMap, IconPhone, IconPlus } from "../ui/icons";
import { RiderLiveMap, type LatLng, type Stop } from "../ui/RiderLiveMap";
import { RiderStats } from "./RiderStats";
import { Avatar, Btn, Chip, Drawer, Empty, ErrorBox, Field, Modal, Section, Segments, StatusChip, ago, clock, inputCls, inr, phone10 } from "../ui/kit";

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
  location: LatLng | null;
};
type Live = {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  isOnline: boolean;
  cash: number;
  onlineSince: string | null;
  position: (LatLng & { heading: number | null; speedKmh: number | null; at: string }) | null;
  trail: [number, number][];
  trailKm: number;
  stops: (Stop & { amount: number; address: string | null })[];
};

export function Riders() {
  const riders = useQuery<Rider[]>({ queryKey: ["admin", "riders"], queryFn: () => api("/admin/riders"), refetchInterval: 20_000 });
  const [show, setShow] = useState<"all" | "online" | "inactive">("all");
  const [editing, setEditing] = useState<Rider | "new" | null>(null);
  const [live, setLive] = useState<Rider | null>(null);
  const all = riders.data ?? [];
  const list = all.filter((r) => (show === "online" ? r.isOnline && r.isActive : show === "inactive" ? !r.isActive : r.isActive));
  const cols = "md:grid-cols-[minmax(200px,1.6fr)_120px_110px_minmax(180px,1.4fr)_96px_120px]";

  return (
    <div className="pb-6">
      <PageHeader
        title="Riders"
        sub="Who's online, what they carry, today's work and cash in hand. Tap a rider for their live map and 30-day performance."
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
          <div className={`hidden gap-3 border-b border-line bg-surface-2/60 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-muted md:grid ${cols}`}>
            <span>Rider</span>
            <span>Status</span>
            <span>Carrying</span>
            <span>Today</span>
            <span className="text-right">Cash</span>
            <span className="text-right">Actions</span>
          </div>
          {list.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setLive(r)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setLive(r))}
              className={`group grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-3 text-[12.5px] outline-none transition last:border-0 hover:bg-tint/30 focus-visible:bg-tint/30 ${cols} md:gap-y-0`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative shrink-0">
                  <Avatar name={r.name ?? "R"} size={36} />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${r.isOnline ? "bg-ok" : "bg-line"}`} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-extrabold">{r.name ?? "Rider"}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    {phone10(r.phone)}
                    {r.vehicle && ` · ${r.vehicle}`}
                  </div>
                </div>
              </div>
              <div className="justify-self-end md:justify-self-start">
                {!r.isActive ? <Chip tone="mute">Inactive</Chip> : r.isOnline ? <Chip tone="ok">● Online</Chip> : <Chip tone="mute">Offline</Chip>}
                {r.lastSeen && <div className="mt-0.5 text-[10.5px] text-muted">seen {ago(r.lastSeen)}</div>}
              </div>
              <div className="hidden md:block">{r.carrying ? <Chip tone="info">{r.carrying} order{r.carrying > 1 ? "s" : ""}</Chip> : <span className="text-muted">—</span>}</div>
              <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted md:col-span-1">
                <span>
                  <b className="text-ink">{r.today.delivered}</b> delivered
                </span>
                {r.today.failed > 0 && <span className="text-bad">{r.today.failed} failed</span>}
                <span>{r.today.trips} trips</span>
                <span>{r.today.km} km</span>
                {r.carrying > 0 && <span className="md:hidden">carrying {r.carrying}</span>}
              </div>
              <div className={`hidden text-right text-[13px] font-extrabold tabular-nums md:block ${r.cash > 0 ? "text-primary" : "text-muted"}`}>{inr(r.cash)}</div>
              <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1" onClick={(e) => e.stopPropagation()}>
                {r.cash > 0 && <span className="mr-auto text-[12px] font-extrabold text-primary md:hidden">{inr(r.cash)}</span>}
                <ActionBtn label="Watch live" onClick={() => setLive(r)}>
                  <IconMap size={14} />
                </ActionBtn>
                {r.phone && (
                  <a aria-label="Call" title="Call" href={`tel:+91${phone10(r.phone)}`} className={actionCls}>
                    <IconPhone size={14} />
                  </a>
                )}
                <ActionBtn label="Edit" onClick={() => setEditing(r)}>
                  <IconEdit size={14} />
                </ActionBtn>
              </div>
            </div>
          ))}
          {riders.data && !list.length && <Empty>{show === "all" ? "No riders yet. Enrol the first one." : "Nobody here right now."}</Empty>}
          {riders.isLoading && <Empty>Loading…</Empty>}
        </div>
      </div>
      {editing && <RiderForm rider={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {live && <LiveModal rider={live} onClose={() => setLive(null)} onEdit={() => (setLive(null), setEditing(live))} />}
    </div>
  );
}

const actionCls = "flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:border-primary hover:text-primary";
function ActionBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={actionCls}>
      {children}
    </button>
  );
}

function LiveModal({ rider, onClose, onEdit }: { rider: Rider; onClose: () => void; onEdit: () => void }) {
  const [view, setView] = useState<"live" | "stats">("live");
  const q = useQuery<Live>({ queryKey: ["admin", "rider-live", rider.id], queryFn: () => api(`/admin/riders/${rider.id}/live`), refetchInterval: view === "live" ? 10_000 : false });
  const d = q.data;
  const name = d?.name ?? rider.name ?? "Rider";
  const stale = d?.position ? Date.now() - new Date(d.position.at).getTime() > 5 * 60_000 : false;
  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {name}
          {d ? d.isOnline ? <Chip tone="ok">● Online{d.onlineSince ? ` since ${clock(d.onlineSince)}` : ""}</Chip> : <Chip tone="mute">Offline</Chip> : null}
        </span>
      }
      sub={`${phone10(d?.phone ?? rider.phone)}${(d?.vehicle ?? rider.vehicle) ? ` · ${d?.vehicle ?? rider.vehicle}` : ""}${view === "live" ? " · refreshes every 10 s" : ""}`}
      aside={
        <div className="hidden gap-1.5 sm:flex">
          {rider.phone && (
            <a href={`tel:+91${phone10(rider.phone)}`} className={actionCls} aria-label="Call" title="Call">
              <IconPhone size={14} />
            </a>
          )}
          <ActionBtn label="Edit" onClick={onEdit}>
            <IconEdit size={14} />
          </ActionBtn>
        </div>
      }
    >
      <div className="border-b border-line px-4 py-2.5 md:px-5">
        <Segments
          value={view}
          onChange={setView}
          items={[
            { id: "live", label: "Live now" },
            { id: "stats", label: "Performance · 30 days" },
          ]}
        />
      </div>
      {view === "stats" ? (
        <RiderStats id={rider.id} />
      ) : (
        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)] md:p-5">
          <div>
            <RiderLiveMap position={d?.position ?? rider.location} trail={d?.trail ?? []} stops={d?.stops ?? []} height={360} />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary" /> Rider</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-ink" /> Shop</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#2F6FD1]" /> Customer stop</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" /> Today's route</span>
              {d?.position && (
                <span className={`ml-auto font-bold ${stale ? "text-warn" : "text-ok"}`}>
                  {stale ? "Last seen" : "Updated"} {ago(d.position.at)}
                  {d.position.speedKmh != null && !stale ? ` · ${Math.round(d.position.speedKmh)} km/h` : ""}
                </span>
              )}
              {d && !d.position && <span className="ml-auto font-bold text-warn">No location yet. The rider's app sends one once they go online.</span>}
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Today" value={`${d?.trailKm ?? rider.today.km} km`} />
              <Stat label="Delivered" value={String(rider.today.delivered)} />
              <Stat label="Cash held" value={inr(d?.cash ?? rider.cash)} tone={(d?.cash ?? rider.cash) > 0 ? "primary" : undefined} />
            </div>
            <Section title={`Carrying now (${d?.stops.length ?? rider.carrying})`}>
              <div className="divide-y divide-line rounded-xl border border-line">
                {d?.stops.map((s, i) => (
                  <Link key={s.id} to={`/orders?id=${s.id}`} className="flex items-start gap-2.5 px-3 py-2 text-[12.5px] hover:bg-surface-2/60">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2F6FD1] text-[10.5px] font-extrabold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-extrabold">{s.displayId}</span>
                        <StatusChip status={s.status} />
                        <span className="ml-auto font-bold">{inr(s.amount)}</span>
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">
                        {s.customer}
                        {s.address ? ` · ${s.address}` : ""}
                      </span>
                      {s.shop && <span className="block truncate text-[11px] text-muted">from {s.shop.name}</span>}
                    </span>
                  </Link>
                ))}
                {d && !d.stops.length && <Empty>Not carrying anything right now.</Empty>}
                {!d && <Empty>Loading…</Empty>}
              </div>
            </Section>
            <ErrorBox error={q.error} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className="rounded-xl bg-surface-2/70 px-3 py-2">
      <div className={`text-[15px] font-extrabold tabular-nums ${tone === "primary" ? "text-primary" : ""}`}>{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
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
