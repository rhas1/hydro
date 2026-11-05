import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";

import { api } from "../api/client";
import type { Category, Item } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { QuantityRuleChoice } from "../components/QuantityRule";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle } from "../components/ui";
import { isDecimal } from "../lib/format";
import { useCategories, useItemMeta } from "../lib/hooks";

const ATTRIBUTE_SUGGESTIONS = ["Brand", "Size", "Colour", "Model", "Material", "Weight", "Expiry date", "Batch no.", "Serial no.", "Supplier"];

interface Attr {
  key: string;
  value: string;
}

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold text-abyss-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function ItemForm() {
  const { id } = useParams();
  const itemId = id ? Number(id) : null;
  const { data: item, isLoading, error } = useQuery({
    queryKey: ["items", "detail", itemId],
    queryFn: () => api<Item>(`/items/${itemId}`),
    enabled: itemId !== null,
  });
  if (itemId !== null && isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return <ItemFormInner item={item} />;
}

function ItemFormInner({ item }: { item?: Item }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const meta = useItemMeta();
  const categories = useCategories();

  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [categoryId, setCategoryId] = useState(item?.category ? String(item.category.id) : "");
  const [newCategory, setNewCategory] = useState<string | null>(null); // non-null while adding one
  const [newCategoryFractions, setNewCategoryFractions] = useState(false);
  const [unit, setUnit] = useState(item?.unit ?? "pcs");
  const [description, setDescription] = useState(item?.description ?? "");
  const [salePrice, setSalePrice] = useState(item ? String(Number(item.sale_price)) : "");
  const [costPrice, setCostPrice] = useState(item?.cost_price != null ? String(Number(item.cost_price)) : "");
  const [trackStock, setTrackStock] = useState(item?.track_stock ?? true);
  const [quantity, setQuantity] = useState("");
  const [reorderLevel, setReorderLevel] = useState(item?.reorder_level != null ? String(Number(item.reorder_level)) : "");
  const [attrs, setAttrs] = useState<Attr[]>(
    item ? Object.entries(item.attributes).map(([key, value]) => ({ key, value })) : [],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      item ? api<Item>(`/items/${item.id}`, { method: "PATCH", body }) : api<Item>("/items", { method: "POST", body }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(item ? "Item updated" : "Item added");
      navigate(`/inventory/${saved.id}`, { replace: Boolean(item) });
    },
  });

  const addCategory = useMutation({
    mutationFn: (name: string) =>
      api<Category>("/categories", { method: "POST", body: { name, allow_fractions: newCategoryFractions } }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategoryId(String(created.id));
      setNewCategory(null);
      setNewCategoryFractions(false);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (newCategory !== null) return setFormError("Add or cancel the new category first");
    if (!item && trackStock && wholeOnly && quantity && !Number.isInteger(Number(quantity))) {
      return setFormError(`${selectedCategory?.name} items are counted in whole numbers, so the opening quantity must be one`);
    }
    const numbers: [string, string][] = [
      ["Sale price", salePrice || "0"],
      ["Cost price", costPrice || "0"],
      ["Opening quantity", quantity || "0"],
      ["Reorder level", reorderLevel || "0"],
    ];
    const bad = numbers.find(([, value]) => !isDecimal(value));
    if (bad) return setFormError(`${bad[0]} must be a number`);

    const attributes: Record<string, string> = {};
    for (const { key, value } of attrs) if (key.trim()) attributes[key.trim()] = value.trim();

    const body: Record<string, unknown> = {
      name,
      sku,
      category_id: categoryId ? Number(categoryId) : null,
      unit,
      description,
      sale_price: salePrice || "0",
      track_stock: trackStock,
      reorder_level: trackStock && reorderLevel ? reorderLevel : null,
      attributes,
    };
    if (can("inventory.view_cost")) body.cost_price = costPrice || "0";
    if (!item) body.quantity = trackStock ? quantity || "0" : "0";
    save.mutate(body);
  }

  const selectedCategory = categories.data?.find((c) => String(c.id) === categoryId);
  const wholeOnly = selectedCategory ? !selectedCategory.allow_fractions : false;

  const usedKeys = new Set(attrs.map((a) => a.key.trim().toLowerCase()));
  const suggestions = ATTRIBUTE_SUGGESTIONS.filter((s) => !usedKeys.has(s.toLowerCase()));

  return (
    <form onSubmit={submit}>
      <PageHeader title={item ? `Edit ${item.name}` : "Add item"} back />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-4">
          <FormSection title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *" className="sm:col-span-2">
                {(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mineral water 1L" />}
              </Field>
              <Field label="SKU / barcode" hint="Optional. Must be unique.">
                {(id) => <Input id={id} value={sku} onChange={(e) => setSku(e.target.value)} autoCapitalize="characters" />}
              </Field>
              <Field label="Category">
                {(id) =>
                  newCategory === null ? (
                    <Select
                      id={id}
                      value={categoryId}
                      onChange={(e) => (e.target.value === "new" ? setNewCategory("") : setCategoryId(e.target.value))}
                    >
                      <option value="">No category</option>
                      {categories.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="new">+ New category…</option>
                    </Select>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Input
                          id={id}
                          autoFocus
                          placeholder="New category name"
                          value={newCategory}
                          maxLength={100}
                          onChange={(e) => setNewCategory(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (newCategory.trim()) addCategory.mutate(newCategory.trim());
                            }
                          }}
                        />
                        <Button
                          loading={addCategory.isPending}
                          disabled={!newCategory.trim()}
                          onClick={() => addCategory.mutate(newCategory.trim())}
                        >
                          Add
                        </Button>
                        <Button
                          variant="ghost"
                          icon={X}
                          aria-label="Cancel new category"
                          onClick={() => {
                            setNewCategory(null);
                            addCategory.reset();
                          }}
                        />
                      </div>
                      <div className="mt-2">
                        <QuantityRuleChoice value={newCategoryFractions} onChange={setNewCategoryFractions} />
                      </div>
                      {addCategory.error && <p className="mt-1.5 text-xs text-red-600">{addCategory.error.message}</p>}
                    </>
                  )
                }
              </Field>
              <Field label="Description" className="sm:col-span-2">
                {(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="Attributes"
            description="Describe anything that matters for this kind of item — size, colour, expiry, serial number…"
          >
            <div className="space-y-2">
              {attrs.map((attr, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    aria-label="Attribute name"
                    placeholder="Name"
                    value={attr.key}
                    onChange={(e) => setAttrs(attrs.map((a, i) => (i === index ? { ...a, key: e.target.value } : a)))}
                    className="w-2/5"
                  />
                  <Input
                    aria-label="Attribute value"
                    placeholder="Value"
                    value={attr.value}
                    autoFocus={attr.value === "" && attr.key !== ""}
                    onChange={(e) => setAttrs(attrs.map((a, i) => (i === index ? { ...a, value: e.target.value } : a)))}
                  />
                  <Button variant="ghost" icon={Trash2} aria-label="Remove attribute" onClick={() => setAttrs(attrs.filter((_, i) => i !== index))} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suggestions.slice(0, 6).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAttrs([...attrs, { key: s, value: "" }])}
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100"
                >
                  + {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAttrs([...attrs, { key: "", value: "" }])}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-abyss-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <Plus className="size-3" /> Custom
              </button>
            </div>
          </FormSection>
        </div>

        <div className="space-y-4">
          <FormSection title="Pricing">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <Field label="Selling price">
                {(id) => <Input id={id} inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0.00" />}
              </Field>
              {can("inventory.view_cost") && (
                <Field label="Cost price">
                  {(id) => <Input id={id} inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" />}
                </Field>
              )}
            </div>
          </FormSection>

          <FormSection title="Stock">
            <div className="space-y-4">
              <Toggle
                checked={trackStock}
                onChange={setTrackStock}
                label="Track stock"
                description="Turn off for services or anything you don't count (labour, delivery…)."
              />
              <Field label="Unit" hint="How you count it: pcs, kg, litre, box, hour…">
                {(id) => (
                  <>
                    <Input id={id} required list={`${id}-list`} value={unit} onChange={(e) => setUnit(e.target.value)} />
                    <datalist id={`${id}-list`}>
                      {meta.data?.units.map((u) => <option key={u} value={u} />)}
                    </datalist>
                  </>
                )}
              </Field>
              {trackStock && (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
                  {!item && (
                    <Field label="Opening quantity" hint={wholeOnly ? "Whole numbers (set by the category)." : undefined}>
                      {(id) => (
                        <Input id={id} inputMode={wholeOnly ? "numeric" : "decimal"} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
                      )}
                    </Field>
                  )}
                  <Field label="Reorder level" hint="Warn when stock falls to this.">
                    {(id) => <Input id={id} inputMode="decimal" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="Optional" />}
                  </Field>
                </div>
              )}
            </div>
          </FormSection>

          <ErrorBox error={formError ?? save.error} />
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="flex-1" loading={save.isPending}>
              {item ? "Save changes" : "Add item"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
