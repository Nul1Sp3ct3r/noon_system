---
description: "Task list for Noon Financial Management Desktop App"
---

# Tasks: Noon Financial Management Desktop App

**Input**: Design documents from `specs/001-noon-finance-app/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/routes.md ✅ quickstart.md ✅

**Tests**: Not included — spec explicitly excludes automated tests for v1.

**Organization**: Tasks are grouped by user story to enable independent implementation
and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths are included in every task description

## Path Conventions

All source files at repository root: `app.py`, `database.py`, `templates/`, `static/`

---

## Phase 1: Setup

**Purpose**: Project files and directory structure

- [x] T001 Create `requirements.txt` with: `flask`, `pandas`, `openpyxl`, `werkzeug`
- [x] T002 [P] Create `build.bat` — PyInstaller build script: installs requirements, installs pyinstaller, runs `pyinstaller --onefile --windowed --add-data "templates;templates" --add-data "static;static" --name "NoonFinancial" app.py`, prints completion message
- [x] T003 [P] Create placeholder directories `data/`, `static/uploads/`, `static/invoices/` each with a `.gitkeep` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create `database.py` — implement `init_db()` creating all 4 tables (`orders`, `products`, `invoices`, `invoice_items`) with exact schema from `data-model.md`; add UNIQUE index on `orders(order_nr, item_nr)`; add indexes on `orders(sku)`, `orders(item_status)`, `invoice_items(invoice_id)`; implement `get_db()` returning a connection with `PRAGMA foreign_keys = ON` and `row_factory = sqlite3.Row`
- [x] T005 Create `app.py` skeleton — implement two-root path resolution (`BUNDLE_DIR` = `sys._MEIPASS` when frozen else script dir; `BASE_DIR` = `os.path.dirname(sys.executable)` when frozen else script dir); instantiate Flask with `template_folder=os.path.join(BUNDLE_DIR, 'templates')` and `static_folder=os.path.join(BUNDLE_DIR, 'static')`; define `DB_PATH`, `INVOICES_DIR`, `UPLOADS_DIR` constants rooted at `BASE_DIR`; call `os.makedirs()` for `data/`, `static/invoices/`, `static/uploads/` on startup; call `init_db()`; implement `open_browser()` daemon thread with 1.5s sleep; add `if __name__ == '__main__':` block
- [x] T006 Create `templates/base.html` — full RTL skeleton (`<html dir="rtl" lang="ar">`); load Tajawal font from Google Fonts CDN; load Bootstrap 5 RTL CSS from jsdelivr CDN; load Bootstrap Icons CSS from jsdelivr CDN; fixed RTL sidebar with nav links for: Import, Dashboard, Products, Orders, Costs, Invoices, Reports; main content area `{% block content %}{% endblock %}`; load Bootstrap 5 JS bundle and Chart.js 4 UMD from CDN at bottom of body

**Checkpoint**: App launches (`python app.py`), browser opens at http://localhost:5000, SQLite DB created at `data/noon.db`, base template available for all pages

---

## Phase 3: User Story 1 — Import Sales Data & View Dashboard (Priority: P1) 🎯 MVP

**Goal**: User imports a noon CSV and sees a complete financial dashboard with charts

**Independent Test**: Import a noon CSV → confirm import summary shows correct counts → navigate to dashboard → verify all 7 summary cards show correct values → confirm all 3 charts render

### Implementation for User Story 1

- [x] T007 [P] [US1] Create `templates/import.html` — extends `base.html`; file upload form (`<input type="file" accept=".csv">`); import result area (hidden initially, shown after AJAX response) displaying: order count, skipped count, date range, product count, new SKUs count; JS to submit form via `fetch POST /import/upload` and render JSON response inline without page reload
- [x] T008 [US1] Implement `GET /import` in `app.py` — render `import.html` with last import batch timestamp from DB (or None)
- [x] T009 [US1] Implement `POST /import/upload` in `app.py` — validate file extension is `.csv`; read with `pd.read_csv()` stripping column name whitespace; map CSV headers to DB columns per research.md mapping table; coerce numeric columns with `pd.to_numeric(errors='coerce').fillna(0)`; fill text columns with `fillna('')`; generate `import_batch` timestamp; bulk `INSERT OR IGNORE INTO orders` for all rows; upsert new SKUs to `products` (INSERT OR IGNORE — do NOT overwrite existing cost data); return JSON: `{success, orders_imported, orders_skipped, date_range, product_count, new_skus}`
- [x] T010 [US1] Implement `GET /` in `app.py` — query `SELECT COUNT(*) FROM orders`; if 0 redirect to `/import`, else redirect to `/dashboard`
- [x] T011 [P] [US1] Create `templates/dashboard.html` — extends `base.html`; 7 summary cards in a Bootstrap grid (Revenue, Payout, Fees, Delivered count, Returned count, Net Profit, Margin %); green/blue/red/amber colors per spec; 3 `<canvas>` elements for charts; JS block using Chart.js to fetch `/api/dashboard-data` and render: bar chart (daily revenue by date), horizontal bar (top 5 products by profit), doughnut (delivered vs returned); all numbers formatted `.toFixed(2)` with "SAR " prefix
- [x] T012 [US1] Implement `GET /dashboard` in `app.py` — run aggregation query: `SUM(net_proceeds WHERE delivered)` → revenue; `SUM(total_payment)` → payout; `SUM(ABS(referral_fee)+ABS(fbn_outbound_fee))` → fees; `COUNT(delivered)` and `COUNT(returned)`; join products to compute total COGS and extra costs; derive net_profit and margin_pct (guard for revenue=0); render `dashboard.html` with summary dict
- [x] T013 [US1] Implement `GET /api/dashboard-data` in `app.py` — return JSON with: `daily_revenue` list (group orders by ordered_date, sum net_proceeds for delivered); `top_products` list (top 5 SKUs by computed net_profit, include sku and name_en); `order_status` dict (delivered count, returned count)

**Checkpoint**: US1 fully functional — CSV import works, duplicates skipped, dashboard cards and all 3 charts display correct data

---

## Phase 4: User Story 2 — Manage Product Costs and View Profitability (Priority: P2)

**Goal**: User enters unit cost and extra costs per SKU; P&L table updates immediately

**Independent Test**: Open Costs page → enter unit cost for one SKU → save → verify P&L table shows correct COGS, net profit, and margin for that SKU

### Implementation for User Story 2

- [x] T014 [P] [US2] Create `templates/costs.html` — extends `base.html`; Section 1: editable table (one row per SKU) with columns: Product Name, Units Sold, Unit Cost input, Extra Costs input, Notes input; single "Save All" button; Section 2: read-only P&L summary table with columns: Product, Units, Revenue, Fees, COGS, Extra Costs, Net Profit, Margin %; totals row at bottom; numbers formatted to 2 decimal SAR; margin rendered as "—" when revenue is 0
- [x] T015 [US2] Implement `GET /costs` in `app.py` — run per-SKU aggregation query (same as dashboard but per product); compute units_sold, revenue, noon_fees, cogs, net_profit, margin_pct for each SKU; render `costs.html` with `products` list (for cost editor) and `pl_summary` list + `totals` dict
- [x] T016 [US2] Implement `POST /costs/save` in `app.py` — accept parallel arrays `sku[]`, `unit_cost[]`, `extra_costs[]`, `notes[]` from form; validate each value; batch `UPDATE products SET unit_cost=?, extra_costs=?, notes=?, updated_at=? WHERE sku=?`; return JSON `{success: true, updated: N}`

**Checkpoint**: US2 fully functional — costs saved, P&L updates correctly, margin=None displays as "—"

---

## Phase 5: User Story 3 — Manage Supplier Invoices (Priority: P2)

**Goal**: User creates invoices with PDF attachments and line items, views details, deletes records

**Independent Test**: Create invoice with PDF and 2 line items → verify it appears in list → click "Details" → verify PDF renders in iframe → click "Delete" → verify record and PDF file are gone

### Implementation for User Story 3

- [x] T017 [P] [US3] Create `templates/invoices.html` — extends `base.html`; Add Invoice form at top: fields for invoice_nr, supplier_name, invoice_date (date picker), total_amount, vat_amount, notes; PDF upload button (accepts PDF only); dynamic line items table with "Add Item" button — each row: SKU dropdown (populated from products), auto-filled product_name, quantity, unit_cost, auto-calculated total, delete-row button; running total shown below table; Save Invoice button; Invoices list table below form: columns Invoice Nr, Supplier, Date, Amount SAR, VAT, PDF (red PDF icon if file exists, dash otherwise), Actions (View PDF / Details / Delete with confirmation dialog); JS for dynamic row addition, auto-fill product name on SKU select, row total calculation, running total update, PDF upload filename display, AJAX form submission
- [x] T018 [P] [US3] Create `templates/invoice_detail.html` — extends `base.html`; display all invoice header fields in a card; line items table (SKU, Product Name, Qty, Unit Cost, Total); PDF iframe `<iframe src="/invoices/pdf/{{ invoice.pdf_filename }}" width="100%" height="600px">` shown only if pdf_filename is set; Delete button with confirmation
- [x] T019 [US3] Implement `GET /invoices` in `app.py` — fetch all invoices ordered by created_at DESC; fetch all products (sku, name_en) for SKU dropdown; render `invoices.html`
- [x] T020 [US3] Implement `POST /invoices/add` in `app.py` — if `pdf_file` in request.files and file extension is `.pdf`: save as `invoice_{YYYYMMDD_HHMMSS}.pdf` to `INVOICES_DIR`; store original filename; insert invoice row; parse parallel line item arrays and insert all `invoice_items` rows; for each line item with a valid SKU: `UPDATE products SET unit_cost=?, updated_at=? WHERE sku=?`; return JSON `{success: true, invoice_id: N}`; on invalid file type return `{success: false, error: "..."}` with 400
- [x] T021 [US3] Implement `GET /invoices/<int:invoice_id>` in `app.py` — fetch invoice by id (404 if not found); fetch all invoice_items for that invoice; render `invoice_detail.html`
- [x] T022 [US3] Implement `POST /invoices/<int:invoice_id>/delete` in `app.py` — fetch invoice to get pdf_filename; delete DB row (FK cascade deletes invoice_items); if pdf_filename: delete `os.path.join(INVOICES_DIR, pdf_filename)` silently if missing; return JSON `{success: true}`
- [x] T023 [US3] Implement `GET /invoices/pdf/<filename>` in `app.py` — validate filename matches `re.match(r'^invoice_\d{8}_\d{6}\.pdf$', filename)`, return 400 if not; use `send_from_directory(INVOICES_DIR, filename, mimetype='application/pdf')`; return 404 if file missing

**Checkpoint**: US3 fully functional — invoices created, PDFs stored and served, cascade delete removes both record and file

---

## Phase 6: User Story 4 — Browse Orders and Products (Priority: P3)

**Goal**: User can search/filter the full orders table and view per-SKU performance with profit badges

**Independent Test**: Open Products page → verify all SKUs appear with correct badges → filter by brand → confirm table narrows → open Orders page → search by order number → verify matching row shown

### Implementation for User Story 4

- [x] T024 [P] [US4] Create `templates/products.html` — extends `base.html`; filter bar: brand dropdown, keyword search input, profitability status filter (All / Profitable / Loss / Unknown); table: columns SKU, Brand, Name EN/AR, Sold, Returned, Revenue, Fees, COGS, Extra Costs, Net Profit, Margin %; colored badge per row (green "Profitable" / red "Loss" / gray "Unknown"); all SAR values formatted to 2 decimal places; JS for client-side filter form submission via GET params
- [x] T025 [US4] Implement `GET /products` in `app.py` — accept query params `brand`, `q`, `status`; run per-SKU aggregation query with LEFT JOIN; compute profit metrics in Python; apply filters; collect unique brands list for dropdown; render `products.html`
- [x] T026 [P] [US4] Create `templates/orders.html` — extends `base.html`; filter bar: keyword search, status dropdown (All/Delivered/Returned), from_date and to_date date pickers; table with all order columns; status badge (green Delivered / red Returned); dates displayed as-is from DB
- [x] T027 [US4] Implement `GET /orders` in `app.py` — accept query params `q`, `status`, `from_date`, `to_date`; build WHERE clause dynamically with parameterized queries; `ORDER BY ordered_date DESC`; render `orders.html`

**Checkpoint**: US4 fully functional — orders and products browsable with working search and filters

---

## Phase 7: User Story 5 — Export Financial Reports (Priority: P3)

**Goal**: User downloads Excel exports and sees a written monthly performance summary

**Independent Test**: Click "Export P&L" → verify Excel file downloads with correct columns → click "Export Orders" → verify Excel has all order rows → verify reports page shows monthly summary text

### Implementation for User Story 5

- [x] T028 [P] [US5] Create `templates/reports.html` — extends `base.html`; written summary section: monthly profit table (month, revenue, fees, net profit), best product card, worst product card; two export buttons: "Export P&L to Excel" (links to `/reports/export?type=pl`) and "Export Orders to Excel" (links to `/reports/export?type=orders`)
- [x] T029 [US5] Implement `GET /reports` in `app.py` — aggregate orders by month (group by `strftime('%Y-%m', ordered_date)`); compute monthly net profit including all costs; identify best and worst SKU by net_profit; render `reports.html`
- [x] T030 [US5] Implement `GET /reports/export` in `app.py` — validate `type` param (`pl` or `orders`, return 400 otherwise); for `pl`: run per-SKU P&L query, build openpyxl workbook with headers `[SKU, Name EN, Units Sold, Revenue, Fees, COGS, Extra Costs, Net Profit, Margin %]`, write rows, save to `BytesIO`, return with `send_file()` as attachment `noon_pl_{YYYYMMDD}.xlsx`; for `orders`: query all orders, build workbook with all order columns, return as `noon_orders_{YYYYMMDD}.xlsx`

**Checkpoint**: US5 fully functional — both Excel exports download with correct data, reports page shows summary

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and hardening across all stories

- [x] T031 [P] Verify number formatting across all templates — SAR currency with 2 decimal places, margin "—" when revenue=0, all badge colors (#3B6D11 green / #A32D2D red / gray #6c757d) consistent in `templates/products.html` and `templates/costs.html`
- [x] T032 [P] Test EXE build end-to-end — run `build.bat` on Windows, verify `dist/NoonFinancial.exe` launches, browser opens automatically, `data/noon.db` is created next to EXE (not inside temp dir), PDF uploads persist between restarts
- [x] T033 Run quickstart.md validation checklist — execute all 8 checklist items in `specs/001-noon-finance-app/quickstart.md` to confirm app works end-to-end from a clean state
- [x] T034 [P] Harden error responses — verify all POST routes return `{success: false, error: "..."}` on bad input; verify CSV import with missing required columns returns a clear error message; verify non-PDF upload to `/invoices/add` returns 400

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP, unblocks everything else
- **US2 (Phase 4)**: Depends on Foundational — independent of US1 but builds on same DB
- **US3 (Phase 5)**: Depends on Foundational — independent of US1/US2
- **US4 (Phase 6)**: Depends on Foundational and US1 (needs imported data to be meaningful)
- **US5 (Phase 7)**: Depends on US2 (needs cost data for P&L export to be accurate)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — pure foundation
- **US2 (P2)**: No dependency on US1; auto-populated SKUs come from import but costs page works without data
- **US3 (P2)**: No dependency on US1 or US2 — invoices are standalone
- **US4 (P3)**: No code dependency on other stories; practically needs US1 data to verify
- **US5 (P3)**: No code dependency; practically needs US2 cost data for accurate P&L export

### Within Each User Story

- Route template before route implementation (template defines what data is needed)
- GET route before POST route (GET informs POST requirements)
- For US3: GET /invoices before POST /invoices/add (shares products dropdown data)

### Parallel Opportunities

- T002 (build.bat) and T003 (directories) in parallel during Setup
- T007 (import.html) and T011 (dashboard.html) in parallel within US1
- T014 (costs.html) is independent of US1 implementation
- T017 (invoices.html) and T018 (invoice_detail.html) can be built in parallel
- T024 (products.html) and T026 (orders.html) in parallel within US4
- T031, T032, T034 polish tasks can run in parallel

---

## Parallel Example: User Story 3

```bash
# Build both invoice templates in parallel:
Task: "Create templates/invoices.html (T017)"
Task: "Create templates/invoice_detail.html (T018)"

# Then implement routes sequentially:
Task: "GET /invoices (T019)"
Task: "POST /invoices/add (T020)"
Task: "GET /invoices/<id> (T021)"
Task: "POST /invoices/<id>/delete (T022)"
Task: "GET /invoices/pdf/<filename> (T023)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T006)
3. Complete Phase 3: US1 (T007–T013)
4. **STOP and VALIDATE**: Import a noon CSV, verify all dashboard cards, verify all 3 charts render
5. Ship MVP — seller can view their P&L at a glance

### Incremental Delivery

1. Setup + Foundational → app runs
2. US1 → CSV import + dashboard (MVP!)
3. US2 → add cost entry → true profitability visible
4. US3 → add invoice management → full financial record keeping
5. US4 → add browse/filter → exploration and investigation
6. US5 → add exports → offline reporting

### Parallel Team Strategy

With two developers:

- Developer A: US1 + US2 (import pipeline + cost management)
- Developer B: US3 (invoice management — fully independent)
- Both: US4, US5, Polish after US1–US3 done

---

## Notes

- [P] tasks write to different files and have no cross-dependencies
- [Story] label maps task to specific user story for traceability
- All templates extend `base.html` — sidebar navigation is inherited
- `app.py` accumulates routes across phases — implement each route group in the
  phase where its story is worked, not all at once
- Avoid same-file conflicts: only one developer modifies `app.py` at a time, or
  use feature branches per user story
- Commit after each completed phase/checkpoint
- The EXE two-root path pattern (BUNDLE_DIR vs BASE_DIR) in `app.py` is the single most
  critical implementation detail — any deviation causes data loss in the EXE build
