import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { api } from "../api/client";
import type { Category } from "../api/types";
import { QuantityRuleChoice, quantityRuleLabel } from "../components/QuantityRule";
import { useToast } from "../components/Toast";
import { Button, Card, EmptyState, ErrorBox, Input, Modal, PageHeader, Spinner } from "../components/ui";
import { useCategories } from "../lib/hooks";

function itemsLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

export default function Categories() {
  const { data, isLoading, error } = useCategories();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [fractions, setFractions] = useState(false);
  const [editing, setEditing] = useState<{ id: number; name: string; fractions: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["items"] }); // items show their category's name
  }

  const create = useMutation({
    mutationFn: () => api<Category>("/categories", { method: "POST", body: { name: name.trim(), allow_fractions: fractions } }),
    onSuccess: (created) => {
      setName("");
      setFractions(false);
      refresh();
      toast(`Added ${created.name}`);
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, name: newName, fractions: allow }: { id: number; name: string; fractions: boolean }) =>
      api<Category>(`/categories/${id}`, { method: "PATCH", body: { name: newName, allow_fractions: allow } }),
    onSuccess: (saved) => {
      setEditing(null);
      refresh();
      toast(`Saved ${saved.name}`);
    },
  });

  const remove = useMutation({
    mutationFn: (category: Category) => api(`/categories/${category.id}`, { method: "DELETE" }),
    onSuccess: (_, category) => {
      setDeleting(null);
      refresh();
      toast(`Deleted ${category.name}`);
    },
  });

  function submitNew(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate();
  }

  function submitRename(e: FormEvent) {
    e.preventDefault();
    if (editing?.name.trim()) rename.mutate({ ...editing, name: editing.name.trim() });
  }

  return (
    <>
      <PageHeader
        back="/inventory"
        title="Categories"
        subtitle="Group your items, and choose whether they're counted in whole numbers or can use fractions."
      />

      <Card className="mb-4 p-4 sm:p-5">
        <form onSubmit={submitNew} className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="New category name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} aria-label="New category name" />
            <Button type="submit" icon={Plus} loading={create.isPending} disabled={!name.trim()}>
              Add
            </Button>
          </div>
          <QuantityRuleChoice value={fractions} onChange={setFractions} />
        </form>
        {create.error && <p className="mt-2 text-sm text-red-600">{create.error.message}</p>}
      </Card>

      <ErrorBox error={error} />
      <Card className="overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={Tags} title="No categories yet" text="Add one above, or create them while adding an item." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((category) =>
              editing?.id === category.id ? (
                <li key={category.id} className="px-4 py-3 sm:px-5">
                  <form onSubmit={submitRename} className="space-y-3">
                    <Input
                      autoFocus
                      value={editing.name}
                      maxLength={100}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      aria-label={`New name for ${category.name}`}
                    />
                    <QuantityRuleChoice value={editing.fractions} onChange={(f) => setEditing({ ...editing, fractions: f })} />
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" loading={rename.isPending} disabled={!editing.name.trim()}>
                        Save
                      </Button>
                    </div>
                  </form>
                  {rename.error && <p className="mt-2 text-sm text-red-600">{rename.error.message}</p>}
                </li>
              ) : (
                <li key={category.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
                  <Link to={`/inventory?category=${category.id}`} className="min-w-0 flex-1 py-1">
                    <p className="truncate font-medium hover:text-brand-700">{category.name}</p>
                    <p className="text-xs text-slate-500">
                      {itemsLabel(category.item_count)} · {quantityRuleLabel(category.allow_fractions)}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    icon={Pencil}
                    aria-label={`Edit ${category.name}`}
                    onClick={() => {
                      rename.reset();
                      setEditing({ id: category.id, name: category.name, fractions: category.allow_fractions });
                    }}
                  />
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    aria-label={`Delete ${category.name}`}
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setDeleting(category)}
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </Card>

      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Keep it
              </Button>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(deleting)}>
                Delete category
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            {deleting.item_count > 0
              ? `${itemsLabel(deleting.item_count)} in it will be left without a category. The items themselves aren't deleted.`
              : "No items use this category."}
          </p>
          <ErrorBox error={remove.error} />
        </Modal>
      )}
    </>
  );
}
