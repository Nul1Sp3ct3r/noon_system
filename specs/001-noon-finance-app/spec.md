# Feature Specification: Noon Financial Management Desktop App

**Feature Branch**: `001-noon-finance-app`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "Build a Python desktop application for Windows that runs as an EXE — financial management system for noon marketplace sales with invoice management module"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Import Sales Data and View Dashboard (Priority: P1)

A noon marketplace seller double-clicks the application on their Windows PC. The app opens in their browser and greets them with a dashboard. They upload their noon sales CSV report, and within seconds they can see a high-level financial summary: total revenue, fees paid to noon, delivered and returned orders, net profit, and overall margin.

**Why this priority**: This is the foundational flow — without sales data and a summary view, no other feature is useful. It unlocks the entire system.

**Independent Test**: Can be fully tested by importing a noon CSV file and verifying the dashboard displays correct revenue, fee, and order count figures.

**Acceptance Scenarios**:

1. **Given** the app is launched for the first time, **When** the user opens it, **Then** the browser opens automatically at localhost:5000 and redirects to the import page since no data exists.
2. **Given** the user is on the import page, **When** they upload a valid noon CSV file, **Then** the system parses it, skips any duplicate orders, and shows a summary of imported order count, date range, and distinct product count.
3. **Given** sales data has been imported, **When** the user navigates to the dashboard, **Then** they see summary cards for Revenue, Payout, Fees, Delivered Orders, Returned Orders, Net Profit, and Margin %, all calculated correctly.
4. **Given** sales data exists, **When** the dashboard loads, **Then** charts display daily revenue over time, top 5 products by profit, and a delivered vs. returned breakdown.
5. **Given** the user imports the same CSV again, **When** the import runs, **Then** duplicate rows are skipped and no double-counting occurs.

---

### User Story 2 — Manage Product Costs and View Profitability (Priority: P2)

The seller needs to enter what each product actually cost them (purchase price, customs, packaging) so the app can calculate true profit per SKU. They go to the Costs page, fill in unit cost and extra costs per product, save, and immediately see an updated P&L summary table.

**Why this priority**: Revenue alone is meaningless without cost data. This story transforms raw sales figures into actionable profit insight.

**Independent Test**: Can be fully tested by entering costs for a SKU and verifying the P&L table reflects correct COGS, net profit, and margin % for that product.

**Acceptance Scenarios**:

1. **Given** products have been auto-populated from imported orders, **When** the user opens the Costs page, **Then** all known SKUs appear in a table with editable unit cost, extra costs, and notes fields.
2. **Given** the user enters a unit cost and extra costs for a SKU, **When** they save, **Then** the P&L summary table below updates to show correct COGS, Net Profit, and Margin % for that product.
3. **Given** a product has no cost entered, **When** it appears in the Products table, **Then** it shows a gray "Unknown" badge rather than incorrect profitability data.
4. **Given** costs are saved for all SKUs, **When** the user views the dashboard, **Then** the Net Profit and Margin % cards reflect all cost deductions.

---

### User Story 3 — Manage Supplier Invoices (Priority: P2)

The seller wants to record supplier invoices — including uploading the PDF, noting line items per SKU, and being able to retrieve or delete invoices later. Entering invoice line items optionally auto-updates product unit costs.

**Why this priority**: Invoices are the source of truth for product costs and provide an audit trail for financial records. Equally important to profitability tracking.

**Independent Test**: Can be fully tested by adding an invoice with line items and a PDF, verifying the invoice list shows it, opening the detail page with the embedded PDF, and then deleting it.

**Acceptance Scenarios**:

1. **Given** the user is on the Invoices page, **When** they fill in invoice fields (number, supplier, date, amount, VAT, notes) and save, **Then** the invoice appears in the list below.
2. **Given** the user uploads a PDF during invoice creation, **When** the invoice is saved, **Then** a PDF icon appears in the invoices list and the file is stored locally.
3. **Given** an invoice has been saved, **When** the user clicks "View PDF", **Then** the PDF opens in a new browser tab.
4. **Given** the user adds line items (SKU, quantity, unit cost) to an invoice, **When** the invoice is saved, **Then** the unit_cost for each affected SKU is updated in the product cost table.
5. **Given** an invoice exists in the list, **When** the user clicks "Delete" and confirms, **Then** the invoice record and its PDF file are both permanently removed.
6. **Given** the user clicks "Details" on an invoice, **When** the detail page loads, **Then** all invoice fields and line items are displayed, with the PDF embedded inline.

---

### User Story 4 — Browse Orders and Products (Priority: P3)

The seller needs to drill into the raw order data and see per-product performance details (sold count, returns, revenue, fees, profit, margin badge) with search and filter capabilities.

**Why this priority**: Useful for investigation and verification, but the core value (P1/P2) is delivered without it.

**Independent Test**: Can be fully tested by verifying the Orders table shows all imported rows with correct fields, and the Products table shows correct per-SKU aggregates with profit badges.

**Acceptance Scenarios**:

1. **Given** orders are imported, **When** the user opens the Orders page, **Then** all orders appear in a table with all fields; the user can search by keyword, filter by status (delivered/returned), and filter by date range.
2. **Given** orders are imported, **When** the user opens the Products page, **Then** each SKU row shows name, brand, sold count, return count, revenue, fees, COGS, extra costs, net profit, margin %, and a colored profit badge.
3. **Given** the Products page is open, **When** the user filters by brand, searches by name, or filters by profitability status, **Then** the table updates to show only matching rows.

---

### User Story 5 — Export Financial Reports (Priority: P3)

The seller wants to export their P&L and orders data to Excel for sharing or offline analysis, and see a quick written summary of monthly performance.

**Why this priority**: Useful enhancement; the app already computes everything needed. Exportability is expected in any financial tool.

**Independent Test**: Can be fully tested by clicking export buttons and verifying the downloaded Excel files contain the correct data with proper columns.

**Acceptance Scenarios**:

1. **Given** the user is on the Reports page, **When** they click "Export P&L to Excel", **Then** an Excel file downloads containing all SKU-level P&L data.
2. **Given** the user is on the Reports page, **When** they click "Export Orders to Excel", **Then** an Excel file downloads containing all order rows.
3. **Given** sales data exists, **When** the user views the Reports page, **Then** a written summary shows monthly profit totals, the best-performing product, and the worst-performing product.

---

### Edge Cases

- What happens when an uploaded CSV is malformed, missing required columns, or contains null values?
- What happens if the user uploads a non-PDF file on the Invoices page?
- What happens if the user tries to import a CSV when no data has changed (full duplicate)?
- How does margin calculation behave when revenue is zero (division by zero)?
- What happens if the app is launched and port 5000 is already in use?
- What happens when the user deletes an invoice whose PDF file is already missing from disk?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST launch automatically in the user's default browser at http://localhost:5000 when the application is opened, with no terminal window visible.
- **FR-002**: System MUST redirect first-time users (no data) to the import page and return users to the dashboard.
- **FR-003**: System MUST accept noon marketplace CSV files and import order rows into local storage, skipping rows that are exact duplicates (matched on order number + item number).
- **FR-004**: System MUST auto-create product records for any new SKUs encountered during CSV import.
- **FR-005**: System MUST calculate revenue, fees, COGS, extra costs, net profit, and margin % per SKU using the defined accounting rules (delivered = revenue; returned = no revenue; fees apply to all rows).
- **FR-006**: System MUST display a dashboard with summary cards and three charts (daily revenue over time, top 5 products by profit, delivered vs. returned ratio).
- **FR-007**: System MUST allow the user to enter and save unit cost and extra costs per SKU, with changes immediately reflected in the P&L summary.
- **FR-008**: System MUST display a products page showing per-SKU performance with a Profitable / Loss / Unknown badge determined by whether cost data has been entered and what the net profit is.
- **FR-009**: System MUST display an orders page with search, status filter, and date range filter.
- **FR-010**: System MUST allow the user to create invoices with: invoice number, supplier name, date, total amount, VAT amount, notes, an optional PDF upload, and optional line items per SKU.
- **FR-011**: System MUST store uploaded PDFs locally using unique filenames and serve them back for viewing in-browser.
- **FR-012**: System MUST allow the user to view invoice details (including embedded PDF), and delete an invoice along with its associated PDF file.
- **FR-013**: System MUST auto-update product unit costs when invoice line items are saved.
- **FR-014**: System MUST export P&L data and orders data as Excel files on demand.
- **FR-015**: System MUST store all data and files locally on disk; no network or cloud dependency required.
- **FR-016**: System MUST initialize storage (database and file directories) automatically on first run without any manual setup.
- **FR-017**: System MUST handle missing or null values in CSV files gracefully without crashing.
- **FR-018**: System MUST display all monetary values in SAR with two decimal places.
- **FR-019**: System MUST present the interface in Arabic (RTL layout).

### Key Entities

- **Order**: A single marketplace transaction line, tied to a SKU and an order number. Has a status (delivered or returned), financial fields (proceeds, fees, payout), and dates.
- **Product**: A unique SKU with Arabic and English names and brand. Carries user-entered cost data (unit cost, extra costs). Aggregated metrics are derived from linked orders.
- **Invoice**: A supplier document with header fields and an optional PDF attachment. Can have multiple line items.
- **Invoice Item**: A line within an invoice, linking a SKU to a quantity and unit cost.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can import a noon CSV file and see dashboard summary figures within 10 seconds of upload completion.
- **SC-002**: All P&L calculations (revenue, fees, COGS, net profit, margin) match manually verified figures from the same CSV data with zero discrepancy.
- **SC-003**: Re-importing the same CSV file results in zero new records added (full duplicate detection).
- **SC-004**: A user can create an invoice with a PDF attachment and line items in under 2 minutes.
- **SC-005**: Exported Excel files contain all expected rows and columns without data loss or corruption.
- **SC-006**: The app starts and the browser opens within 3 seconds of the user launching it on a Windows machine.
- **SC-007**: All data persists correctly between app restarts with no data loss.

## Assumptions

- The target user is a sole operator or small team managing their own noon marketplace seller account; no multi-user or role-based access control is required.
- The noon CSV export format is consistent and fixed; the system is not required to handle multiple CSV format versions.
- Arabic (RTL) is the sole UI language; no localization or language switcher is required for v1.
- The application runs on a single Windows machine; no network sharing or remote access is in scope.
- Currency is always SAR; no multi-currency support is required for v1.
- The user is expected to keep the app running while using the browser interface; no background service / system-tray mode is required for v1.
- PDF viewer availability in the browser is assumed (standard modern browsers support inline PDF rendering).
- Internet connectivity is not required at runtime; CDN-hosted frontend libraries are acceptable as they will be cached after first load.
