# Data Model: Noon Financial Management Desktop App

**Feature**: 001-noon-finance-app
**Date**: 2026-05-08
**Storage**: SQLite (`data/noon.db`), initialized by `database.py` on first run

---

## Entity: Order

Represents a single line item from a noon marketplace CSV export. Each row maps to one
item within one order. An order can have multiple items (same `order_nr`, different
`item_nr`).

**Table**: `orders`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | Internal row ID |
| order_nr | TEXT | NOT NULL | Noon order number |
| item_nr | TEXT | NOT NULL | Noon item number within the order |
| sku | TEXT | | Noon internal SKU |
| partner_sku | TEXT | | Seller's own SKU |
| brand_en | TEXT | | Brand name (English) |
| brand_ar | TEXT | | Brand name (Arabic) |
| product_title_en | TEXT | | Product title (English) |
| product_title_ar | TEXT | | Product title (Arabic) |
| item_status | TEXT | | `'delivered'` or `'returned'` |
| ordered_date | TEXT | | Date string from CSV |
| delivered_date | TEXT | | Date string from CSV (nullable) |
| returned_date | TEXT | | Date string from CSV (nullable) |
| net_proceeds | REAL | DEFAULT 0 | Revenue for delivered items |
| referral_fee | REAL | DEFAULT 0 | Noon referral fee (stored as-is, may be negative) |
| fbn_outbound_fee | REAL | DEFAULT 0 | FBN outbound fee (stored as-is, may be negative) |
| total_payment | REAL | DEFAULT 0 | Net payout from noon |
| import_batch | TEXT | | Timestamp of the import run (for audit) |

**Constraints**:
- UNIQUE on `(order_nr, item_nr)` — enforces deduplication across imports
- INSERT OR IGNORE used during import to silently skip existing rows

**Business Rules**:
- Only rows where `item_status = 'delivered'` contribute to revenue
- `referral_fee` and `fbn_outbound_fee` are summed as `ABS()` for fee calculations
  regardless of status (noon charges fees on all rows)
- `net_proceeds` on returned items is 0 or null and excluded from revenue sums

---

## Entity: Product

Represents a unique SKU. Auto-populated from imported orders. Enriched by the seller
with cost data to enable profitability calculation.

**Table**: `products`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| sku | TEXT | PK | Noon internal SKU (from orders) |
| partner_sku | TEXT | | Seller's own SKU |
| brand_en | TEXT | | Brand (English) |
| brand_ar | TEXT | | Brand (Arabic) |
| name_en | TEXT | | Product name (English) |
| name_ar | TEXT | | Product name (Arabic) |
| unit_cost | REAL | DEFAULT 0 | Purchase cost per unit (SAR) |
| extra_costs | REAL | DEFAULT 0 | Additional per-unit costs (customs, shipping, packaging) |
| notes | TEXT | | Free text notes from seller |
| updated_at | TEXT | | ISO timestamp of last user edit |

**Business Rules**:
- Upserted from CSV import: if SKU already exists, do NOT overwrite user-entered costs
- A product with `unit_cost = 0 AND extra_costs = 0` is treated as "Unknown" for
  profitability badge purposes
- Profitability badge logic:
  - No cost entered (`unit_cost = 0 AND extra_costs = 0`) → gray "Unknown"
  - `net_profit > 0` → green "Profitable"
  - `net_profit <= 0` → red "Loss"

**Derived metrics** (computed at query time, not stored):
- `units_sold` = COUNT(orders WHERE sku=X AND item_status='delivered')
- `revenue` = SUM(net_proceeds WHERE sku=X AND item_status='delivered')
- `noon_fees` = SUM(ABS(referral_fee) + ABS(fbn_outbound_fee)) WHERE sku=X (all rows)
- `cogs` = unit_cost × units_sold
- `net_profit` = revenue − noon_fees − cogs − extra_costs
- `margin_pct` = (net_profit / revenue × 100) if revenue > 0 else None

---

## Entity: Invoice

Represents a supplier invoice, optionally with a PDF attachment and line items.

**Table**: `invoices`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | Internal ID |
| invoice_nr | TEXT | | Invoice number (user-provided) |
| supplier_name | TEXT | | Supplier name |
| invoice_date | TEXT | | Date (YYYY-MM-DD) |
| total_amount | REAL | | Invoice total (SAR) |
| vat_amount | REAL | DEFAULT 0 | VAT portion (SAR) |
| currency | TEXT | DEFAULT 'SAR' | Currency (SAR for v1) |
| notes | TEXT | | Free text notes |
| pdf_filename | TEXT | | Stored filename (`invoice_{timestamp}.pdf`) |
| pdf_original_name | TEXT | | Original uploaded filename (for display) |
| created_at | TEXT | | ISO timestamp of record creation |

**Business Rules**:
- `pdf_filename` is null if no PDF was uploaded
- On delete: the physical PDF file at `static/invoices/{pdf_filename}` MUST also be
  deleted from disk (handled in the delete route)
- `total_amount` is informational; it is NOT automatically summed from line items
  (seller may enter a total that includes items not broken out)

---

## Entity: Invoice Item

A line item within an invoice, linking a SKU to a quantity and cost.

**Table**: `invoice_items`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK AUTOINCREMENT | Internal ID |
| invoice_id | INTEGER | FK → invoices(id) ON DELETE CASCADE | Parent invoice |
| sku | TEXT | | SKU reference (no FK — SKU may not exist in products yet) |
| product_name | TEXT | | Product name at time of invoice (snapshot) |
| quantity | INTEGER | | Units purchased |
| unit_cost | REAL | | Cost per unit on this invoice |
| total_cost | REAL | | quantity × unit_cost (computed and stored) |

**Business Rules**:
- When an invoice with items is saved, the `unit_cost` for each item's SKU is written
  back to `products.unit_cost` and `products.updated_at`
- `total_cost` is computed client-side before submission and stored for display; it is
  NOT recomputed server-side (no integrity risk since it's a display field derived from
  `quantity × unit_cost`)
- No FK on `sku` → products because a seller may enter an invoice for a SKU not yet
  imported into the orders table

---

## Entity Relationships

```
orders ──────────── (many-to-one) ──→ products (via sku)
                                         ↑
invoice_items ──── (many-to-one) ──→ invoices (via invoice_id, CASCADE)
invoice_items ──── (many-to-one, soft) ──→ products (via sku, no FK)
```

---

## Index Recommendations

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup ON orders(order_nr, item_nr);
CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders(sku);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(item_status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
```

---

## Initialization

All tables and indexes created in `database.py` via `init_db()` called from `app.py`
at startup. Uses `CREATE TABLE IF NOT EXISTS` so re-running is safe.

`PRAGMA foreign_keys = ON` is executed on every connection (via `get_db()` helper), not
at schema creation time.
