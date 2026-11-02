import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AdminMe } from "../auth/Gate";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/orders", label: "Orders", icon: "☰" },
  { to: "/shops", label: "Shops", icon: "⌂" },
  { to: "/riders", label: "Riders", icon: "➳" },
  { to: "/cash", label: "Cash", icon: "₹" },
];

/**
 * Responsive frame: sidebar on a laptop, bottom tabs on a phone.
 * Pages render inside and get the admin identity via outlet context.
 */
export function Shell() {
  const me = useOutletContext<AdminMe>();
  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-white">F</div>
          <div>
            <div className="font-extrabold leading-5">FreshCut</div>
            <div className="text-xs text-muted">Admin</div>
          </div>
        </div>
        <nav className="flex-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-xl px-4 py-2.5 font-bold ${isActive ? "bg-tint text-primary" : "text-muted hover:bg-surface-2"}`
              }
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <div className="truncate text-sm font-bold">{me.name ?? me.email}</div>
          <button onClick={() => void supabase.auth.signOut()} className="mt-1 text-sm font-bold text-bad">
            Sign out
          </button>
        </div>
      </aside>

      {/* Page */}
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <Outlet context={me} />
      </main>

      {/* Bottom tabs (phone) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${isActive ? "text-primary" : "text-muted"}`
            }
          >
            <span className="text-lg leading-5">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
