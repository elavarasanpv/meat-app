import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AdminMe } from "../auth/Gate";
import { useAlerts, type Alert } from "../lib/alerts";
import { Avatar, ago, useDismiss } from "../ui/kit";
import {
  IconBan,
  IconBell,
  IconCash,
  IconChat,
  IconChevronDown,
  IconGrid,
  IconHistory,
  IconPackage,
  IconLogout,
  IconOrders,
  IconClock,
  IconRider,
  IconSearch,
  IconSettings,
  IconShop,
  IconTag,
  IconStar,
  IconShopOff,
  IconUser,
} from "../ui/icons";

const SECTIONS: { title: string; items: { to: string; label: string; Icon: typeof IconGrid }[] }[] = [
  { title: "Dashboard", items: [{ to: "/", label: "Overview", Icon: IconGrid }] },
  {
    title: "Operations",
    items: [
      { to: "/orders", label: "Orders", Icon: IconOrders },
      { to: "/shops", label: "Shops", Icon: IconShop },
      { to: "/riders", label: "Riders", Icon: IconRider },
      { to: "/cash", label: "Cash", Icon: IconCash },
      { to: "/support", label: "Support", Icon: IconChat },
      { to: "/offers", label: "Offers", Icon: IconTag },
      { to: "/pricing", label: "Pricing", Icon: IconCash },
      { to: "/ratings", label: "Ratings", Icon: IconStar },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/notifications", label: "Notifications", Icon: IconBell },
      { to: "/settings", label: "Settings", Icon: IconSettings },
    ],
  },
];
const TABS = SECTIONS.slice(0, 2).flatMap((s) => s.items);

/** The admin's display name: profile name, else the part of the email before @. */
export function displayName(me: AdminMe) {
  if (me.name) return me.name;
  const local = me.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\d+$/, "");
  return (local.charAt(0).toUpperCase() + local.slice(1)).trim() || "Admin";
}

/** Compact frame: dark sidebar with sections (laptop), top bar, bottom tabs (phone). */
export function Shell() {
  const me = useOutletContext<AdminMe>();
  const { unread } = useAlerts();
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-ink text-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-extrabold">F</div>
          <span className="text-[17px] font-extrabold tracking-tight">FreshCut</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3">
          {SECTIONS.map((s) => (
            <div key={s.title} className="mb-4">
              <div className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/40">{s.title}</div>
              {s.items.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-bold transition ${isActive ? "bg-white text-ink shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"}`
                  }
                >
                  <Icon size={17} />
                  <span className="flex-1">{label}</span>
                  {to === "/notifications" && unread > 0 && <span className="rounded-full bg-primary px-1.5 text-[10.5px] font-extrabold text-white">{unread}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button onClick={() => void supabase.auth.signOut()} className="flex items-center gap-2 px-6 py-4 text-[13px] font-bold text-white/60 hover:text-white">
          <IconLogout size={16} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar me={me} />
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <Outlet context={me} />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface md:hidden">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${isActive ? "text-primary" : "text-muted"}`}>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function TopBar({ me }: { me: AdminMe }) {
  const nav = useNavigate();
  const search = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-4 border-b border-line bg-ground/90 px-4 backdrop-blur md:px-6">
      <Link to="/" className="flex items-center gap-2 md:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[13px] font-extrabold text-white">F</div>
        <span className="text-[15px] font-extrabold">FreshCut</span>
      </Link>
      <form
        className="hidden w-full max-w-md md:block"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          nav(`/orders?filter=all&q=${encodeURIComponent(q.trim())}`);
          setQ("");
          search.current?.blur();
        }}
      >
        <label className="flex items-center gap-2 h-[40px] rounded-xl border border-line bg-surface px-3 text-muted transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
          <IconSearch size={15} />
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/70" placeholder="Search an order ID, e.g. MT-1102-0016" />
          <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[10.5px] font-bold lg:block">⌘K</kbd>
        </label>
      </form>

      <div className="ml-auto flex items-center gap-[10px]">
        <BellMenu />
        <Link to="/settings" aria-label="Settings" title="Settings" className="hidden h-[38px] w-[38px] items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:border-muted/40 hover:text-ink sm:flex">
          <IconSettings size={18} />
        </Link>
        <span className="mx-[6px] hidden h-[28px] w-px bg-line sm:block" />
        <ProfileMenu me={me} />
      </div>
    </header>
  );
}

/** One look per alert type: its own icon, colour and short label. */
export const KIND: Record<Alert["kind"], { Icon: typeof IconShop; icon: string; chip: string; dot: string; label: string }> = {
  no_shop: { Icon: IconShop, icon: "bg-[#FDE2E2] text-[#C62828]", chip: "bg-[#FDE2E2] text-[#C62828]", dot: "bg-[#C62828]", label: "No shop" },
  late: { Icon: IconClock, icon: "bg-[#FBEBD6] text-[#B4620A]", chip: "bg-[#FBEBD6] text-[#B4620A]", dot: "bg-[#B4620A]", label: "Running late" },
  waiting_rider: { Icon: IconRider, icon: "bg-[#E8E5FA] text-[#5B4BC9]", chip: "bg-[#E8E5FA] text-[#5B4BC9]", dot: "bg-[#5B4BC9]", label: "Needs a rider" },
  cash_count: { Icon: IconCash, icon: "bg-[#DDF3E6] text-[#1E8A4F]", chip: "bg-[#DDF3E6] text-[#1E8A4F]", dot: "bg-[#1E8A4F]", label: "Cash to count" },
  failed: { Icon: IconPackage, icon: "bg-[#FBEAF0] text-[#B23A5C]", chip: "bg-[#FBEAF0] text-[#B23A5C]", dot: "bg-[#B23A5C]", label: "Delivery failed" },
  cancelled: { Icon: IconBan, icon: "bg-[#EDEAE6] text-[#6E625B]", chip: "bg-[#EDEAE6] text-[#6E625B]", dot: "bg-[#6E625B]", label: "Cancelled" },
  ticket: { Icon: IconChat, icon: "bg-[#FDE6DF] text-[#E4461F]", chip: "bg-[#FDE6DF] text-[#E4461F]", dot: "bg-[#E4461F]", label: "Support" },
  shop_declined: { Icon: IconShopOff, icon: "bg-[#DFEAFB] text-[#2F6FD1]", chip: "bg-[#DFEAFB] text-[#2F6FD1]", dot: "bg-[#2F6FD1]", label: "Shop declined" },
};

export function AlertRow({ a, fresh, onClick, compact }: { a: Alert; fresh: boolean; onClick?: () => void; compact?: boolean }) {
  const k = KIND[a.kind];
  return (
    <Link to={a.link} onClick={onClick} className={`flex gap-3 rounded-xl px-3 transition hover:bg-surface-2/70 ${compact ? "py-2" : "py-2.5"} ${fresh ? "bg-tint/30" : ""}`}>
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${k.icon}`}>
        <k.Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-extrabold">{a.title}</span>
          {(a.open || fresh) && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${k.dot}`} />}
        </span>
        <span className={`block text-[11.5px] text-muted ${compact ? "truncate" : ""}`}>{a.body}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted/80">
          <span className={`rounded-md px-1.5 py-px text-[10px] font-extrabold ${k.chip}`}>{k.label}</span>
          {a.open && a.severity === "urgent" && <span className="font-bold text-[#C62828]">Urgent</span>}
          <span>{ago(a.at)}</span>
        </span>
      </span>
    </Link>
  );
}

function summary(open: number, fresh: number) {
  if (!open && !fresh) return "You're all caught up";
  const parts = [];
  if (open) parts.push(`${open} need${open === 1 ? "s" : ""} action`);
  if (fresh) parts.push(`${fresh} new update${fresh === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function BellMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const { alerts, unread, isNew, markSeen, isLoading } = useAlerts();
  const loc = useLocation();
  useEffect(close, [loc.pathname, loc.search, close]);
  const top = alerts.slice(0, 6);

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}
        title="Notifications"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-[38px] w-[38px] items-center justify-center rounded-xl border bg-surface transition ${open ? "border-primary text-primary" : "border-line text-muted hover:border-muted/40 hover:text-ink"}`}
      >
        <IconBell size={18} />
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-ground bg-primary px-1 text-[10px] font-extrabold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[64px] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="text-[14px] font-extrabold">Notifications</div>
              <div className="text-[11px] text-muted">{summary(alerts.filter((a) => a.open).length, alerts.filter(isNew).length)}</div>
            </div>
            {alerts.some((a) => isNew(a)) && (
              <button onClick={markSeen} className="text-[11.5px] font-bold text-primary">
                Mark updates read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {top.map((a) => (
              <AlertRow key={a.id} a={a} fresh={isNew(a)} compact onClick={close} />
            ))}
            {!isLoading && !top.length && <div className="px-3 py-8 text-center text-[12px] text-muted">Nothing needs you right now.</div>}
          </div>
          <Link to="/notifications" onClick={close} className="block border-t border-line py-2.5 text-center text-[12px] font-extrabold text-primary hover:bg-surface-2/60">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ me }: { me: AdminMe }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  const loc = useLocation();
  useEffect(close, [loc.pathname, loc.search, close]);
  const name = displayName(me);
  const [since, setSince] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSince(data.user?.last_sign_in_at ?? null));
  }, []);

  const item = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-ink transition hover:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex h-[44px] items-center gap-[10px] rounded-xl pl-[4px] pr-[10px] transition ${open ? "bg-surface shadow-sm ring-1 ring-line" : "hover:bg-surface/70"}`}>
        <span className="relative">
          <Avatar name={name} size={36} />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ground bg-ok" />
        </span>
        <span className="hidden max-w-[140px] text-left leading-tight sm:block">
          <span className="block truncate text-[13.5px] font-extrabold">{name}</span>
          <span className="block text-[11px] text-muted">Administrator</span>
        </span>
        <IconChevronDown size={14} className={`hidden text-muted transition sm:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[64px] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[288px]">
          <div className="bg-[linear-gradient(135deg,#FDE6DF,#FBF3D6)] px-4 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <Avatar name={name} size={48} ring />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-extrabold">{name}</div>
                <div className="truncate text-[11.5px] text-muted">{me.email}</div>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-extrabold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Admin · full access
                </span>
              </div>
            </div>
            {since && <div className="mt-3 text-[10.5px] text-muted">Signed in {ago(since)}</div>}
          </div>
          <div className="p-1.5">
            <Link to="/settings?tab=profile" className={item}>
              <IconUser size={15} className="text-muted" /> My profile
            </Link>
            <Link to="/settings" className={item}>
              <IconSettings size={15} className="text-muted" /> Settings
            </Link>
            <Link to="/notifications" className={item}>
              <IconBell size={15} className="text-muted" /> Notifications
            </Link>
            <Link to="/settings?tab=activity" className={item}>
              <IconHistory size={15} className="text-muted" /> Activity log
            </Link>
          </div>
          <div className="border-t border-line p-1.5">
            <button onClick={() => void supabase.auth.signOut()} className={`${item} w-full text-bad hover:bg-tint`}>
              <IconLogout size={15} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Page title row: title + subtitle left, actions right. */
export function PageHeader({ title, sub, actions }: { title: React.ReactNode; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 pt-5 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[20px] font-extrabold leading-tight">{title}</h1>
        {sub && <div className="text-[12px] text-muted">{sub}</div>}
      </div>
      {actions}
    </div>
  );
}
