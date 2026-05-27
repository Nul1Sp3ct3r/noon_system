# Research: Noon Financial Management Desktop App

**Feature**: 001-noon-finance-app
**Date**: 2026-05-08
**Status**: Complete — all unknowns resolved

---

## Decision 1: PyInstaller Path Resolution (CRITICAL)

**Decision**: Use two separate path roots — `BUNDLE_DIR` for bundled read-only assets
(templates, static files) and `BASE_DIR` for user-writable data (database, PDFs, uploads).

**Rationale**: PyInstaller's `--onefile` mode extracts bundled assets to a temporary
`sys._MEIPASS` directory at runtime. User data written to this temp path is destroyed
on exit. User-writable files (database, uploads) MUST be stored next to `sys.executable`,
not inside the bundle.

**Alternatives considered**:
- Using a single path for both: rejected — user data would be lost after each EXE restart
  because `sys._MEIPASS` is a temp directory that is deleted when the process exits.
- `AppData` folder: rejected — user expects data next to the EXE per the spec requirement.

**Implementation pattern**:
```python
import sys, os

if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS              # read-only: templates, static JS/CSS
    BASE_DIR   = os.path.dirname(sys.executable)  # writable: data/, invoices/
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    BASE_DIR   = BUNDLE_DIR

app = Flask(__name__,
    template_folder=os.path.join(BUNDLE_DIR, 'templates'),
    static_folder=os.path.join(BUNDLE_DIR, 'static'))

DB_PATH       = os.path.join(BASE_DIR, 'data', 'noon.db')
INVOICES_DIR  = os.path.join(BASE_DIR, 'static', 'invoices')
UPLOADS_DIR   = os.path.join(BASE_DIR, 'static', 'uploads')
```

---

## Decision 2: SQLite Foreign Key Cascade Support

**Decision**: Enable foreign key constraints explicitly at connection time with
`PRAGMA foreign_keys = ON` in every SQLite connection.

**Rationale**: SQLite compiles with foreign key support but disables it by default for
backwards compatibility. `ON DELETE CASCADE` on `invoice_items.invoice_id` requires it
to be enabled per-connection. Without this pragma, deleting an invoice will NOT cascade-
delete its line items.

**Alternatives considered**:
- Application-level cascade (delete items before invoice): viable but error-prone if
  routes bypass the helper. Pragma enforcement is safer and more reliable.

**Implementation pattern**:
```python
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn
```

---

## Decision 3: noon CSV Column Mapping

**Decision**: Map noon CSV export headers to DB columns using a fixed column-name
dictionary with `.strip()` normalization. Skip unmapped columns silently.

**Rationale**: noon's CSV export uses English column headers that are stable across
exports for a given account type. Headers may contain leading/trailing whitespace.
Using a fixed dictionary makes the mapping explicit and easy to update.

**Noon CSV → DB column mapping**:
| CSV Header | DB Column |
|------------|-----------|
| Order Nr | order_nr |
| Item Nr | item_nr |
| SKU | sku |
| Partner SKU | partner_sku |
| Brand (English) | brand_en |
| Brand (Arabic) | brand_ar |
| Product Title (English) | product_title_en |
| Product Title (Arabic) | product_title_ar |
| Item Status | item_status |
| Ordered Date | ordered_date |
| Delivered Date | delivered_date |
| Returned Date | returned_date |
| Net Proceeds | net_proceeds |
| Referral Fee | referral_fee |
| FBN Outbound Fee | fbn_outbound_fee |
| Total Payment | total_payment |

**Null handling**: Use `pd.fillna('')` for text columns, `pd.fillna(0)` for numeric
columns. Coerce all numeric columns with `pd.to_numeric(..., errors='coerce').fillna(0)`.

**Duplicate detection**: Use a UNIQUE constraint on `(order_nr, item_nr)` and INSERT OR
IGNORE to skip duplicates at the database level, making deduplication atomic and safe
across concurrent imports.

---

## Decision 4: browser auto-open with no terminal window

**Decision**: Use `threading.Thread(target=open_browser, daemon=True).start()` with a
1.5-second sleep before `webbrowser.open()`. Flask runs with
`app.run(debug=False, port=5000, use_reloader=False)`. PyInstaller uses `--windowed` to
suppress the console.

**Rationale**: The daemon thread exits automatically with the main process. The 1.5s
delay ensures Flask is accepting connections before the browser opens. `use_reloader=False`
prevents Flask from spawning a subprocess (which would open a second browser tab and
cause issues with `sys.frozen` detection).

**Alternatives considered**:
- `waitress` WSGI server: viable production alternative, but adds a dependency and
  complexity for a single-user desktop app. Flask's built-in server is sufficient.
- Port conflict handling: If port 5000 is in use, Flask raises an OSError. A wrapper can
  try ports 5000–5010 and pass the chosen port to `open_browser`. Mark as future
  enhancement — out of scope for v1.

---

## Decision 5: Frontend Libraries (CDN)

**Decision**: Load all frontend dependencies from CDN. No build step or npm required.

**Libraries and CDN URLs**:
| Library | Version | Purpose | CDN |
|---------|---------|---------|-----|
| Bootstrap 5 RTL | 5.3.x | RTL layout + UI components | cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css |
| Bootstrap JS | 5.3.x | Modals, dropdowns | cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js |
| Bootstrap Icons | 1.11.x | All icons | cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css |
| Chart.js | 4.x | Dashboard charts | cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js |
| Tajawal Font | — | Arabic font | fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap |

**Rationale**: The spec requires RTL Arabic layout. Bootstrap 5 RTL build is the
standard approach. Chart.js 4 is the current stable version with UMD build for CDN use.

**Offline consideration**: The spec assumes internet for first load (CDN cache warm-up).
Embedding fonts/CSS in `static/` is a future enhancement for fully offline operation.

---

## Decision 6: Excel Export with openpyxl

**Decision**: Use `openpyxl` directly via `io.BytesIO` buffer, returned as a Flask
response with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
content type and `Content-Disposition: attachment` header.

**Rationale**: `openpyxl` is already in requirements. No additional dependency needed.
Using an in-memory buffer avoids writing temp files to disk.

**Pattern**:
```python
from openpyxl import Workbook
import io

def export_to_excel(headers, rows, filename):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, as_attachment=True,
                     download_name=filename,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
```

---

## Decision 7: Profit Calculation — Division by Zero Guard

**Decision**: When revenue is 0 (or null), return `None` for margin % and display "—"
in the UI rather than attempting division.

**Rationale**: Products with only returned orders have zero revenue. Python raises
`ZeroDivisionError` without a guard. Returning `None` vs. `0%` prevents misleading
display of a false zero margin.

**Pattern**:
```python
margin = (net_profit / revenue * 100) if revenue else None
```

---

## Decision 8: Import Batch Tracking

**Decision**: Generate an `import_batch` value as `datetime.now().strftime('%Y-%m-%d %H:%M:%S')`
and stamp every row inserted in a single import run with the same value.

**Rationale**: Enables future audit of which rows came from which import run. Does not
affect business logic but costs nothing to implement.

---

## Summary of Resolved Unknowns

| Unknown | Resolution |
|---------|-----------|
| EXE resource path detection | Two-root pattern: BUNDLE_DIR + BASE_DIR |
| SQLite FK cascades | `PRAGMA foreign_keys = ON` per connection |
| noon CSV column names | Fixed mapping dictionary with strip() normalization |
| Browser launch timing | 1.5s daemon thread delay |
| Frontend framework | Bootstrap 5 RTL + Chart.js 4 + Bootstrap Icons + Tajawal |
| Excel export | openpyxl + BytesIO in-memory response |
| Division by zero (margin) | Guard: return None when revenue = 0 |
