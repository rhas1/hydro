import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

import type { SaleSummary } from "../api/types";
import { money, PAYMENT_LABELS, shortDate } from "../lib/format";
import { Badge, cx } from "./ui";

export function SaleRow({ sale, currency, showSeller }: { sale: SaleSummary; currency: string; showSeller?: boolean }) {
  const isVoid = sale.status === "void";
  return (
    <Link to={`/sales/${sale.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="font-semibold">{sale.invoice_number}</span>
          {isVoid && <Badge tone="red">Void</Badge>}
        </p>
        <p className="truncate text-xs text-slate-500">
          {sale.customer_name || "Walk-in customer"} · {PAYMENT_LABELS[sale.payment_method]}
          {showSeller && ` · ${sale.created_by.full_name}`}
        </p>
      </div>
      <div className="text-right">
        <p className={cx("font-semibold tabular-nums", isVoid && "text-slate-400 line-through")}>{money(sale.total, currency)}</p>
        <p className="text-xs text-slate-500">{shortDate(sale.created_at)}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-slate-300" />
    </Link>
  );
}
