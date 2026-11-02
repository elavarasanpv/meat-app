import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AdminMe } from "../auth/Gate";
import { IconBell, IconCash, IconGrid, IconLogout, IconOrders, IconRider, IconSearch, IconSettings, IconShop } from "../ui/icons";

const NAV = [
  { to: "/", label: "Overview", Icon: IconGrid },
  { to: "/orders", label: "Orders", Icon: IconOrders },
  { to: "/shops", label: "Shops", Icon: IconShop },
  { to: "/riders", label: "Riders", Icon: IconRider },
  { to: "/cash", label: "Cash", Icon: IconCash },
];

/** The admin's display name: profile name, else the part of the email before @. */
export function displayName(me: AdminMe) {
  if (me.name) return me.name;
  const local = me.email.split("@")[0].replace(/[._-]+/g, " ");
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Responsive frame: avatar sidebar on a laptop, bottom tabs on a phone. */
export function Shell() {
  const me = useOutletContext<AdminMe>();
  const name = displayName(me);
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-7 py-7">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-extrabold text-white">F</div>
          <span className="text-xl font-extrabold">FreshCut</span>
        </div>
        <div className="flex flex-col items-center px-6 pb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-tint text-3xl font-extrabold text-primary ring-4 ring-surface shadow-md">
            {name.charAt(0)}
          </div>
          <div className="mt-3 text-lg font-extrabold">{name}</div>
          <div className="text-sm text-muted">Owner</div>
        </div>
        <div className="mx-7 border-t border-line" />
        <nav className="flex-1 px-4 py-4">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] font-bold transition ${isActive ? "bg-tint text-primary" : "text-muted hover:bg-surface-2 hover:text-ink"}`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mx-7 border-t border-line" />
        <button onClick={() => void supabase.auth.signOut()} className="flex items-center gap-3 px-8 py-6 text-[15px] font-bold text-muted hover:text-bad">
          Sign out <IconLogout size={18} />
        </button>
      </aside>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <Outlet context={me} />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface md:hidden">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-bold ${isActive ? "text-primary" : "text-muted"}`}
          >
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Page header in the reference style: big greeting left, search + icon buttons right. */
export function PageHeader({ title, sub }: { title: React.ReactNode; sub?: string }) {
  return (
    <header className="flex flex-wrap items-center gap-3 px-5 pt-6 md:px-8 md:pt-8">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold md:text-3xl">{title}</h1>
        {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
      </div>
      <label className="hidden items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-muted md:flex">
        <IconSearch size={18} />
        <input className="w-44 bg-transparent outline-none placeholder:text-muted/70" placeholder="Search order, shop, rider" />
      </label>
      <button aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink">
        <IconBell size={20} />
        <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" />
      </button>
      <button aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink">
        <IconSettings size={20} />
      </button>
    </header>
  );
}
