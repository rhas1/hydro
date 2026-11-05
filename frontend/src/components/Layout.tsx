import {
  Ellipsis,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import type { Permission } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Logo, Waves } from "./Logo";
import { cx, Modal } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: Permission;
}

const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Package, perm: "inventory.view" },
  { to: "/sell", label: "New sale", icon: ShoppingCart, perm: "sales.create" },
  { to: "/sales", label: "Sales", icon: ReceiptText, perm: "sales.create" },
  { to: "/users", label: "Users", icon: Users, perm: "users.manage" },
  { to: "/settings", label: "Settings", icon: Settings, perm: "settings.manage" },
  { to: "/account", label: "My account", icon: UserRound },
];

const ROLE_LABELS = { admin: "Admin", manager: "Manager", sales: "Sales" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Layout() {
  const { user, can, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  if (!user) return null;

  const allowed = NAV.filter((item) => !item.perm || can(item.perm));
  const tab = (to: string) => allowed.find((item) => item.to === to);
  const bottomTabs = [tab("/"), tab("/inventory"), tab("/sell"), tab("/sales")].filter(Boolean) as NavItem[];
  const moreItems = allowed.filter((item) => !bottomTabs.includes(item));
  const moreActive = moreItems.some((item) => location.pathname.startsWith(item.to));

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-hidden bg-gradient-to-b from-abyss-900 to-abyss-950 lg:flex print:hidden">
        <Link to="/" className="px-6 pt-6 pb-8">
          <Logo light />
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {allowed.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-white/10 text-white shadow-inner ring-1 ring-white/10"
                    : "text-abyss-300 hover:bg-white/5 hover:text-white",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cx("size-5", isActive && "text-brand-300")} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="relative z-10 m-3 flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white">
            {initials(user.full_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
            <p className="text-xs text-abyss-300">{ROLE_LABELS[user.role]}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-abyss-300 hover:bg-white/10 hover:text-white" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
        <Waves className="h-24" />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-abyss-900 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:hidden print:hidden">
        <Link to="/">
          <Logo light />
        </Link>
        <Link
          to="/account"
          className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white"
          aria-label="My account"
        >
          {initials(user.full_name)}
        </Link>
      </header>

      <main className="px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:ml-64 lg:px-10 lg:pt-9 lg:pb-12 print:m-0 print:p-0">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
        <div className="mx-auto flex max-w-md items-end justify-around px-2">
          {bottomTabs.map((item) =>
            item.to === "/sell" ? (
              <NavLink key={item.to} to={item.to} className="-mt-5 flex flex-col items-center gap-1 px-2 pb-2">
                <span className="grid size-14 place-items-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-lg ring-4 shadow-brand-600/40 ring-white">
                  <item.icon className="size-6" />
                </span>
                <span className="text-[11px] font-semibold text-brand-700">Sell</span>
              </NavLink>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cx("flex min-w-16 flex-col items-center gap-1 px-2 pt-2.5 pb-2", isActive ? "text-brand-600" : "text-slate-500")
                }
              >
                <item.icon className="size-6" />
                <span className="text-[11px] font-semibold">{item.label}</span>
              </NavLink>
            ),
          )}
          <button
            onClick={() => setMoreOpen(true)}
            className={cx("flex min-w-16 flex-col items-center gap-1 px-2 pt-2.5 pb-2", moreActive ? "text-brand-600" : "text-slate-500")}
          >
            <Ellipsis className="size-6" />
            <span className="text-[11px] font-semibold">More</span>
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={user.full_name}>
        <div className="-mx-2 flex flex-col">
          {moreItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-abyss-800 hover:bg-slate-50"
            >
              <item.icon className="size-5 text-brand-600" />
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => {
              setMoreOpen(false);
              logout();
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-5" />
            Sign out
          </button>
        </div>
      </Modal>
    </div>
  );
}
