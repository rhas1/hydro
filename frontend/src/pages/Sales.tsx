import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ReceiptText, Search, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { api } from "../api/client";
import type { SaleList } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SaleRow } from "../components/SaleRow";
import { Badge, Card, cx, EmptyState, ErrorBox, Input, LinkButton, PageHeader, Pager, Select, Spinner } from "../components/ui";
import { dateTime, money, PAYMENT_LABELS } from "../lib/format";
import { useCurrency, useDebounced } from "../lib/hooks";

const LIMIT = 50;

function isoDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const RANGES = {
  today: () => [isoDate(new Date()), isoDate(new Date())],
  week: () => [isoDate(new Date(Date.now() - 6 * 86_400_000)), isoDate(new Date())],
  month: () => {
    const now = new Date();
    return [isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(now)];
  },
} as const;

export default function Sales() {
  const { can } = useAuth();
  const currency = useCurrency();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["sales", { q, from, to, status, offset }],
    queryFn: () =>
      api<SaleList>("/sales", { query: { q, date_from: from, date_to: to, status, limit: LIMIT, offset } }),
    placeholderData: keepPreviousData,
  });

  const showSeller = can("sales.view_all");
  const activeRange = (Object.keys(RANGES) as (keyof typeof RANGES)[]).find((key) => {
    const [f, t] = RANGES[key]();
    return f === from && t === to;
  });

  function setRange(range: [string, string]) {
    setFrom(range[0]);
    setTo(range[1]);
    setOffset(0);
  }

  return (
    <>
      <PageHeader
        title={showSeller ? "Sales" : "My sales"}
        subtitle={
          data && (
            <>
              {data.total} {data.total === 1 ? "sale" : "sales"} · <span className="font-semibold text-abyss-900">{money(data.total_amount, currency)}</span>
            </>
          )
        }
        actions={
          <LinkButton to="/sell" icon={ShoppingCart}>
            New sale
          </LinkButton>
        }
      />

      <div className="mb-4 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Invoice no., customer name or phone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="pl-10"
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="sm:w-40" aria-label="Status">
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="void">Void</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Today"],
              ["week", "Last 7 days"],
              ["month", "This month"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => (activeRange === key ? setRange(["", ""]) : setRange(RANGES[key]() as [string, string]))}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm font-medium ring-1",
                activeRange === key ? "bg-abyss-900 text-white ring-abyss-900" : "bg-white text-abyss-700 ring-slate-200",
              )}
            >
              {label}
            </button>
          ))}
          <div className="flex w-full items-center gap-1.5 text-sm text-slate-500 sm:w-auto">
            <Input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} className="min-w-0 flex-1 py-1.5! sm:w-40!" aria-label="From date" />
            <span>to</span>
            <Input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} className="min-w-0 flex-1 py-1.5! sm:w-40!" aria-label="To date" />
          </div>
        </div>
      </div>

      <ErrorBox error={error} />

      <Card className={cx("overflow-hidden transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? (
          <Spinner />
        ) : !data?.sales.length ? (
          <EmptyState icon={ReceiptText} title="No sales found" text={q || from || to || status ? "Try different filters." : "Completed sales and their invoices appear here."} />
        ) : (
          <>
            <div className="divide-y divide-slate-100 md:hidden">
              {data.sales.map((sale) => (
                <SaleRow key={sale.id} sale={sale} currency={currency} showSeller={showSeller} />
              ))}
            </div>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-slate-100 bg-slate-50/60 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Payment</th>
                  {showSeller && <th className="px-3 py-3">Sold by</th>}
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.sales.map((sale) => (
                  <tr key={sale.id} onClick={() => navigate(`/sales/${sale.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                    <td className="px-5 py-3 font-semibold">
                      {sale.invoice_number} {sale.status === "void" && <Badge tone="red">Void</Badge>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{dateTime(sale.created_at)}</td>
                    <td className="px-3 py-3">{sale.customer_name ?? <span className="text-slate-400">Walk-in</span>}</td>
                    <td className="px-3 py-3 text-slate-600">{PAYMENT_LABELS[sale.payment_method]}</td>
                    {showSeller && <td className="px-3 py-3 text-slate-600">{sale.created_by.full_name}</td>}
                    <td className={cx("px-5 py-3 text-right font-semibold tabular-nums", sale.status === "void" && "text-slate-400 line-through")}>
                      {money(sale.total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager offset={offset} limit={LIMIT} total={data.total} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}
