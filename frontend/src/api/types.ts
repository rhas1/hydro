// Mirrors backend/app/schemas.py. Decimals arrive as strings to keep precision.
export type Decimal = string;

export type Role = "admin" | "manager" | "sales";

export type Permission =
  | "users.manage"
  | "settings.manage"
  | "inventory.view"
  | "inventory.manage"
  | "inventory.view_cost"
  | "sales.create"
  | "sales.view_all"
  | "sales.discount"
  | "sales.void";

export interface UserRef {
  id: number;
  full_name: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Me extends User {
  permissions: Permission[];
}

export interface CategoryRef {
  id: number;
  name: string;
  allow_fractions: boolean;
}

export interface Category extends CategoryRef {
  item_count: number; // active items
}

export interface Item {
  id: number;
  sku: string | null;
  name: string;
  category: CategoryRef | null;
  unit: string;
  description: string | null;
  cost_price: Decimal | null;
  sale_price: Decimal;
  quantity: Decimal;
  reorder_level: Decimal | null;
  track_stock: boolean;
  allow_fractions: boolean; // false: whole numbers only (set by the category)
  attributes: Record<string, string>;
  is_active: boolean;
  low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemList {
  items: Item[];
  total: number;
}

export interface ItemMeta {
  units: string[];
}

export type MovementKind = "initial" | "receive" | "adjust" | "sale" | "void";

export interface Movement {
  id: number;
  kind: MovementKind;
  quantity_change: Decimal;
  quantity_after: Decimal;
  unit_cost: Decimal | null;
  note: string | null;
  sale_id: number | null;
  created_at: string;
  user: UserRef;
}

export type PaymentMethod =
  | "cash"
  | "card"
  | "bank_transfer"
  | "mobile_payment"
  | "cheque"
  | "credit"
  | "other";

export interface SaleLine {
  id: number;
  item_id: number;
  sku: string | null;
  name: string;
  unit: string;
  quantity: Decimal;
  unit_price: Decimal;
  discount: Decimal;
  line_total: Decimal;
}

export interface SaleSummary {
  id: number;
  invoice_number: string;
  status: "completed" | "void";
  customer_name: string | null;
  payment_method: PaymentMethod;
  total: Decimal;
  created_at: string;
  created_by: UserRef;
}

export interface Sale extends SaleSummary {
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  subtotal: Decimal;
  discount: Decimal;
  tax_rate: Decimal;
  tax_amount: Decimal;
  notes: string | null;
  voided_at: string | null;
  voided_by: UserRef | null;
  void_reason: string | null;
  lines: SaleLine[];
}

export interface SaleList {
  sales: SaleSummary[];
  total: number;
  total_amount: Decimal;
}

export interface BusinessSettings {
  business_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  currency: string;
  timezone: string;
  default_tax_rate: Decimal;
  invoice_prefix: string;
  next_invoice_number: number;
  invoice_footer: string | null;
}

export interface Dashboard {
  today_sales_count: number;
  today_sales_total: Decimal;
  active_items: number;
  low_stock_count: number;
  low_stock: Item[];
  recent_sales: SaleSummary[];
}
