import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, History, PackagePlus, Pencil, SlidersHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { api } from "../api/client";
import type { Item, Movement, MovementKind } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, cx, EmptyState, ErrorBox, Field, Input, LinkButton, Modal, PageHeader, SectionTitle, Spinner } from "../components/ui";
import { dateTime, isDecimal, money, qty } from "../lib/format";
import { useCurrency } from "../lib/hooks";

const KIND_LABELS: Record<MovementKind, string> = {
  initial: "Opening stock",
  receive: "Received",
  adjust: "Adjusted",
  sale: "Sold",
  void: "Returned (sale voided)",
};

type StockMode = "receive" | "adjust";

export default function ItemDetail() {
  const itemId = Number(useParams().id);
  const { can } = useAuth();
  const currency = useCurrency();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [stockMode, setStockMode] = useState<StockMode | null>(null);

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["items", "detail", itemId],
    queryFn: () => api<Item>(`/items/${itemId}`),
  });
  const movements = useQuery({
    queryKey: ["items", "movements", itemId],
    queryFn: () => api<Movement[]>(`/items/${itemId}/movements`),
  });

  const archive = useMutation({
    mutationFn: (active: boolean) => api<Item>(`/items/${itemId}`, { method: "PATCH", body: { is_active: active } }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(saved.is_active ? "Item restored" : "Item archived");
    },
    onError: (err) => toast(err.message, "error"),
  });

  if (isLoading) return <Spinner />;
  if (error || !item) return <ErrorBox error={error ?? "Item not found"} />;

  const manage = can("inventory.manage");
  const attributes = Object.entries(item.attributes);

  return (
    <>
      <PageHeader
        back="/inventory"
        title={item.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {item.sku && <span>SKU {item.sku}</span>}
            {item.category && (
              <Link to={`/inventory?category=${item.category.id}`}>
                <Badge tone="brand">{item.category.name}</Badge>
              </Link>
            )}
            {!item.is_active && <Badge tone="red">Archived</Badge>}
          </span>
        }
        actions={
          manage && (
            <>
              <LinkButton to={`/inventory/${item.id}/edit`} variant="secondary" icon={Pencil}>
                Edit
              </LinkButton>
              <Button
                variant="secondary"
                icon={item.is_active ? Archive : ArchiveRestore}
                loading={archive.isPending}
                onClick={() => archive.mutate(!item.is_active)}
              >
                {item.is_active ? "Archive" : "Restore"}
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden p-5 lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">{item.track_stock ? "In stock" : "Stock"}</p>
              {item.track_stock ? (
                <p data-testid="stock-level" className={cx("text-4xl font-bold tracking-tight", item.low_stock && "text-amber-600", Number(item.quantity) <= 0 && "text-red-600")}>
                  {qty(item.quantity)} <span className="text-xl font-semibold text-slate-400">{item.unit}</span>
                </p>
              ) : (
                <p className="mt-1 text-lg font-semibold text-slate-600">Not tracked (service)</p>
              )}
              {item.reorder_level != null && item.track_stock && (
                <p className="mt-1 text-sm text-slate-500">
                  Reorder at {qty(item.reorder_level)} {item.unit}
                  {item.low_stock && <span className="ml-2"><Badge tone="amber">Low stock</Badge></span>}
                </p>
              )}
            </div>
            {manage && item.track_stock && item.is_active && (
              <div className="flex w-full gap-2 sm:w-auto">
                <Button icon={PackagePlus} className="flex-1" onClick={() => setStockMode("receive")}>
                  Receive stock
                </Button>
                <Button variant="secondary" icon={SlidersHorizontal} className="flex-1" onClick={() => setStockMode("adjust")}>
                  Adjust
                </Button>
              </div>
            )}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase">Selling price</p>
              <p className="text-lg font-semibold">{money(item.sale_price, currency)}<span className="text-sm font-normal text-slate-400"> / {item.unit}</span></p>
            </div>
            {item.cost_price != null && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase">Cost price</p>
                <p className="text-lg font-semibold">{money(item.cost_price, currency)}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Details</SectionTitle>
          {item.description && <p className="mb-4 text-sm whitespace-pre-line text-slate-600">{item.description}</p>}
          {attributes.length ? (
            <dl className="divide-y divide-slate-100 text-sm">
              {attributes.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 py-2">
                  <dt className="text-slate-500">{key}</dt>
                  <dd className="text-right font-medium">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            !item.description && <p className="text-sm text-slate-400">No extra details.</p>
          )}
        </Card>
      </div>

      <section className="mt-6">
        <SectionTitle>Stock history</SectionTitle>
        <Card className="overflow-hidden">
          {movements.isLoading ? (
            <Spinner />
          ) : !movements.data?.length ? (
            <EmptyState icon={History} title="No stock movements yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {movements.data.map((m) => {
                const change = Number(m.quantity_change);
                return (
                  <li key={m.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {KIND_LABELS[m.kind]}
                        {m.sale_id && (
                          <Link to={`/sales/${m.sale_id}`} className="ml-2 text-brand-700 hover:underline">
                            view sale
                          </Link>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {dateTime(m.created_at)} · {m.user.full_name}
                        {m.unit_cost != null && ` · ${money(m.unit_cost, currency)} each`}
                      </p>
                      {m.note && m.kind !== "sale" && <p className="mt-0.5 text-xs text-slate-600">{m.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className={cx("font-semibold tabular-nums", change >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {change >= 0 ? "+" : "−"}
                        {qty(Math.abs(change))}
                      </p>
                      <p className="text-xs text-slate-400 tabular-nums">→ {qty(m.quantity_after)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {stockMode && <StockModal item={item} mode={stockMode} onClose={() => setStockMode(null)} />}
    </>
  );
}

function StockModal({ item, mode, onClose }: { item: Item; mode: StockMode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [amount, setAmount] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: object) => api<Item>(`/items/${item.id}/stock`, { method: "POST", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["items", "detail", item.id], saved);
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(mode === "receive" ? `Stock received — now ${qty(saved.quantity)} ${saved.unit}` : "Stock adjusted");
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!isDecimal(amount) || Number(amount) <= 0) return setFormError("Enter a quantity above zero");
    if (!item.allow_fractions && !Number.isInteger(Number(amount))) {
      return setFormError(`${item.name} is counted in whole ${item.unit}; enter a whole number`);
    }
    if (unitCost && !isDecimal(unitCost)) return setFormError("Unit cost must be a number");
    setFormError(null);
    const signed = mode === "adjust" && direction === "remove" ? `-${amount.trim()}` : amount.trim();
    save.mutate({
      kind: mode,
      quantity: signed,
      unit_cost: mode === "receive" && unitCost ? unitCost : null,
      note,
    });
  }

  const after = Number(item.quantity) + (mode === "adjust" && direction === "remove" ? -1 : 1) * (Number(amount) || 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "receive" ? "Receive stock" : "Adjust stock"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-form" loading={save.isPending} disabled={after < 0}>
            {mode === "receive" ? "Add to stock" : "Save adjustment"}
          </Button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          <span className="font-medium text-abyss-900">{item.name}</span> · {qty(item.quantity)} {item.unit} on hand
        </p>
        {mode === "adjust" && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(["remove", "add"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={cx("rounded-lg py-2 text-sm font-semibold", direction === d ? "bg-white shadow-sm" : "text-slate-500")}
              >
                {d === "remove" ? "Remove (damage, loss…)" : "Add (found, recount…)"}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Quantity (${item.unit})`} hint={item.allow_fractions ? undefined : "Whole numbers only."}>
            {(id) => (
              <Input id={id} inputMode={item.allow_fractions ? "decimal" : "numeric"} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
          </Field>
          {mode === "receive" && can("inventory.view_cost") && (
            <Field label="Unit cost" hint="Updates the item's cost price.">
              {(id) => <Input id={id} inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Optional" />}
            </Field>
          )}
        </div>
        <Field label={mode === "receive" ? "Note (supplier, invoice no.…)" : "Reason"}>
          {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {amount && isDecimal(amount) && (
          <p className={cx("text-sm", after < 0 ? "font-medium text-red-600" : "text-slate-500")}>
            {after < 0 ? (
              <>Can't remove more than the {qty(item.quantity)} {item.unit} on hand.</>
            ) : (
              <>
                New stock level: <span className="font-semibold">{qty(after)} {item.unit}</span>
              </>
            )}
          </p>
        )}
        <ErrorBox error={formError ?? save.error} />
      </form>
    </Modal>
  );
}
