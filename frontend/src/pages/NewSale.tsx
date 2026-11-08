import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Minus, Package, Plus, ScanBarcode, Search, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";

import { api, ApiError } from "../api/client";
import type { Item, ItemList, PaymentMethod, Sale } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Button, Card, cx, EmptyState, ErrorBox, Field, Input, Spinner, Textarea } from "../components/ui";
import { divRound, isDecimal, money, PAYMENT_LABELS, qty, units } from "../lib/format";
import { useCurrency, useDebounced, useSettings } from "../lib/hooks";
import { StockBadge } from "./Inventory";

const CART_KEY = "hydro.cart";
const PAYMENT_METHODS = Object.keys(PAYMENT_LABELS) as PaymentMethod[];

interface CartLine {
  item: Item;
  quantity: string;
  /** A price the manager typed; null means "the item's current price". */
  unitPrice: string | null;
  discount: string;
}

function loadCart(): CartLine[] {
  try {
    const lines: CartLine[] = JSON.parse(sessionStorage.getItem(CART_KEY) ?? "[]");
    // Carts saved before typed prices were tracked: an untouched price follows the item again.
    return lines.map((line) => (line.unitPrice === String(Number(line.item.sale_price)) ? { ...line, unitPrice: null } : line));
  } catch {
    return [];
  }
}

function num(value: string) {
  return isDecimal(value) ? Number(value) : 0;
}

/** Cents as a number, for display. */
const fromCents = (cents: bigint) => Number(cents) / 100;

/** A quantity in thousandths back to a string, e.g. 2255n -> "2.255". */
const quantityText = (thousandths: bigint) => String(Number(thousandths) / 1000);

export default function NewSale() {
  const { can } = useAuth();
  const currency = useCurrency();
  const settings = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canDiscount = can("sales.discount");

  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [step, setStep] = useState<"items" | "cart">("items");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 200);

  const [showCustomer, setShowCustomer] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "" });
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [orderDiscount, setOrderDiscount] = useState("");
  const [taxRateInput, setTaxRateInput] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => sessionStorage.setItem(CART_KEY, JSON.stringify(cart)), [cart]);

  const results = useQuery({
    queryKey: ["items", "pos", q],
    queryFn: () => api<ItemList>("/items", { query: { q, limit: 40 } }),
    placeholderData: keepPreviousData,
  });

  // Keep stock for everything in the cart up to date, so sales made on another
  // device (or an item being archived) show up here before checkout.
  const liveCart = useQueries({
    queries: cart.map((line) => ({
      queryKey: ["items", "detail", line.item.id],
      queryFn: () => api<Item>(`/items/${line.item.id}`),
      staleTime: 0,
      refetchInterval: 20_000,
    })),
  });
  const live = new Map<number, Item | null>();
  cart.forEach((line, i) => {
    const query = liveCart[i];
    if (query?.data) live.set(line.item.id, query.data);
    else if (query?.error instanceof ApiError && query.error.status === 404) live.set(line.item.id, null);
  });

  /** Latest known version of an item; null if it was deleted. */
  function latest(item: Item): Item | null {
    return live.has(item.id) ? (live.get(item.id) ?? null) : item;
  }

  /** How much of an item can be sold right now. */
  function sellable(item: Item): number {
    const current = latest(item);
    if (!current || !current.is_active) return 0;
    return current.track_stock ? Number(current.quantity) : Infinity;
  }

  function stockMessage(item: Item) {
    const left = sellable(item);
    return left <= 0 ? `${item.name} is out of stock` : `Only ${qty(left)} ${item.unit} of ${item.name} in stock`;
  }

  /** Why a cart line can't be sold as it is, or null if it's fine. */
  function lineProblem(line: CartLine): string | null {
    const current = latest(line.item);
    if (!current || !current.is_active) return "No longer for sale — remove it";
    if (!isDecimal(line.quantity) || num(line.quantity) <= 0) return "Enter a quantity";
    if (!current.allow_fractions && !Number.isInteger(num(line.quantity))) return "Whole numbers only";
    if (num(line.quantity) > sellable(line.item)) {
      return sellable(line.item) <= 0 ? "Out of stock — remove it" : `Only ${qty(current.quantity)} ${current.unit} in stock`;
    }
    return null;
  }

  /** The item's current price, from the live data when we have it. */
  function currentPrice(line: CartLine) {
    return (latest(line.item) ?? line.item).sale_price;
  }

  /** The price a line sells at: a manager's typed price, otherwise the current one. */
  function linePrice(line: CartLine) {
    return canDiscount && line.unitPrice !== null ? line.unitPrice : currentPrice(line);
  }

  /** Line amounts in cents, rounded exactly like the server. */
  function lineCents(line: CartLine) {
    const gross = divRound(units(line.quantity, 3) * units(linePrice(line), 2), 1000n);
    return { gross, total: gross - units(line.discount, 2) };
  }

  function addItem(item: Item) {
    const existing = cart.find((line) => line.item.id === item.id);
    const nextQty = existing ? num(existing.quantity) + 1 : 1;
    if (nextQty > sellable(item)) {
      toast(stockMessage(item), "error");
      return;
    }
    if (existing) {
      const quantity = quantityText(units(existing.quantity, 3) + 1000n);
      setCart(cart.map((line) => (line === existing ? { ...line, quantity } : line)));
    } else {
      setCart([...cart, { item, quantity: "1", unitPrice: null, discount: "" }]);
    }
  }

  function updateLine(index: number, patch: Partial<CartLine>) {
    setCart(cart.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function step1(index: number, delta: number) {
    const line = cart[index];
    const next = units(line.quantity, 3) + BigInt(delta) * 1000n; // exact, keeps all 3 decimals
    if (delta > 0 && Number(next) / 1000 > sellable(line.item)) {
      toast(stockMessage(line.item), "error");
      return;
    }
    if (next <= 0n) setCart(cart.filter((_, i) => i !== index));
    else updateLine(index, { quantity: quantityText(next) });
  }

  // Enter in the search box adds an exact SKU match (barcode scanners type + Enter) or a sole result.
  async function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = search.trim();
    if (!term) return;
    const found = await queryClient.fetchQuery({
      queryKey: ["items", "pos", term],
      queryFn: () => api<ItemList>("/items", { query: { q: term, limit: 40 } }),
    });
    const exact = found.items.find((i) => i.sku?.toLowerCase() === term.toLowerCase());
    const pick = exact ?? (found.items.length === 1 ? found.items[0] : null);
    if (pick) {
      addItem(pick);
      setSearch("");
    }
  }

  const defaultTaxRate = settings.data ? String(Number(settings.data.default_tax_rate)) : "0";
  const taxRate = taxRateInput ?? defaultTaxRate;

  // Totals in cents, computed the same way as the server (see backend/app/routers/sales.py).
  const subtotal = cart.reduce((sum, line) => sum + lineCents(line).total, 0n);
  const taxable = subtotal - units(orderDiscount, 2);
  const tax = divRound(taxable * units(taxRate, 2), 10_000n);
  const totals = { subtotal: fromCents(subtotal), taxable, tax: fromCents(tax), total: fromCents(taxable + tax) };

  const itemCount = cart.length;
  const problems = cart.map(lineProblem);
  const blocked = problems.some(Boolean);

  const checkout = useMutation({
    mutationFn: (body: object) => api<Sale>("/sales", { method: "POST", body }),
    onSuccess: (sale) => {
      setCart([]);
      sessionStorage.removeItem(CART_KEY);
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(`Sale ${sale.invoice_number} completed`);
      navigate(`/sales/${sale.id}`);
    },
    // Stock may have changed under us (another device sold it): refresh what the cart shows.
    onError: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!cart.length) return setFormError("Add at least one item");
    for (const [index, line] of cart.entries()) {
      if (problems[index]) return setFormError(`${line.item.name}: ${problems[index]}`);
      if (canDiscount && line.unitPrice !== null && !isDecimal(line.unitPrice)) return setFormError(`Check the price for ${line.item.name}`);
      if (line.discount && !isDecimal(line.discount)) return setFormError(`Check the discount for ${line.item.name}`);
      if (lineCents(line).total < 0n) return setFormError(`Discount on ${line.item.name} is more than the line amount`);
    }
    if (totals.taxable < 0n) return setFormError("Discount is more than the subtotal");

    checkout.mutate({
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_email: customer.email,
      customer_address: customer.address,
      payment_method: payment,
      notes,
      ...(canDiscount && { discount: orderDiscount || "0", tax_rate: taxRate || "0" }),
      lines: cart.map((line) => ({
        item_id: line.item.id,
        quantity: line.quantity.trim(),
        // No unit_price means the server uses the item's current price, like the cart shows.
        ...(canDiscount && {
          discount: line.discount.trim() || "0",
          ...(line.unitPrice !== null && { unit_price: line.unitPrice.trim() }),
        }),
      })),
    });
  }

  const inCart = new Map(cart.map((line) => [line.item.id, num(line.quantity)]));

  return (
    <div className="lg:grid lg:grid-cols-[1fr_26rem] lg:gap-6 xl:grid-cols-[1fr_28rem]">
      {/* ---------------------------------------------------------- pick items */}
      <section className={cx(step === "cart" && "hidden lg:block")}>
        <h1 className="mb-4 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">New sale</h1>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            placeholder="Search items or scan a barcode"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            className="h-12 pr-11 pl-10"
            enterKeyHint="search"
          />
          <ScanBarcode className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-slate-300" />
        </div>

        {results.isLoading ? (
          <Spinner />
        ) : !results.data?.items.length ? (
          <Card>
            <EmptyState icon={Package} title={q ? "No items match" : "No items to sell yet"} text={q ? "Try another search." : "Add items to your inventory first."} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {results.data.items.map((item) => {
              const out = sellable(item) <= 0;
              const count = inCart.get(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={out}
                  onClick={() => addItem(item)}
                  className={cx(
                    "relative flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition active:scale-[0.98]",
                    count ? "ring-2 ring-brand-500" : "ring-slate-900/5 hover:ring-brand-300",
                    out && "opacity-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{item.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-sm">
                      <span className="font-semibold text-brand-700 tabular-nums">{money(item.sale_price, currency)}</span>
                      <StockBadge item={item} />
                    </p>
                  </div>
                  {count ? (
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">{qty(count)}</span>
                  ) : (
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                      <Plus className="size-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Phone: jump to the cart */}
        {itemCount > 0 && (
          <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4 lg:hidden">
            <button
              type="button"
              onClick={() => {
                setStep("cart");
                window.scrollTo({ top: 0 });
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-abyss-900 px-4 py-3.5 text-white shadow-xl shadow-abyss-900/30"
            >
              <span className="grid size-8 place-items-center rounded-full bg-brand-500 text-sm font-bold">{itemCount}</span>
              <span className="flex-1 text-left font-semibold">View cart</span>
              <span className="font-bold tabular-nums">{money(totals.total, currency)}</span>
            </button>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- cart & checkout */}
      <form onSubmit={submit} className={cx("lg:sticky lg:top-9 lg:self-start", step === "items" && "hidden lg:block")}>
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep("items")} className="-ml-3">
            Add more items
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="size-5 text-brand-600" /> Cart
            </h2>
            {itemCount > 0 && (
              <button type="button" onClick={() => setCart([])} className="text-sm font-medium text-slate-500 hover:text-red-600">
                Clear
              </button>
            )}
          </div>

          {itemCount === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Tap items to add them here.</p>
          ) : (
            <ul className="max-h-[50dvh] divide-y divide-slate-100 overflow-y-auto lg:max-h-[38dvh]">
              {cart.map((line, index) => {
                const total = fromCents(lineCents(line).total);
                const problem = problems[index];
                return (
                  <li key={line.item.id} className={cx("px-4 py-3", problem && "bg-red-50/60")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{line.item.name}</p>
                        {!canDiscount && (
                          <p className="text-xs text-slate-500">
                            {money(linePrice(line), currency)} / {line.item.unit}
                          </p>
                        )}
                      </div>
                      <p className="font-semibold tabular-nums">{money(total, currency)}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-xl ring-1 ring-slate-200">
                        <button type="button" onClick={() => step1(index, -1)} className="grid size-9 place-items-center text-slate-600" aria-label="Decrease">
                          {num(line.quantity) <= 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                        </button>
                        <input
                          inputMode={latest(line.item)?.allow_fractions === false ? "numeric" : "decimal"}
                          value={line.quantity}
                          onChange={(e) => updateLine(index, { quantity: e.target.value })}
                          className="w-14 border-0 bg-transparent p-0 text-center font-semibold tabular-nums focus:ring-0 focus:outline-none"
                          aria-label={`Quantity of ${line.item.name}`}
                        />
                        <button type="button" onClick={() => step1(index, 1)} className="grid size-9 place-items-center text-slate-600" aria-label="Increase">
                          <Plus className="size-4" />
                        </button>
                      </div>
                      <span className="text-xs text-slate-500">{line.item.unit}</span>
                      {canDiscount && (
                        <div className="ml-auto flex gap-1.5">
                          <input
                            inputMode="decimal"
                            value={line.unitPrice ?? String(Number(currentPrice(line)))}
                            onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                            className="w-20 rounded-lg border-0 px-2 py-1.5 text-right text-sm tabular-nums ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                            aria-label="Unit price"
                            title="Unit price"
                          />
                          <input
                            inputMode="decimal"
                            value={line.discount}
                            placeholder="Disc."
                            onChange={(e) => updateLine(index, { discount: e.target.value })}
                            className="w-16 rounded-lg border-0 px-2 py-1.5 text-right text-sm tabular-nums ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                            aria-label="Line discount"
                            title="Discount (amount)"
                          />
                        </div>
                      )}
                    </div>
                    {problem && <p className="mt-1.5 text-xs font-semibold text-red-600">{problem}</p>}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-4 py-4">
            <button
              type="button"
              onClick={() => setShowCustomer((v) => !v)}
              className="flex w-full items-center gap-2 text-sm font-semibold text-abyss-800"
            >
              <UserRound className="size-4 text-brand-600" />
              {customer.name || "Customer details"}
              <span className="font-normal text-slate-400">(optional)</span>
              <ChevronDown className={cx("ml-auto size-4 transition", showCustomer && "rotate-180")} />
            </button>
            {showCustomer && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" className="col-span-2">
                  {(id) => <Input id={id} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />}
                </Field>
                <Field label="Phone">
                  {(id) => <Input id={id} type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />}
                </Field>
                <Field label="Email">
                  {(id) => <Input id={id} type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />}
                </Field>
                <Field label="Address" className="col-span-2">
                  {(id) => <Textarea id={id} rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />}
                </Field>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-abyss-800">Payment</p>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPayment(method)}
                    className={cx(
                      "rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition",
                      payment === method ? "bg-abyss-900 text-white ring-abyss-900" : "bg-white text-abyss-700 ring-slate-200",
                    )}
                  >
                    {PAYMENT_LABELS[method]}
                  </button>
                ))}
              </div>
            </div>

            {canDiscount && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Order discount">
                  {(id) => <Input id={id} inputMode="decimal" placeholder="0.00" value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} />}
                </Field>
                <Field label="Tax rate %">
                  {(id) => <Input id={id} inputMode="decimal" value={taxRate} onChange={(e) => setTaxRateInput(e.target.value)} />}
                </Field>
              </div>
            )}

            <Field label="Notes on invoice">
              {(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />}
            </Field>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 px-4 py-4 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{money(totals.subtotal, currency)}</span>
            </div>
            {num(orderDiscount) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span className="tabular-nums">−{money(orderDiscount, currency)}</span>
              </div>
            )}
            {num(taxRate) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax ({qty(taxRate)}%)</span>
                <span className="tabular-nums">{money(totals.tax, currency)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-base font-semibold">Total</span>
              <span data-testid="cart-total" className="text-2xl font-bold tracking-tight tabular-nums">{money(totals.total, currency)}</span>
            </div>
            <ErrorBox error={formError ?? checkout.error} />
            {blocked && !formError && (
              <p className="text-center text-xs font-medium text-red-600">Fix the items marked in red to complete the sale.</p>
            )}
            <Button type="submit" size="lg" className="mt-2 w-full" loading={checkout.isPending} disabled={!itemCount || blocked}>
              Complete sale
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
