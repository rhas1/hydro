import type { PaymentMethod } from "../api/types";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string) {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
    } catch {
      // Not an ISO currency code (e.g. "Rs"): plain number, prefix added below.
      formatter = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    moneyFormatters.set(currency, formatter);
  }
  return formatter;
}

export function money(value: string | number | null | undefined, currency = "USD") {
  const formatter = moneyFormatter(currency);
  const text = formatter.format(Number(value ?? 0));
  return formatter.resolvedOptions().style === "currency" ? text : `${currency} ${text}`;
}

const qtyFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

export function qty(value: string | number | null | undefined) {
  return qtyFormatter.format(Number(value ?? 0));
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function shortDate(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  mobile_payment: "Mobile payment",
  cheque: "Cheque",
  credit: "Credit",
  other: "Other",
};

export function isDecimal(value: string) {
  return /^\d*\.?\d*$/.test(value.trim()) && value.trim() !== "" && value.trim() !== ".";
}

// Money maths in exact integers (cents, thousandths), never floats, so the cart
// rounds exactly like the server's Decimal maths and matches the invoice to the cent.

/** A decimal string as a whole number of 10^-places units: ("9.5", 3) -> 9500n. Not a number -> 0n. */
export function units(value: string, places: number): bigint {
  if (!isDecimal(value)) return 0n;
  const [whole, fraction = ""] = value.trim().split(".");
  return BigInt(whole || "0") * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0").slice(0, places) || "0");
}

/** n / d, rounded half away from zero (the server's ROUND_HALF_UP). */
export function divRound(n: bigint, d: bigint): bigint {
  const q = (2n * (n < 0n ? -n : n) + d) / (2n * d);
  return n < 0n ? -q : q;
}
