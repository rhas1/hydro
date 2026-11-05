import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api, setToken } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader } from "../components/ui";

const PERMISSION_LABELS: Record<string, string> = {
  "inventory.view": "View inventory",
  "inventory.manage": "Add & edit items, receive stock",
  "inventory.view_cost": "See cost prices",
  "sales.create": "Make sales",
  "sales.view_all": "See everyone's sales",
  "sales.discount": "Change prices & give discounts",
  "sales.void": "Void sales",
  "users.manage": "Manage users",
  "settings.manage": "Edit business settings",
};

export default function Account() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () =>
      api<{ access_token: string }>("/auth/change-password", {
        method: "POST",
        body: { current_password: current, new_password: next },
      }),
    onSuccess: ({ access_token }) => {
      // Older sessions (other devices) are now signed out; keep this one.
      setToken(access_token);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password changed");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setFormError("New passwords don't match");
    setFormError(null);
    change.mutate();
  }

  if (!user) return null;

  return (
    <>
      <PageHeader
        title="My account"
        actions={
          <Button variant="secondary" icon={LogOut} onClick={logout}>
            Sign out
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="p-5 sm:p-6">
          <p className="text-lg font-semibold">{user.full_name}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
          <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">You can</p>
          <div className="flex flex-wrap gap-1.5">
            {user.permissions.map((p) => (
              <Badge key={p} tone="brand">
                {PERMISSION_LABELS[p] ?? p}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            <h2 className="font-semibold">Change password</h2>
            <Field label="Current password">
              {(id) => <Input id={id} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}
            </Field>
            <Field label="New password" hint="8–72 characters. Changing it signs you out on other devices.">
              {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} />}
            </Field>
            <Field label="Repeat new password">
              {(id) => <Input id={id} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
            </Field>
            <ErrorBox error={formError ?? change.error} />
            <Button type="submit" loading={change.isPending}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
