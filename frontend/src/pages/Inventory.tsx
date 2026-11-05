import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Package, PackagePlus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { api } from "../api/client";
import type { Item, ItemList } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Badge, Card, cx, EmptyState, ErrorBox, Input, LinkButton, PageHeader, Pager, Select, Spinner } from "../components/ui";
import { money, qty } from "../lib/format";
import { useCurrency, useDebounced, useItemMeta } from "../lib/hooks";

const LIMIT = 50;

export function StockBadge({ item }: { item: Item }) {
  if (!item.track_stock) return <Badge tone="brand">Service</Badge>;
  const tone = Number(item.quantity) <= 0 ? "red" : item.low_stock ? "amber" : "green";
  return (
    <Badge tone={tone}>
      {qty(item.quantity)} {item.unit}
    </Badge>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-11 rounded-xl px-3.5 text-sm lg:h-10 font-medium whitespace-nowrap ring-1 transition",
        active ? "bg-abyss-900 text-white ring-abyss-900" : "bg-white text-abyss-700 ring-slate-200 hover:ring-slate-300",
      )}
    >
      {children}
    </button>
  );
}

export default function Inventory() {
  const { can } = useAuth();
  const currency = useCurrency();
  const navigate = useNavigate();
  const meta = useItemMeta();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebounced(search.trim());

  const category = params.get("category") ?? "";
  const low = params.get("low") === "1";
  const archived = params.get("archived") === "1";
  const offset = Number(params.get("offset") ?? 0);

  function update(patch: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!("offset" in patch)) next.delete("offset");
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    // Push the debounced search box into the URL.
    if (q !== (params.get("q") ?? "")) update({ q });
  }, [q]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["items", "list", { q, category, low, archived, offset }],
    queryFn: () =>
      api<ItemList>("/items", {
        query: { q, category, low_stock: low, include_inactive: archived, limit: LIMIT, offset },
      }),
    placeholderData: keepPreviousData,
  });

  const showCost = can("inventory.view_cost");
  const filtered = Boolean(q || category || low || archived);

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={data ? `${data.total} ${data.total === 1 ? "item" : "items"}${filtered ? " match" : ""}` : " "}
        actions={
          can("inventory.manage") && (
            <LinkButton to="/inventory/new" icon={PackagePlus}>
              Add item
            </LinkButton>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            placeholder="Search name, SKU, category or attribute"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
          <Select
            value={category}
            onChange={(e) => update({ category: e.target.value })}
            className="w-44! shrink-0"
            aria-label="Category"
          >
            <option value="">All categories</option>
            {meta.data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <FilterChip active={low} onClick={() => update({ low: low ? null : "1" })}>
            Low stock
          </FilterChip>
          <FilterChip active={archived} onClick={() => update({ archived: archived ? null : "1" })}>
            Show archived
          </FilterChip>
        </div>
      </div>

      <ErrorBox error={error} />

      <Card className={cx("overflow-hidden transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState
            icon={Package}
            title={filtered ? "No items match" : "No items yet"}
            text={filtered ? "Try a different search or filter." : "Add anything you sell — products, services, materials."}
            action={
              !filtered &&
              can("inventory.manage") && (
                <LinkButton to="/inventory/new" icon={PackagePlus}>
                  Add your first item
                </LinkButton>
              )
            }
          />
        ) : (
          <>
            {/* Phones */}
            <div className="divide-y divide-slate-100 md:hidden">
              {data.items.map((item) => (
                <Link key={item.id} to={`/inventory/${item.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className={cx("truncate font-medium", !item.is_active && "text-slate-400")}>{item.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[item.sku, item.category].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{money(item.sale_price, currency)}</span>
                    <StockBadge item={item} />
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-slate-300" />
                </Link>
              ))}
            </div>

            {/* Tablets and up */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-slate-100 bg-slate-50/60 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">In stock</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  {showCost && <th className="px-5 py-3 text-right">Cost</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item) => (
                  <tr key={item.id} onClick={() => navigate(`/inventory/${item.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                    <td className="px-5 py-3">
                      <Link to={`/inventory/${item.id}`} className={cx("font-medium", item.is_active ? "text-abyss-900" : "text-slate-400")}>
                        {item.name}
                      </Link>
                      {!item.is_active && <Badge>Archived</Badge>}
                      <p className="text-xs text-slate-500">
                        {[item.sku, ...Object.entries(item.attributes).slice(0, 3).map(([k, v]) => `${k}: ${v}`)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{item.category ?? "—"}</td>
                    <td className="px-3 py-3">
                      <StockBadge item={item} />
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(item.sale_price, currency)}</td>
                    {showCost && <td className="px-5 py-3 text-right text-slate-600 tabular-nums">{money(item.cost_price, currency)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager offset={offset} limit={LIMIT} total={data.total} onChange={(o) => update({ offset: String(o) })} />
          </>
        )}
      </Card>
    </>
  );
}
