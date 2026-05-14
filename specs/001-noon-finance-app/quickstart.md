# Quickstart: Noon Financial Management Desktop App

**Feature**: 001-noon-finance-app
**Date**: 2026-05-08

---

## Running from Source (Development)

### Prerequisites

- Python 3.11+
- pip

### Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Run the app
python app.py
```

The browser will open automatically at http://localhost:5000 after ~1.5 seconds.

### Project structure at runtime

```
noon_system/
├── app.py              ← Entry point; starts Flask + opens browser
├── database.py         ← DB init + connection helper
├── requirements.txt
├── build.bat           ← EXE build script (Windows only)
├── data/
│   └── noon.db         ← SQLite database (auto-created on first run)
├── static/
│   ├── uploads/        ← Saved noon CSV files (auto-created)
│   └── invoices/       ← Saved invoice PDFs (auto-created)
└── templates/
    ├── base.html
    ├── dashboard.html
    ├── products.html
    ├── orders.html
    ├── costs.html
    ├── import.html
    ├── invoices.html
    ├── invoice_detail.html
    └── reports.html
```

---

## Building the Windows EXE

### Prerequisites (Windows)

- Python 3.11+ installed and on PATH
- pip

### Build steps

```bat
build.bat
```

This script:
1. Installs all dependencies from `requirements.txt`
2. Installs PyInstaller
3. Runs PyInstaller with `--onefile --windowed` to produce a single EXE with no console window
4. Output: `dist\NoonFinancial.exe`

### EXE runtime layout

When `NoonFinancial.exe` runs, it extracts bundled assets (templates, static JS/CSS) to
a temporary directory (`sys._MEIPASS`). User data is stored next to the EXE:

```
(wherever the user placed NoonFinancial.exe)/
├── NoonFinancial.exe
└── data/
    └── noon.db         ← database persists between runs
static/
├── invoices/           ← invoice PDFs (created next to EXE)
└── uploads/            ← CSV uploads (created next to EXE)
```

**Important**: Do not move `NoonFinancial.exe` without also moving the `data/` and
`static/` folders, or data will be lost.

---

## First-time Use

1. Launch `NoonFinancial.exe` (or `python app.py`).
2. Browser opens to the **Import** page (no data exists yet).
3. Click **Upload CSV** and select your noon marketplace CSV export.
4. After import, the dashboard shows a financial summary.
5. Go to **Costs** to enter product unit costs and extra costs.
6. Dashboard and Products page now show correct P&L figures.

---

## Importing noon CSV Data

- Download your orders report from the noon Seller Central portal.
- The CSV must contain standard noon export columns (see `research.md` for mapping).
- Re-importing the same CSV is safe — duplicates are skipped automatically.
- Each import is stamped with a batch timestamp for audit purposes.

---

## Managing Invoices

1. Go to the **Invoices** page.
2. Fill in the invoice header fields.
3. Optionally upload the supplier PDF.
4. Optionally add line items per SKU (this updates product costs automatically).
5. Click **Save Invoice**.
6. Use **View PDF** to open the PDF in a browser tab.
7. Use **Details** to see the full invoice with embedded PDF.
8. Use **Delete** to remove the invoice and its PDF from disk.

---

## Exporting Reports

Go to the **Reports** page and use the export buttons:
- **Export P&L to Excel**: Downloads `noon_pl_YYYYMMDD.xlsx`
- **Export Orders to Excel**: Downloads `noon_orders_YYYYMMDD.xlsx`

---

## Validation: Is the app working correctly?

Run through this checklist after initial setup:

- [ ] App launches and browser opens automatically
- [ ] Import a noon CSV → summary shows correct order count
- [ ] Dashboard cards show non-zero revenue for delivered orders
- [ ] Re-import the same CSV → zero new records added
- [ ] Enter unit cost for one SKU on Costs page → P&L updates
- [ ] Add an invoice with a PDF → PDF appears in invoices list
- [ ] Click "View PDF" → PDF opens in browser
- [ ] Click "Delete" on an invoice → record and file both removed
- [ ] Export P&L → Excel file downloads with correct columns
