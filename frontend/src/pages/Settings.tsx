import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api } from "../api/client";
import type { BusinessSettings } from "../api/types";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Textarea } from "../components/ui";
import { useSettings } from "../lib/hooks";

export default function Settings() {
  const { data, isLoading, error } = useSettings();
  if (isLoading) return <Spinner />;
  if (!data) return <ErrorBox error={error} />;
  return <SettingsForm initial={data} />;
}

function SettingsForm({ initial }: { initial: BusinessSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    ...initial,
    default_tax_rate: String(Number(initial.default_tax_rate)),
    next_invoice_number: String(initial.next_invoice_number),
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const save = useMutation({
    mutationFn: () =>
      api<BusinessSettings>("/settings", {
        method: "PUT",
        body: { ...form, next_invoice_number: Number(form.next_invoice_number) },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
      toast("Settings saved");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nextInvoice = `${form.invoice_prefix}${String(Number(form.next_invoice_number) || 1).padStart(5, "0")}`;

  return (
    <form onSubmit={submit}>
      <PageHeader title="Settings" subtitle="Business details printed on every invoice." />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold">Business</h2>
          <Field label="Business name">{(id) => <Input id={id} required value={form.business_name} onChange={set("business_name")} />}</Field>
          <Field label="Address">{(id) => <Textarea id={id} rows={3} value={form.address ?? ""} onChange={set("address")} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">{(id) => <Input id={id} type="tel" value={form.phone ?? ""} onChange={set("phone")} />}</Field>
            <Field label="Email">{(id) => <Input id={id} type="email" value={form.email ?? ""} onChange={set("email")} />}</Field>
          </div>
          <Field label="Tax / VAT registration no.">{(id) => <Input id={id} value={form.tax_id ?? ""} onChange={set("tax_id")} />}</Field>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold">Money &amp; time</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency code" hint="ISO code, e.g. USD, EUR, LKR, INR">
                {(id) => <Input id={id} required maxLength={8} value={form.currency} onChange={set("currency")} className="uppercase" />}
              </Field>
              <Field label="Default tax rate %">
                {(id) => <Input id={id} inputMode="decimal" value={form.default_tax_rate} onChange={set("default_tax_rate")} />}
              </Field>
            </div>
            <Field
              label="Time zone"
              hint={
                form.timezone !== deviceZone && (
                  <button type="button" className="font-medium text-brand-700" onClick={() => setForm({ ...form, timezone: deviceZone })}>
                    Use this device's time zone ({deviceZone})
                  </button>
                )
              }
            >
              {(id) => <Input id={id} required value={form.timezone} onChange={set("timezone")} placeholder="e.g. Asia/Colombo" />}
            </Field>
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold">Invoices</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Number prefix">{(id) => <Input id={id} maxLength={16} value={form.invoice_prefix} onChange={set("invoice_prefix")} />}</Field>
              <Field label="Next number" hint={<>Next invoice: <strong>{nextInvoice}</strong></>}>
                {(id) => <Input id={id} inputMode="numeric" value={form.next_invoice_number} onChange={set("next_invoice_number")} />}
              </Field>
            </div>
            <Field label="Footer message">
              {(id) => <Textarea id={id} rows={2} value={form.invoice_footer ?? ""} onChange={set("invoice_footer")} placeholder="e.g. Thank you for your business!" />}
            </Field>
          </Card>

          <ErrorBox error={save.error} />
          <Button type="submit" size="lg" className="w-full" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </div>
    </form>
  );
}
