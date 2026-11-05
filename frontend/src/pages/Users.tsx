import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, cx, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Toggle } from "../components/ui";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "sales", label: "Sales", description: "Makes sales and sees their own invoices. Sees inventory but not costs; can't change prices." },
  { value: "manager", label: "Manager", description: "Everything in Sales, plus manages inventory, gives discounts, voids sales and sees all sales." },
  { value: "admin", label: "Admin", description: "Full access, including users and business settings." },
];

const ROLE_TONE = { admin: "navy", manager: "brand", sales: "neutral" } as const;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Who can sign in, and what they can do."
        actions={
          <Button icon={UserPlus} onClick={() => setEditing("new")}>
            Add user
          </Button>
        }
      />
      <ErrorBox error={error} />
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {isLoading && <Spinner />}
        {data?.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => setEditing(user)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5"
          >
            <div
              className={cx(
                "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white",
                user.is_active ? "bg-gradient-to-br from-brand-400 to-brand-700" : "bg-slate-300",
              )}
            >
              {user.full_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cx("truncate font-medium", !user.is_active && "text-slate-400")}>
                {user.full_name} {user.id === me?.id && <span className="text-sm font-normal text-slate-400">(you)</span>}
              </p>
              <p className="truncate text-sm text-slate-500">{user.email}</p>
            </div>
            {!user.is_active && <Badge tone="red">Disabled</Badge>}
            <Badge tone={ROLE_TONE[user.role]}>{ROLES.find((r) => r.value === user.role)?.label}</Badge>
          </button>
        ))}
      </Card>
      {editing && <UserModal user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "sales");
  const [active, setActive] = useState(user?.is_active ?? true);
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: () =>
      user
        ? api<User>(`/users/${user.id}`, {
            method: "PATCH",
            body: { full_name: fullName, role, is_active: active, ...(password && { password }) },
          })
        : api<User>("/users", { method: "POST", body: { full_name: fullName, email, role, password } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast(user ? "User updated" : "User added");
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Edit ${user.full_name}` : "Add user"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={save.isPending}>
            {user ? "Save" : "Add user"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Full name">{(id) => <Input id={id} required value={fullName} onChange={(e) => setFullName(e.target.value)} />}</Field>
        <Field label="Email (used to sign in)">
          {(id) => <Input id={id} type="email" required disabled={Boolean(user)} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-abyss-800">Role</legend>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={cx(
                  "flex cursor-pointer gap-3 rounded-xl p-3 ring-1 transition",
                  role === r.value ? "bg-brand-50 ring-2 ring-brand-500" : "ring-slate-200 hover:bg-slate-50",
                )}
              >
                <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="mt-1 accent-brand-600" />
                <span>
                  <span className="block text-sm font-semibold">{r.label}</span>
                  <span className="block text-xs text-slate-500">{r.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={user ? "New password" : "Password"} hint={user ? "Leave blank to keep it. Setting one signs them out everywhere." : "8–72 characters."}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required={!user} minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {user && <Toggle checked={active} onChange={setActive} label="Active" description="Disabled users can't sign in." />}
        <ErrorBox error={save.error} />
      </form>
    </Modal>
  );
}
