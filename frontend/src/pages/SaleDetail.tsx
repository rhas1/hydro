import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, Printer, Share2, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

import { apiBlob, api } from "../api/client";
import type { Sale } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { LogoMark } from "../components/Logo";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorBox, Field, LinkButton, Modal, PageHeader, Spinner, Textarea } from "../components/ui";
import { dateTime, money, PAYMENT_LABELS, qty } from "../lib/format";
import { useSettings } from "../lib/hooks";

const canShareFiles =
  typeof navigator !== "undefined" &&
  typeof navigator.canShare === "function" &&
  navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });

export default function SaleDetail() {
  const saleId = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const settings = useSettings().data;
  const [voiding, setVoiding] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<"download" | "share" | null>(null);

  const { data: sale, isLoading, error } = useQuery({
    queryKey: ["sales", "detail", saleId],
    queryFn: () => api<Sale>(`/sales/${saleId}`),
  });

  if (isLoading) return <Spinner />;
  if (error || !sale) return <ErrorBox error={error ?? "Sale not found"} />;

  const currency = settings?.currency ?? "USD";
  const m = (value: string | number) => money(value, currency);
  const isVoid = sale.status === "void";
  const hasDiscounts = sale.lines.some((line) => Number(line.discount) > 0);

  async function pdf(mode: "download" | "share") {
    setPdfBusy(mode);
    try {
      const blob = await apiBlob(`/sales/${saleId}/invoice.pdf`);
      const filename = `${sale!.invoice_number}.pdf`;
      if (mode === "share") {
        const file = new File([blob], filename, { type: "application/pdf" });
        await navigator.share({ files: [file], title: `Invoice ${sale!.invoice_number}` });
      } else {
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement("a"), { href: url, download: filename });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast((err as Error).message, "error");
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          back="/sales"
          title={`Invoice ${sale.invoice_number}`}
          subtitle={`${dateTime(sale.created_at)} · by ${sale.created_by.full_name}`}
          actions={
            <>
              {canShareFiles && (
                <Button icon={Share2} onClick={() => pdf("share")} loading={pdfBusy === "share"}>
                  Share
                </Button>
              )}
              <Button variant={canShareFiles ? "secondary" : "primary"} icon={Download} onClick={() => pdf("download")} loading={pdfBusy === "download"}>
                PDF
              </Button>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()} className="max-sm:hidden">
                Print
              </Button>
              {can("sales.void") && !isVoid && (
                <Button variant="secondary" icon={Ban} onClick={() => setVoiding(true)} className="text-red-600">
                  Void
                </Button>
              )}
            </>
          }
        />
      </div>

      {isVoid && (
        <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200 print:hidden">
          <p className="font-semibold">This sale was voided{sale.voided_at && ` on ${dateTime(sale.voided_at)}`}{sale.voided_by && ` by ${sale.voided_by.full_name}`}.</p>
          {sale.void_reason && <p className="mt-0.5">Reason: {sale.void_reason}</p>}
          <p className="mt-0.5 text-red-700">Stock from this sale was returned to inventory.</p>
        </div>
      )}

      <Card className="relative overflow-hidden print:rounded-none print:shadow-none print:ring-0">
        <div className="h-1.5 bg-gradient-to-r from-brand-400 via-brand-600 to-abyss-800" />
        {isVoid && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-[25deg] text-8xl font-black tracking-widest text-red-500/15 sm:text-9xl">VOID</span>
          </div>
        )}
        <div className="p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div>
              <p className="text-xl font-bold text-abyss-900">{settings?.business_name}</p>
              <div className="mt-1 space-y-0.5 text-sm whitespace-pre-line text-slate-500">
                {settings?.address && <p>{settings.address}</p>}
                {settings?.phone && <p>{settings.phone}</p>}
                {settings?.email && <p>{settings.email}</p>}
                {settings?.tax_id && <p>Tax ID: {settings.tax_id}</p>}
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-2xl font-extrabold tracking-wide text-brand-600">INVOICE</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm sm:justify-end">
                <dt className="text-slate-500">Invoice no.</dt>
                <dd className="font-semibold">{sale.invoice_number}</dd>
                <dt className="text-slate-500">Date</dt>
                <dd className="font-semibold">{dateTime(sale.created_at)}</dd>
                <dt className="text-slate-500">Payment</dt>
                <dd className="font-semibold">{PAYMENT_LABELS[sale.payment_method]}</dd>
              </dl>
            </div>
          </div>

          {(sale.customer_name || sale.customer_phone || sale.customer_email || sale.customer_address) && (
            <div className="mt-6">
              <p className="text-xs font-bold tracking-wider text-brand-600 uppercase">Bill to</p>
              <div className="mt-1 text-sm">
                {sale.customer_name && <p className="font-semibold">{sale.customer_name}</p>}
                {sale.customer_phone && <p>{sale.customer_phone}</p>}
                {sale.customer_email && <p>{sale.customer_email}</p>}
                {sale.customer_address && <p className="whitespace-pre-line">{sale.customer_address}</p>}
              </div>
            </div>
          )}

          {/* Lines: stacked on phones, table from sm up */}
          <div className="mt-6 divide-y divide-slate-100 border-y border-slate-100 sm:hidden">
            {sale.lines.map((line) => (
              <div key={line.id} className="flex justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{line.name}</p>
                  <p className="text-xs text-slate-500">
                    {qty(line.quantity)} {line.unit} × {m(line.unit_price)}
                    {Number(line.discount) > 0 && ` − ${m(line.discount)}`}
                  </p>
                </div>
                <p className="font-semibold tabular-nums">{m(line.line_total)}</p>
              </div>
            ))}
          </div>
          <table className="mt-6 hidden w-full text-sm sm:table">
            <thead>
              <tr className="bg-abyss-900 text-left text-xs font-semibold tracking-wide text-white uppercase print:bg-abyss-900">
                <th className="rounded-l-lg px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Price</th>
                {hasDiscounts && <th className="px-3 py-2.5 text-right">Discount</th>}
                <th className="rounded-r-lg px-3 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sale.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-3">
                    <p className="font-medium">{line.name}</p>
                    {line.sku && <p className="text-xs text-slate-500">SKU {line.sku}</p>}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                    {qty(line.quantity)} {line.unit}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{m(line.unit_price)}</td>
                  {hasDiscounts && <td className="px-3 py-3 text-right tabular-nums">{Number(line.discount) > 0 ? m(line.discount) : "—"}</td>}
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{m(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{m(sale.subtotal)}</dd>
              </div>
              {Number(sale.discount) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <dt>Discount</dt>
                  <dd className="tabular-nums">−{m(sale.discount)}</dd>
                </div>
              )}
              {Number(sale.tax_rate) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <dt>Tax ({qty(sale.tax_rate)}%)</dt>
                  <dd className="tabular-nums">{m(sale.tax_amount)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-2.5 text-white print:bg-brand-600">
                <dt className="font-semibold">Total</dt>
                <dd data-testid="invoice-total" className="text-lg font-bold tabular-nums">{m(sale.total)}</dd>
              </div>
            </dl>
          </div>

          {sale.notes && (
            <div className="mt-6">
              <p className="text-xs font-bold tracking-wider text-brand-600 uppercase">Notes</p>
              <p className="mt-1 text-sm whitespace-pre-line">{sale.notes}</p>
            </div>
          )}
          {settings?.invoice_footer && <p className="mt-8 text-center text-sm text-slate-500 italic">{settings.invoice_footer}</p>}
          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-300 print:hidden">
            <LogoMark className="size-3.5 opacity-60" /> Hydro
          </p>
        </div>
      </Card>

      <div className="mt-6 flex justify-center print:hidden">
        <LinkButton to="/sell" variant="secondary" icon={ShoppingCart}>
          Start a new sale
        </LinkButton>
      </div>

      {voiding && <VoidModal sale={sale} onClose={() => setVoiding(false)} />}
    </>
  );
}

function VoidModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const toast = useToast();
  const voidSale = useMutation({
    mutationFn: () => api<Sale>(`/sales/${sale.id}/void`, { method: "POST", body: { reason } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["sales", "detail", sale.id], updated);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(`${sale.invoice_number} voided`);
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Void ${sale.invoice_number}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep sale
          </Button>
          <Button variant="danger" disabled={!reason.trim()} loading={voidSale.isPending} onClick={() => voidSale.mutate()}>
            Void sale
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          The invoice stays on record marked <strong>VOID</strong> and its items go back into stock. This can't be undone.
        </p>
        <Field label="Reason">
          {(id) => <Textarea id={id} autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned the goods" />}
        </Field>
        <ErrorBox error={voidSale.error} />
      </div>
    </Modal>
  );
}
