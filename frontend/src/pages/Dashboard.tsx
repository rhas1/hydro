import { useQuery } from "@tanstack/react-query";
import { ChevronRight, PackagePlus, ReceiptText, ShoppingCart, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { api } from "../api/client";
import type { Dashboard as DashboardData } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Waves } from "../components/Logo";
import { SaleRow } from "../components/SaleRow";
import { Badge, Card, EmptyState, ErrorBox, LinkButton, SectionTitle, Spinner } from "../components/ui";
import { money, qty } from "../lib/format";
import { useCurrency } from "../lib/hooks";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const currency = useCurrency();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/dashboard"),
  });

  const firstName = user?.full_name.split(" ")[0];
  const scope = can("sales.view_all") ? "Today's sales" : "Your sales today";

  return (
    <>
      <div className="mb-5 lg:mb-7">
        <p className="text-sm font-medium text-brand-700">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {greeting()}, {firstName}
        </h1>
      </div>

      <ErrorBox error={error} />
      {isLoading && <Spinner />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-abyss-800 to-abyss-950 p-5 text-white shadow-lg shadow-abyss-900/20 col-span-2">
              <p className="text-sm font-medium text-abyss-300">{scope}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight lg:text-4xl">{money(data.today_sales_total, currency)}</p>
              <p className="mt-1 text-sm text-brand-200">
                {data.today_sales_count} {data.today_sales_count === 1 ? "sale" : "sales"}
              </p>
              <Waves className="h-16 opacity-80" />
            </div>
            <Link to="/inventory" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 transition hover:ring-brand-300">
              <p className="text-sm font-medium text-slate-500">Active items</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">{data.active_items}</p>
            </Link>
            <Link
              to="/inventory?low=1"
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 transition hover:ring-amber-300"
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <TriangleAlert className="size-4 text-amber-500" /> Low stock
              </p>
              <p className={`mt-1 text-3xl font-bold tracking-tight ${data.low_stock_count ? "text-amber-600" : ""}`}>
                {data.low_stock_count}
              </p>
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {can("sales.create") && (
              <LinkButton to="/sell" icon={ShoppingCart} size="lg">
                New sale
              </LinkButton>
            )}
            {can("inventory.manage") && (
              <LinkButton to="/inventory/new" icon={PackagePlus} size="lg" variant="secondary">
                Add item
              </LinkButton>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionTitle action={<Link to="/sales" className="text-sm font-medium text-brand-700">View all</Link>}>
                Recent sales
              </SectionTitle>
              <Card className="divide-y divide-slate-100 overflow-hidden">
                {data.recent_sales.length === 0 ? (
                  <EmptyState icon={ReceiptText} title="No sales yet" text="Sales you make will show up here." />
                ) : (
                  data.recent_sales.map((sale) => <SaleRow key={sale.id} sale={sale} currency={currency} />)
                )}
              </Card>
            </section>

            {can("inventory.view") && (
              <section>
                <SectionTitle action={<Link to="/inventory?low=1" className="text-sm font-medium text-brand-700">View all</Link>}>
                  Running low
                </SectionTitle>
                <Card className="divide-y divide-slate-100 overflow-hidden">
                  {data.low_stock.length === 0 ? (
                    <EmptyState icon={TriangleAlert} title="Nothing running low" text="Set a reorder level on items to get warned here." />
                  ) : (
                    data.low_stock.map((item) => (
                      <Link key={item.id} to={`/inventory/${item.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            Reorder at {qty(item.reorder_level)} {item.unit}
                          </p>
                        </div>
                        <Badge tone={Number(item.quantity) === 0 ? "red" : "amber"}>
                          {qty(item.quantity)} {item.unit}
                        </Badge>
                        <ChevronRight className="size-4 text-slate-300" />
                      </Link>
                    ))
                  )}
                </Card>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
