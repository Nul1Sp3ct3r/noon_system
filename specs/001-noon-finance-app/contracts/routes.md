# API Contracts: Noon Financial Management Desktop App

**Feature**: 001-noon-finance-app
**Date**: 2026-05-08
**Base URL**: `http://localhost:5000`

All routes are served by a local Flask server. No authentication required (single-user
desktop app). All HTML responses render Jinja2 templates. JSON responses are for AJAX.

---

## Navigation Routes

### GET /
- **Purpose**: Entry point — redirect based on data availability
- **Logic**: If zero orders exist → redirect to `/import`. Otherwise → redirect to `/dashboard`.
- **Response**: 302 redirect

---

### GET /import
- **Purpose**: Render the CSV import page
- **Response**: HTML — `import.html`
- **Template context**: `{ "last_import": <batch_timestamp or None> }`

---

### POST /import/upload
- **Purpose**: Accept a noon CSV file upload and import orders
- **Request**: `multipart/form-data`
  - `csv_file` (file): noon marketplace CSV export
- **Response**: JSON
  ```json
  {
    "success": true,
    "orders_imported": 142,
    "orders_skipped": 8,
    "date_range": { "from": "2024-01-01", "to": "2024-03-31" },
    "product_count": 23,
    "new_skus": 3
  }
  ```
  On error:
  ```json
  { "success": false, "error": "Invalid file format or missing required columns" }
  ```
- **Side effects**:
  - Inserts new order rows (skips duplicates via INSERT OR IGNORE)
  - Upserts new SKUs into `products` (does NOT overwrite existing cost data)

---

## Dashboard

### GET /dashboard
- **Purpose**: Render the main dashboard
- **Response**: HTML — `dashboard.html`
- **Template context**: `{ "summary": <SummaryDict> }`
  ```python
  SummaryDict = {
    "revenue": float,            # SUM(net_proceeds) WHERE delivered
    "payout": float,             # SUM(total_payment) all rows
    "fees": float,               # SUM(ABS(referral_fee)+ABS(fbn_outbound_fee)) all rows
    "delivered_count": int,
    "returned_count": int,
    "net_profit": float,         # revenue - fees - total_cogs - total_extra
    "margin_pct": float | None,
  }
  ```

---

### GET /api/dashboard-data
- **Purpose**: JSON endpoint for Chart.js charts
- **Response**: JSON
  ```json
  {
    "daily_revenue": [
      { "date": "2024-01-15", "revenue": 1250.50 },
      ...
    ],
    "top_products": [
      { "sku": "ABC123", "name": "Product Name", "profit": 380.00 },
      ...
    ],
    "order_status": {
      "delivered": 142,
      "returned": 12
    }
  }
  ```
- `top_products` contains at most 5 entries, ordered by net_profit descending.

---

## Products

### GET /products
- **Purpose**: Render the products performance page
- **Query params**:
  - `brand` (optional): filter by brand name
  - `q` (optional): search term matched against name_en, name_ar, sku
  - `status` (optional): `profitable` | `loss` | `unknown`
- **Response**: HTML — `products.html`
- **Template context**: `{ "products": [ProductRow, ...], "brands": [str, ...] }`
  ```python
  ProductRow = {
    "sku": str,
    "name_en": str, "name_ar": str, "brand_en": str,
    "units_sold": int, "units_returned": int,
    "revenue": float, "fees": float,
    "cogs": float, "extra_costs": float,
    "net_profit": float, "margin_pct": float | None,
    "badge": "profitable" | "loss" | "unknown",
    "has_cost": bool,
  }
  ```

---

## Orders

### GET /orders
- **Purpose**: Render the full orders table
- **Query params**:
  - `q` (optional): keyword search across order_nr, sku, product_title_en
  - `status` (optional): `delivered` | `returned`
  - `from_date` (optional): YYYY-MM-DD
  - `to_date` (optional): YYYY-MM-DD
- **Response**: HTML — `orders.html`
- **Template context**: `{ "orders": [OrderRow, ...] }` where OrderRow mirrors all order
  columns.

---

## Costs

### GET /costs
- **Purpose**: Render the costs entry and P&L summary page
- **Response**: HTML — `costs.html`
- **Template context**:
  ```python
  {
    "products": [CostRow, ...],
    "pl_summary": [PLRow, ...],
    "totals": PLTotalsRow,
  }
  ```
  ```python
  CostRow = { "sku": str, "name_en": str, "units_sold": int,
               "unit_cost": float, "extra_costs": float, "notes": str }
  PLRow = { "sku": str, "name_en": str, "units_sold": int, "revenue": float,
             "fees": float, "cogs": float, "extra_costs": float,
             "net_profit": float, "margin_pct": float | None }
  PLTotalsRow = { "units_sold": int, "revenue": float, "fees": float,
                  "cogs": float, "extra_costs": float, "net_profit": float }
  ```

---

### POST /costs/save
- **Purpose**: Save updated product costs
- **Request**: `application/x-www-form-urlencoded`
  - Repeating fields: `sku[]`, `unit_cost[]`, `extra_costs[]`, `notes[]`
  - All arrays are parallel (index-aligned)
- **Response**: JSON
  ```json
  { "success": true, "updated": 5 }
  ```

---

## Invoices

### GET /invoices
- **Purpose**: Render the add-invoice form and invoice list
- **Response**: HTML — `invoices.html`
- **Template context**:
  ```python
  {
    "invoices": [InvoiceSummary, ...],
    "products": [{ "sku": str, "name_en": str }, ...],  # for SKU dropdown
  }
  ```
  ```python
  InvoiceSummary = {
    "id": int, "invoice_nr": str, "supplier_name": str,
    "invoice_date": str, "total_amount": float, "vat_amount": float,
    "pdf_filename": str | None, "pdf_original_name": str | None,
    "created_at": str,
  }
  ```

---

### POST /invoices/add
- **Purpose**: Create a new invoice with optional PDF and line items
- **Request**: `multipart/form-data`
  - `invoice_nr` (text)
  - `supplier_name` (text)
  - `invoice_date` (date: YYYY-MM-DD)
  - `total_amount` (number)
  - `vat_amount` (number, optional, default 0)
  - `notes` (text, optional)
  - `pdf_file` (file, optional, PDF only)
  - `item_sku[]`, `item_name[]`, `item_qty[]`, `item_unit_cost[]`, `item_total[]`
    (parallel arrays for line items; omit if no items)
- **Response**: JSON
  ```json
  { "success": true, "invoice_id": 7 }
  ```
  On error:
  ```json
  { "success": false, "error": "Invalid file type. Only PDF allowed." }
  ```
- **Side effects**:
  - PDF saved to `static/invoices/invoice_{timestamp}.pdf`
  - Invoice + items inserted into DB
  - If items present: `products.unit_cost` and `products.updated_at` updated for each SKU

---

### GET /invoices/\<int:invoice_id\>
- **Purpose**: Render invoice detail page
- **Response**: HTML — `invoice_detail.html`
- **Template context**:
  ```python
  {
    "invoice": InvoiceSummary,
    "items": [InvoiceItemRow, ...],
  }
  ```
  ```python
  InvoiceItemRow = { "sku": str, "product_name": str, "quantity": int,
                      "unit_cost": float, "total_cost": float }
  ```
- **Error**: 404 if invoice not found

---

### POST /invoices/\<int:invoice_id\>/delete
- **Purpose**: Delete an invoice record and its PDF file
- **Response**: JSON
  ```json
  { "success": true }
  ```
- **Side effects**:
  - Deletes invoice row (CASCADE deletes invoice_items via FK)
  - Deletes `static/invoices/{pdf_filename}` from disk if it exists (no error if missing)

---

### GET /invoices/pdf/\<filename\>
- **Purpose**: Serve a stored PDF for inline viewing
- **Security**: Only filenames matching `invoice_*.pdf` pattern are served. Directory
  traversal (`..`) in filename returns 400.
- **Response**: PDF binary with `Content-Type: application/pdf`
- **Error**: 404 if file not found

---

## Reports

### GET /reports
- **Purpose**: Render the reports page with summary text
- **Response**: HTML — `reports.html`
- **Template context**:
  ```python
  {
    "monthly_summary": [{ "month": "2024-01", "profit": float }, ...],
    "best_product": { "sku": str, "name_en": str, "net_profit": float } | None,
    "worst_product": { "sku": str, "name_en": str, "net_profit": float } | None,
  }
  ```

---

### GET /reports/export
- **Purpose**: Export data as Excel; type is specified by query param
- **Query params**:
  - `type`: `pl` (P&L table) | `orders` (all orders)
- **Response**: Excel file download
  - `pl` → filename `noon_pl_{YYYYMMDD}.xlsx`, columns: SKU, Name, Units, Revenue,
    Fees, COGS, Extra Costs, Net Profit, Margin%
  - `orders` → filename `noon_orders_{YYYYMMDD}.xlsx`, all order columns
- **Error**: 400 if `type` param missing or invalid

---

## Error Handling Conventions

- All POST routes return JSON `{ "success": false, "error": "<message>" }` on failure
- HTML routes return 404 for missing records
- CSV import with bad format returns JSON error (not a redirect) so the client can
  display the message inline without a page reload
- Unexpected server errors return JSON `{ "success": false, "error": "Internal error" }`
  with HTTP 500
