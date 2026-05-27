# Implementation Plan: Noon Financial Management Desktop App

**Branch**: `001-noon-finance-app` | **Date**: 2026-05-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-noon-finance-app/spec.md`

## Summary

A Windows desktop application that packages a Flask web server into a single EXE. On
launch, it silently starts the Flask server and auto-opens the browser at
http://localhost:5000. The app enables a noon marketplace seller to import their CSV
sales reports, track product profitability (revenue minus noon fees, COGS, and extra
costs), manage supplier invoices with PDF attachments, and export P&L reports to Excel.
All data is stored locally in SQLite with no network dependency at runtime.

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: Flask 3.x, pandas 2.x, openpyxl 3.x, werkzeug 3.x, PyInstaller 6.x
**Storage**: SQLite (`data/noon.db`), local disk files for PDFs and CSV uploads
**Testing**: No automated tests in scope for v1 (per spec — tests are optional)
**Target Platform**: Windows 10+ desktop (PyInstaller `--onefile --windowed` EXE)
**Project Type**: Desktop app (Flask web server + browser UI, packaged as EXE)
**Performance Goals**: Dashboard loads in <3s; CSV import (<10k rows) completes in <10s;
app launch-to-browser in <3s
**Constraints**: Fully offline at runtime; all data stored locally next to the EXE;
no console window visible; no internet required after first CDN cache warm-up
**Scale/Scope**: Single user; hundreds to low-thousands of orders per import batch;
~tens of distinct SKUs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Note**: Project constitution has not yet been ratified (`.specify/memory/constitution.md`
> is still a template). Proceeding with project-specific defaults derived from the spec.

**Project-level gates applied**:

| Gate | Status | Notes |
|------|--------|-------|
| Single project structure (no unnecessary layering) | PASS | Flat Flask app layout as specified |
| All data stored locally (no cloud dependency) | PASS | SQLite + local disk; no external APIs |
| Offline capable at runtime | PASS | All CDN libraries cached after first load |
| No over-engineering (YAGNI) | PASS | No auth, no multi-user, no microservices |
| Graceful error handling at boundaries | PASS | CSV import and file upload validate inputs |
| Sensitive data handling | PASS | No PII; financial data stays on user's machine |

**Post-Phase 1 re-check**: All gates still pass. Single-project flat layout confirmed;
no unnecessary abstractions introduced.

## Project Structure

### Documentation (this feature)

```text
specs/001-noon-finance-app/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── routes.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
noon_system/
├── app.py                  ← Flask app + browser launcher
├── database.py             ← DB init, get_db(), CRUD helpers
├── requirements.txt
├── build.bat               ← PyInstaller build script (Windows)
├── data/
│   └── noon.db             ← SQLite database (auto-created)
├── static/
│   ├── uploads/            ← Saved noon CSV files
│   └── invoices/           ← Saved invoice PDFs
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

**Structure Decision**: Flat single-project layout. No `src/` indirection — the app is
a standalone Flask application with no library components to extract. Templates and
static files are siblings of `app.py` for straightforward PyInstaller bundling.

## Design Decisions (from research.md)

### Path Resolution (EXE vs. source)

Two-root pattern separates bundled read-only assets from user-writable data:

```python
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS               # PyInstaller temp dir (templates, static)
    BASE_DIR   = os.path.dirname(sys.executable)  # next to EXE (data, uploads, invoices)
else:
    BUNDLE_DIR = BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
    template_folder=os.path.join(BUNDLE_DIR, 'templates'),
    static_folder=os.path.join(BUNDLE_DIR, 'static'))

DB_PATH       = os.path.join(BASE_DIR, 'data', 'noon.db')
INVOICES_DIR  = os.path.join(BASE_DIR, 'static', 'invoices')
UPLOADS_DIR   = os.path.join(BASE_DIR, 'static', 'uploads')
```

### SQLite Connection Helper

```python
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn
```

### CSV Import Deduplication

UNIQUE constraint on `(order_nr, item_nr)` + `INSERT OR IGNORE`. Database-level
deduplication is atomic and handles concurrent re-imports safely.

### Profit Calculation (SQL)

Core aggregation query per SKU:

```sql
SELECT
    p.sku, p.name_en, p.name_ar, p.brand_en,
    p.unit_cost, p.extra_costs,
    COUNT(CASE WHEN o.item_status='delivered' THEN 1 END) AS units_sold,
    COUNT(CASE WHEN o.item_status='returned'  THEN 1 END) AS units_returned,
    COALESCE(SUM(CASE WHEN o.item_status='delivered' THEN o.net_proceeds ELSE 0 END), 0) AS revenue,
    COALESCE(SUM(ABS(o.referral_fee) + ABS(o.fbn_outbound_fee)), 0) AS noon_fees
FROM products p
LEFT JOIN orders o ON o.sku = p.sku
GROUP BY p.sku
```

Net profit and margin computed in Python after query:
```python
cogs       = row['unit_cost'] * row['units_sold']
net_profit = row['revenue'] - row['noon_fees'] - cogs - row['extra_costs']
margin_pct = (net_profit / row['revenue'] * 100) if row['revenue'] else None
```

### Browser Auto-Open

```python
def open_browser():
    time.sleep(1.5)
    webbrowser.open('http://localhost:5000')

if __name__ == '__main__':
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(debug=False, port=5000, use_reloader=False)
```

### PDF Security

`/invoices/pdf/<filename>` validates that `filename` matches `invoice_*.pdf` using
`re.match(r'^invoice_\d{8}_\d{6}\.pdf$', filename)`. Returns 400 for any other pattern
to prevent path traversal.

## Complexity Tracking

> No constitution violations to justify. The design is deliberately minimal.

## Artifacts Generated

| Artifact | Path |
|----------|------|
| Plan | `specs/001-noon-finance-app/plan.md` |
| Research | `specs/001-noon-finance-app/research.md` |
| Data Model | `specs/001-noon-finance-app/data-model.md` |
| API Contracts | `specs/001-noon-finance-app/contracts/routes.md` |
| Quickstart | `specs/001-noon-finance-app/quickstart.md` |
