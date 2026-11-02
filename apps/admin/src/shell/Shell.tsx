import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AdminMe } from "../auth/Gate";
import { IconBell, IconCash, IconGrid, IconLogout, IconOrders, IconRider, IconSearch, IconSettings, IconShop } from "../ui/icons";

const SECTIONS: { title: string; items: { to: string; label: string; Icon: typeof IconGrid }[] }[] = [
  { title: "Dashboard", items: [{ to: "/", label: "Overview", Icon: IconGrid }] },
  {
    title: "Operations",
    items: [
      { to: "/orders", label: "Orders", Icon: IconOrders },
      { to: "/shops", label: "Shops", Icon: IconShop },
      { to: "/riders", label: "Riders", Icon: IconRider },
      { to: "/cash", label: "Cash", Icon: IconCash },
    ],
  },
];
const TABS = SECTIONS.flatMap((s) => s.items);

/** The admin's display name: profile name, else the part of the email before @. */
export function displayName(me: AdminMe) {
  if (me.name) return me.name;
  const local = me.email.split("@")[0].replace(/[._-]+/g, " ");
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Compact frame: dark sidebar with sections (laptop), slim header, bottom tabs (phone). */
export function Shell() {
  const me = useOutletContext<AdminMe>();
  const name = displayName(me);
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-56 shrink-0 flex-col bg-ink text-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-extrabold">F</div>
          <span className="text-[17px] font-extrabold tracking-tight">FreshCut</span>
        </div>
        <nav className="flex-1 px-3">
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
                  {label}
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
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-ground/90 px-4 py-2.5 backdrop-blur md:px-6">
          <label className="hidden flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-muted md:flex md:max-w-sm">
            <IconSearch size={15} />
            <input className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70" placeholder="Search anything…" />
            <kbd className="rounded border border-line px-1 text-[10px]">⌘K</kbd>
          </label>
          <div className="flex-1 md:hidden">
            <span className="text-[15px] font-extrabold">FreshCut</span>
          </div>
          <IconBtn label="Notifications" dot><IconBell size={16} /></IconBtn>
          <IconBtn label="Settings"><IconSettings size={16} /></IconBtn>
          <div className="ml-1 flex items-center gap-2">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-tint text-sm font-extrabold text-primary">
              {name.charAt(0)}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ground bg-ok" />
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-[13px] font-extrabold">{name}</div>
              <div className="text-[11px] text-muted">Admin</div>
            </div>
          </div>
        </header>
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

function IconBtn({ label, dot, children }: { label: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <button aria-label={label} className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:text-ink">
      {children}
      {dot && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
    </button>
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
