import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";

import type { Permission } from "./api/types";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LogoMark } from "./components/Logo";
import { EmptyState, LinkButton } from "./components/ui";
import Account from "./pages/Account";
import Categories from "./pages/Categories";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import ItemDetail from "./pages/ItemDetail";
import ItemForm from "./pages/ItemForm";
import Login from "./pages/Login";
import NewSale from "./pages/NewSale";
import SaleDetail from "./pages/SaleDetail";
import Sales from "./pages/Sales";
import Settings from "./pages/Settings";
import UsersPage from "./pages/Users";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-abyss-900">
        <LogoMark className="size-14 animate-pulse" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Allow({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (can(perm)) return children;
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don't have access to this page"
      text="Ask an admin if you need it."
      action={<LinkButton to="/" variant="secondary">Go home</LinkButton>}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Allow perm="inventory.view"><Inventory /></Allow>} />
        <Route path="inventory/new" element={<Allow perm="inventory.manage"><ItemForm /></Allow>} />
        <Route path="inventory/categories" element={<Allow perm="inventory.manage"><Categories /></Allow>} />
        <Route path="inventory/:id" element={<Allow perm="inventory.view"><ItemDetail /></Allow>} />
        <Route path="inventory/:id/edit" element={<Allow perm="inventory.manage"><ItemForm /></Allow>} />
        <Route path="sell" element={<Allow perm="sales.create"><NewSale /></Allow>} />
        <Route path="sales" element={<Allow perm="sales.create"><Sales /></Allow>} />
        <Route path="sales/:id" element={<Allow perm="sales.create"><SaleDetail /></Allow>} />
        <Route path="users" element={<Allow perm="users.manage"><UsersPage /></Allow>} />
        <Route path="settings" element={<Allow perm="settings.manage"><Settings /></Allow>} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
