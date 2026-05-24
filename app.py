import sys
import os
import re
import hashlib
import threading
import webbrowser
import time
import io
from datetime import datetime
from itertools import groupby
from operator import itemgetter

import pandas as pd
from flask import (Flask, render_template, request, redirect,
                   url_for, jsonify, send_file, send_from_directory)
from openpyxl import Workbook

from database import init_db, get_db
import reports as rp

# --- Path resolution (EXE vs. Vercel vs. source) ---
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    BASE_DIR = BUNDLE_DIR

app = Flask(__name__,
            template_folder=os.path.join(BUNDLE_DIR, 'templates'),
            static_folder=os.path.join(BUNDLE_DIR, 'static'))

if os.environ.get('VERCEL'):
    DB_PATH = '/tmp/data/noon.db'
    INVOICES_DIR = '/tmp/invoices'
    UPLOADS_DIR = '/tmp/uploads'
    TEMP_DIR = '/tmp/temp'
else:
    DB_PATH = os.path.join(BASE_DIR, 'data', 'noon.db')
    INVOICES_DIR = os.path.join(BASE_DIR, 'static', 'invoices')
    UPLOADS_DIR = os.path.join(BASE_DIR, 'static', 'uploads')
    TEMP_DIR = os.path.join(BASE_DIR, 'static', 'temp')

# Initialize directories and DB at import time (required for Vercel serverless)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(INVOICES_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
init_db(DB_PATH)
ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png', 'heic'}

VAT_RATE   = 0.15        # Saudi VAT 15%
VAT_FACTOR = 15 / 115    # isolate VAT from VAT-inclusive amount

CSV_COLUMN_MAP = {
    'Order Nr': 'order_nr',
    'Item Nr': 'item_nr',
    'SKU': 'sku',
    'Partner SKU': 'partner_sku',
    'Brand (English)': 'brand_en',
    'Brand (Arabic)': 'brand_ar',
    'Product Title (English)': 'product_title_en',
    'Product Title (Arabic)': 'product_title_ar',
    'Item Status': 'item_status',
    'Ordered Date': 'ordered_date',
    'Delivered Date': 'delivered_date',
    'Returned Date': 'returned_date',
    'Net Proceeds': 'net_proceeds',
    'Referral Fee': 'referral_fee',
    'FBN Outbound Fee': 'fbn_outbound_fee',
    'Total Payment': 'total_payment',
}
NUMERIC_COLS = {'net_proceeds', 'referral_fee', 'fbn_outbound_fee', 'total_payment'}

SKU_AGGREGATION_SQL = """
    SELECT
        p.sku, p.partner_sku, p.brand_en, p.brand_ar,
        p.name_en, p.name_ar, p.unit_cost, p.extra_costs, p.notes,
        COALESCE(SUM(CASE WHEN o.item_status='delivered' THEN 1 ELSE 0 END), 0) AS units_sold,
        COALESCE(SUM(CASE WHEN o.item_status='returned'  THEN 1 ELSE 0 END), 0) AS units_returned,
        COALESCE(SUM(CASE WHEN o.item_status='delivered' THEN o.net_proceeds ELSE 0 END), 0.0) AS revenue,
        COALESCE(SUM(ABS(o.referral_fee) + ABS(o.fbn_outbound_fee)), 0.0) AS noon_fees
    FROM products p
    LEFT JOIN orders o ON o.sku = p.sku
    GROUP BY p.sku
"""


# --- Template filters ---

@app.template_filter('sar')
def sar_filter(value):
    if value is None:
        return '—'
    try:
        return f'{float(value):,.2f} ر.س'
    except (TypeError, ValueError):
        return '—'


@app.template_filter('pct')
def pct_filter(value):
    if value is None:
        return '—'
    try:
        return f'{float(value):.2f}%'
    except (TypeError, ValueError):
        return '—'


@app.template_filter('abs')
def abs_filter(value):
    try:
        return abs(float(value))
    except (TypeError, ValueError):
        return value


# --- Helpers ---

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def compute_product_metrics(row):
    units_sold = int(row['units_sold'] or 0)
    units_returned = int(row['units_returned'] or 0)
    revenue = float(row['revenue'] or 0)
    noon_fees = float(row['noon_fees'] or 0)
    unit_cost = float(row['unit_cost'] or 0)
    extra_costs = float(row['extra_costs'] or 0)
    cogs = unit_cost * units_sold
    net_profit = revenue - noon_fees - cogs - extra_costs
    margin_pct = round(net_profit / revenue * 100, 2) if revenue else None
    has_cost = unit_cost > 0 or extra_costs > 0

    if not has_cost:
        badge = 'unknown'
    elif net_profit > 0:
        badge = 'profitable'
    else:
        badge = 'loss'

    # VAT breakdown (verified formulas)
    output_vat         = round(revenue * VAT_FACTOR, 2)
    revenue_excl_vat   = round(revenue - output_vat, 2)
    noon_fees_excl_vat = round(noon_fees, 2)          # fees already excl. VAT
    input_vat_noon     = round(noon_fees * VAT_RATE, 2)
    noon_fees_incl_vat = round(noon_fees + input_vat_noon, 2)

    return {
        'sku': row['sku'],
        'partner_sku': row['partner_sku'] or '',
        'brand_en': row['brand_en'] or '',
        'brand_ar': row['brand_ar'] or '',
        'name_en': row['name_en'] or '',
        'name_ar': row['name_ar'] or '',
        'unit_cost': unit_cost,
        'extra_costs': extra_costs,
        'notes': row['notes'] or '',
        'units_sold': units_sold,
        'units_returned': units_returned,
        'revenue': revenue,
        'noon_fees': noon_fees,
        'cogs': cogs,
        'net_profit': net_profit,
        'margin_pct': margin_pct,
        'has_cost': has_cost,
        'badge': badge,
        # VAT fields
        'output_vat': output_vat,
        'revenue_excl_vat': revenue_excl_vat,
        'noon_fees_excl_vat': noon_fees_excl_vat,
        'input_vat_noon': input_vat_noon,
        'noon_fees_incl_vat': noon_fees_incl_vat,
    }


def get_all_product_metrics(db):
    rows = db.execute(SKU_AGGREGATION_SQL).fetchall()
    return [compute_product_metrics(r) for r in rows]


def _parse_filters():
    return {
        'from_date': request.args.get('from_date', ''),
        'to_date':   request.args.get('to_date', ''),
        'brand':     request.args.get('brand', ''),
        'sort_by':   request.args.get('sort_by', 'profit'),
        'status':    request.args.get('status', ''),
        'supplier':  request.args.get('supplier', ''),
        'cost_min':  request.args.get('cost_min', None),
        'cost_max':  request.args.get('cost_max', None),
    }


# =============================================================================
# Routes
# =============================================================================

@app.route('/')
def index():
    db = get_db(DB_PATH)
    count = db.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    db.close()
    return redirect(url_for('import_page') if count == 0 else url_for('dashboard'))


# --- Import ---

@app.route('/import')
def import_page():
    db = get_db(DB_PATH)
    imports = db.execute(
        "SELECT * FROM imported_files ORDER BY imported_at DESC"
    ).fetchall()
    db.close()
    return render_template('import.html', imports=imports)


@app.route('/import/upload', methods=['POST'])
def import_upload():
    if 'csv_file' not in request.files:
        return jsonify({'success': False, 'error': 'لم يتم تحديد ملف'}), 400

    file = request.files['csv_file']
    if not file.filename or not file.filename.lower().endswith('.csv'):
        return jsonify({'success': False, 'error': 'يجب أن يكون الملف بصيغة CSV'}), 400

    file_bytes = file.read()
    file_hash = hashlib.md5(file_bytes).hexdigest()

    try:
        df = pd.read_csv(io.BytesIO(file_bytes))
    except Exception as e:
        return jsonify({'success': False, 'error': f'خطأ في قراءة الملف: {str(e)}'}), 400

    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={k: v for k, v in CSV_COLUMN_MAP.items() if k in df.columns})

    required = ['order_nr', 'item_nr', 'sku', 'item_status']
    missing = [c for c in required if c not in df.columns]
    if missing:
        return jsonify({'success': False, 'error': f'أعمدة مفقودة: {", ".join(missing)}'}), 400

    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    for col in df.columns:
        if col not in NUMERIC_COLS:
            df[col] = df[col].fillna('').astype(str)

    def _safe_meta(col):
        if col not in df.columns or len(df) == 0:
            return ''
        v = str(df[col].iloc[0]).strip()
        return '' if v in ('nan', 'None') else v

    statement_nr = _safe_meta('statement_nr')
    statement_date = _safe_meta('statement_date')

    import_batch = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    db = get_db(DB_PATH)
    rows_added = rows_updated = rows_ignored = 0

    for _, row in df.iterrows():
        try:
            order_nr = str(row.get('order_nr', ''))
            item_nr  = str(row.get('item_nr', ''))

            new_net = float(row.get('net_proceeds', 0) or 0)
            new_ref = float(row.get('referral_fee', 0) or 0)
            new_fbn = float(row.get('fbn_outbound_fee', 0) or 0)
            new_pay = float(row.get('total_payment', 0) or 0)

            r_net = round(new_net, 4)
            r_ref = round(new_ref, 4)
            r_fbn = round(new_fbn, 4)
            r_pay = round(new_pay, 4)

            is_shipping_only = (
                r_net == 0 and r_ref == 0 and r_fbn != 0 and r_pay == r_fbn
            )

            existing = db.execute(
                "SELECT * FROM orders WHERE order_nr=? AND item_nr=?",
                (order_nr, item_nr)
            ).fetchone()

            def _insert_row():
                db.execute("""
                    INSERT INTO orders
                        (order_nr, item_nr, sku, partner_sku, brand_en, brand_ar,
                         product_title_en, product_title_ar, item_status,
                         ordered_date, delivered_date, returned_date,
                         net_proceeds, referral_fee, fbn_outbound_fee, total_payment, import_batch)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    order_nr, item_nr,
                    str(row.get('sku', '')), str(row.get('partner_sku', '')),
                    str(row.get('brand_en', '')), str(row.get('brand_ar', '')),
                    str(row.get('product_title_en', '')), str(row.get('product_title_ar', '')),
                    str(row.get('item_status', '')),
                    str(row.get('ordered_date', '')), str(row.get('delivered_date', '')),
                    str(row.get('returned_date', '')),
                    new_net, new_ref, new_fbn, new_pay, import_batch,
                ))

            if is_shipping_only:
                if existing is None:
                    _insert_row()
                    rows_added += 1
                elif round(float(existing['fbn_outbound_fee'] or 0), 4) == 0:
                    db.execute("""
                        UPDATE orders
                        SET fbn_outbound_fee = fbn_outbound_fee + ?,
                            total_payment    = total_payment    + ?
                        WHERE order_nr=? AND item_nr=?
                    """, (new_fbn, new_pay, order_nr, item_nr))
                    rows_updated += 1
                else:
                    rows_ignored += 1
            else:
                if existing is None:
                    _insert_row()
                    rows_added += 1
                else:
                    ex_net = round(float(existing['net_proceeds'] or 0), 4)
                    ex_ref = round(float(existing['referral_fee'] or 0), 4)
                    ex_fbn = round(float(existing['fbn_outbound_fee'] or 0), 4)
                    ex_pay = round(float(existing['total_payment'] or 0), 4)

                    if r_net == ex_net and r_ref == ex_ref and r_fbn == ex_fbn and r_pay == ex_pay:
                        rows_ignored += 1
                    else:
                        db.execute("""
                            UPDATE orders
                            SET net_proceeds = ?, referral_fee = ?,
                                fbn_outbound_fee = ?, total_payment = ?
                            WHERE order_nr=? AND item_nr=?
                        """, (new_net, new_ref, new_fbn, new_pay, order_nr, item_nr))
                        rows_updated += 1

        except Exception:
            rows_ignored += 1

    # Upsert new SKUs — never overwrite existing cost data
    if 'sku' in df.columns:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        for sku in df['sku'].unique():
            if not sku or sku == 'nan':
                continue
            sr = df[df['sku'] == sku].iloc[0]
            csv_psku = str(sr.get('partner_sku', ''))
            if csv_psku == 'nan':
                csv_psku = ''
            cur = db.execute("""
                INSERT OR IGNORE INTO products
                    (sku, partner_sku, brand_en, brand_ar, name_en, name_ar, updated_at)
                VALUES (?,?,?,?,?,?,?)
            """, (
                str(sku), csv_psku,
                str(sr.get('brand_en', '')), str(sr.get('brand_ar', '')),
                str(sr.get('product_title_en', '')), str(sr.get('product_title_ar', '')),
                now,
            ))
            if cur.rowcount == 0 and csv_psku:
                db.execute(
                    "UPDATE products SET partner_sku=?, updated_at=? WHERE sku=?",
                    (csv_psku, now, str(sku))
                )

    # Always log — never blocks import
    db.execute("""
        INSERT INTO imported_files
            (statement_nr, statement_date, filename, file_hash, imported_at,
             rows_added, rows_updated, rows_ignored)
        VALUES (?,?,?,?,?,?,?,?)
    """, (
        statement_nr, statement_date, file.filename, file_hash,
        import_batch, rows_added, rows_updated, rows_ignored,
    ))
    db.commit()
    db.close()

    return jsonify({
        'success': True,
        'statement_nr': statement_nr,
        'statement_date': statement_date,
        'rows_added': rows_added,
        'rows_updated': rows_updated,
        'rows_ignored': rows_ignored,
    })


# --- Dashboard ---

@app.route('/dashboard')
def dashboard():
    db = get_db(DB_PATH)
    row = db.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN item_status='delivered' THEN net_proceeds ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(total_payment), 0) AS payout,
            COALESCE(SUM(ABS(referral_fee) + ABS(fbn_outbound_fee)), 0) AS fees,
            COUNT(CASE WHEN item_status='delivered' THEN 1 END) AS delivered_count,
            COUNT(CASE WHEN item_status='returned'  THEN 1 END) AS returned_count
        FROM orders
    """).fetchone()

    products = get_all_product_metrics(db)
    db.close()

    revenue = float(row['revenue'])
    total_cogs = sum(p['cogs'] for p in products)
    total_extra = sum(p['extra_costs'] for p in products)
    fees = float(row['fees'])
    net_profit = revenue - fees - total_cogs - total_extra
    margin_pct = round(net_profit / revenue * 100, 2) if revenue else None

    summary = {
        'revenue': revenue,
        'payout': float(row['payout']),
        'fees': fees,
        'delivered_count': row['delivered_count'],
        'returned_count': row['returned_count'],
        'net_profit': net_profit,
        'margin_pct': margin_pct,
    }
    return render_template('dashboard.html', summary=summary)


@app.route('/api/dashboard-data')
def api_dashboard_data():
    db = get_db(DB_PATH)

    daily = db.execute("""
        SELECT
            SUBSTR(ordered_date, 1, 10) AS date,
            COALESCE(SUM(CASE WHEN item_status='delivered' THEN net_proceeds ELSE 0 END), 0) AS revenue
        FROM orders
        WHERE ordered_date != ''
        GROUP BY SUBSTR(ordered_date, 1, 10)
        ORDER BY date
    """).fetchall()

    products = get_all_product_metrics(db)

    status_row = db.execute("""
        SELECT
            COUNT(CASE WHEN item_status='delivered' THEN 1 END) AS delivered,
            COUNT(CASE WHEN item_status='returned'  THEN 1 END) AS returned
        FROM orders
    """).fetchone()

    db.close()

    top5 = sorted(products, key=lambda p: p['net_profit'], reverse=True)[:5]

    return jsonify({
        'daily_revenue': [
            {'date': r['date'], 'revenue': round(float(r['revenue']), 2)}
            for r in daily
        ],
        'top_products': [
            {'sku': p['sku'], 'name': p['name_en'] or p['sku'],
             'profit': round(p['net_profit'], 2)}
            for p in top5
        ],
        'order_status': {
            'delivered': status_row['delivered'],
            'returned': status_row['returned'],
        },
    })


# --- Products ---

@app.route('/products')
def products_page():
    brand_filter = request.args.get('brand', '')
    search = request.args.get('q', '')
    status_filter = request.args.get('status', '')

    db = get_db(DB_PATH)
    all_products = get_all_product_metrics(db)
    db.close()

    brands = sorted({p['brand_en'] for p in all_products if p['brand_en']})

    filtered = all_products
    if brand_filter:
        filtered = [p for p in filtered if p['brand_en'] == brand_filter]
    if search:
        s = search.lower()
        filtered = [p for p in filtered if
                    s in p['name_en'].lower() or
                    s in p['name_ar'].lower() or
                    s in p['sku'].lower() or
                    s in (p['partner_sku'] or '').lower()]
    if status_filter:
        filtered = [p for p in filtered if p['badge'] == status_filter]

    return render_template('products.html', products=filtered, brands=brands,
                           brand_filter=brand_filter, search=search,
                           status_filter=status_filter)


# --- Orders ---

@app.route('/orders')
def orders_page():
    search = request.args.get('q', '')
    status_filter = request.args.get('status', '')
    from_date = request.args.get('from_date', '')
    to_date = request.args.get('to_date', '')

    conditions, params = [], []
    if status_filter:
        conditions.append("item_status = ?")
        params.append(status_filter)
    if from_date:
        conditions.append("SUBSTR(ordered_date,1,10) >= ?")
        params.append(from_date)
    if to_date:
        conditions.append("SUBSTR(ordered_date,1,10) <= ?")
        params.append(to_date)
    if search:
        conditions.append("(order_nr LIKE ? OR sku LIKE ? OR partner_sku LIKE ? OR product_title_en LIKE ?)")
        params += [f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%']

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"SELECT * FROM orders {where} ORDER BY ordered_date DESC"

    db = get_db(DB_PATH)
    orders = db.execute(sql, params).fetchall()
    db.close()

    return render_template('orders.html', orders=orders,
                           search=search, status_filter=status_filter,
                           from_date=from_date, to_date=to_date)


# --- Costs ---

@app.route('/costs')
def costs_page():
    db = get_db(DB_PATH)
    products = get_all_product_metrics(db)
    db.close()

    totals = {
        'units_sold': sum(p['units_sold'] for p in products),
        'revenue': sum(p['revenue'] for p in products),
        'fees': sum(p['noon_fees'] for p in products),
        'cogs': sum(p['cogs'] for p in products),
        'extra_costs': sum(p['extra_costs'] for p in products),
        'net_profit': sum(p['net_profit'] for p in products),
    }
    return render_template('costs.html', products=products, totals=totals)


@app.route('/costs/save', methods=['POST'])
def costs_save():
    skus = request.form.getlist('sku[]')
    unit_costs = request.form.getlist('unit_cost[]')
    extra_costs_list = request.form.getlist('extra_costs[]')
    notes_list = request.form.getlist('notes[]')
    partner_skus = request.form.getlist('partner_sku[]')

    if not skus:
        return jsonify({'success': False, 'error': 'لا توجد بيانات للحفظ'}), 400

    db = get_db(DB_PATH)
    updated = 0
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for i, sku in enumerate(skus):
        try:
            uc = float(unit_costs[i]) if i < len(unit_costs) else 0.0
            ec = float(extra_costs_list[i]) if i < len(extra_costs_list) else 0.0
            note = notes_list[i] if i < len(notes_list) else ''
            psku = partner_skus[i] if i < len(partner_skus) else ''
            db.execute(
                "UPDATE products SET unit_cost=?, extra_costs=?, notes=?, partner_sku=?, updated_at=? WHERE sku=?",
                (uc, ec, note, psku, now, sku))
            updated += 1
        except (ValueError, IndexError):
            continue

    db.commit()
    db.close()
    return jsonify({'success': True, 'updated': updated})


@app.route('/products/<sku>/update-partner-sku', methods=['POST'])
def update_partner_sku(sku):
    data = request.get_json(silent=True) or {}
    partner_sku = str(data.get('partner_sku', '')).strip()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    db = get_db(DB_PATH)
    result = db.execute(
        "UPDATE products SET partner_sku=?, updated_at=? WHERE sku=?",
        (partner_sku, now, sku))
    db.commit()
    db.close()
    if result.rowcount == 0:
        return jsonify({'success': False, 'error': 'المنتج غير موجود'}), 404
    return jsonify({'success': True})


# --- Invoices ---

@app.route('/invoices')
def invoices_page():
    db = get_db(DB_PATH)
    invoices = db.execute("SELECT * FROM invoices ORDER BY created_at DESC").fetchall()
    products = db.execute("SELECT sku, name_en FROM products ORDER BY name_en").fetchall()
    count = db.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
    db.close()
    next_invoice_nr = f'INV-{count + 1:04d}'
    return render_template('invoices.html', invoices=invoices, products=products,
                           next_invoice_nr=next_invoice_nr)


@app.route('/invoices/add', methods=['POST'])
def invoices_add():
    pdf_filename = pdf_original_name = None

    uploads = [f for f in request.files.getlist('pdf_file') if f and f.filename]
    if uploads:
        for f in uploads:
            if not allowed_file(f.filename):
                return jsonify({'success': False,
                                'error': f'نوع الملف غير صالح: {f.filename}. المسموح: PDF، JPG، PNG، HEIC.'}), 400

        import img2pdf
        from pypdf import PdfWriter

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        pdf_original_name = ', '.join(f.filename for f in uploads)
        tmp_paths = []
        collected_pdfs = []

        try:
            for i, f in enumerate(uploads):
                ext = f.filename.rsplit('.', 1)[1].lower() if '.' in f.filename else 'pdf'
                if ext == 'pdf':
                    p = os.path.join(INVOICES_DIR, f'tmp_{timestamp}_{i}.pdf')
                    f.save(p)
                    tmp_paths.append(p)
                    collected_pdfs.append(p)
                else:
                    img_p = os.path.join(INVOICES_DIR, f'tmp_{timestamp}_{i}.{ext}')
                    pdf_p = os.path.join(INVOICES_DIR, f'tmp_{timestamp}_{i}.pdf')
                    f.save(img_p)
                    tmp_paths.append(img_p)
                    with open(pdf_p, 'wb') as out:
                        out.write(img2pdf.convert(img_p))
                    tmp_paths.append(pdf_p)
                    collected_pdfs.append(pdf_p)

            pdf_filename = f'invoice_{timestamp}.pdf'
            final_path = os.path.join(INVOICES_DIR, pdf_filename)

            if len(collected_pdfs) == 1:
                os.rename(collected_pdfs[0], final_path)
                tmp_paths.remove(collected_pdfs[0])
            else:
                writer = PdfWriter()
                for p in collected_pdfs:
                    writer.append(p)
                with open(final_path, 'wb') as out:
                    writer.write(out)
        finally:
            for p in tmp_paths:
                try:
                    os.remove(p)
                except OSError:
                    pass

    try:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        db = get_db(DB_PATH)

        invoice_nr = request.form.get('invoice_nr', '').strip()
        if not invoice_nr:
            cnt = db.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
            invoice_nr = f'INV-{cnt + 1:04d}'

        cur = db.execute("""
            INSERT INTO invoices
                (invoice_nr, supplier_name, invoice_date, total_amount, vat_amount,
                 currency, notes, pdf_filename, pdf_original_name, created_at)
            VALUES (?,?,?,?,?,'SAR',?,?,?,?)
        """, (
            invoice_nr,
            request.form.get('supplier_name', ''),
            request.form.get('invoice_date', ''),
            float(request.form.get('total_amount', 0) or 0),
            float(request.form.get('vat_amount', 0) or 0),
            request.form.get('notes', ''),
            pdf_filename,
            pdf_original_name,
            now,
        ))
        invoice_id = cur.lastrowid

        item_skus = request.form.getlist('item_sku[]')
        item_names = request.form.getlist('item_name[]')
        item_qtys = request.form.getlist('item_qty[]')
        item_ucs = request.form.getlist('item_unit_cost[]')
        item_totals = request.form.getlist('item_total[]')

        for i, sku in enumerate(item_skus):
            if not sku:
                continue
            try:
                qty = int(item_qtys[i]) if i < len(item_qtys) else 0
                uc = float(item_ucs[i]) if i < len(item_ucs) else 0.0
                tc = float(item_totals[i]) if i < len(item_totals) else uc * qty
                pname = item_names[i] if i < len(item_names) else ''
                db.execute("""
                    INSERT INTO invoice_items
                        (invoice_id, sku, product_name, quantity, unit_cost, total_cost)
                    VALUES (?,?,?,?,?,?)
                """, (invoice_id, sku, pname, qty, uc, tc))
                if uc > 0:
                    db.execute(
                        "UPDATE products SET unit_cost=?, updated_at=? WHERE sku=?",
                        (uc, now, sku))
            except (ValueError, IndexError):
                continue

        db.commit()
        db.close()
        return jsonify({'success': True, 'invoice_id': invoice_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/invoices/<int:invoice_id>')
def invoice_detail(invoice_id):
    db = get_db(DB_PATH)
    invoice = db.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
    if not invoice:
        db.close()
        return "الفاتورة غير موجودة", 404
    items = db.execute(
        "SELECT * FROM invoice_items WHERE invoice_id=?", (invoice_id,)).fetchall()
    db.close()
    return render_template('invoice_detail.html', invoice=invoice, items=items)


@app.route('/invoices/<int:invoice_id>/delete', methods=['POST'])
def invoice_delete(invoice_id):
    db = get_db(DB_PATH)
    inv = db.execute(
        "SELECT pdf_filename FROM invoices WHERE id=?", (invoice_id,)).fetchone()
    if not inv:
        db.close()
        return jsonify({'success': False, 'error': 'الفاتورة غير موجودة'}), 404

    db.execute("DELETE FROM invoices WHERE id=?", (invoice_id,))
    db.commit()
    db.close()

    if inv['pdf_filename']:
        try:
            os.remove(os.path.join(INVOICES_DIR, inv['pdf_filename']))
        except OSError:
            pass

    return jsonify({'success': True})


@app.route('/invoices/pdf/<filename>')
def view_pdf(filename):
    if not re.match(r'^(invoice|processed)_\d{8}_\d{6}\.(pdf|jpg|jpeg|png|heic)$', filename):
        return "اسم الملف غير صالح", 400
    ext = filename.rsplit('.', 1)[1].lower()
    mime_map = {'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'png': 'image/png', 'heic': 'image/heic'}
    return send_from_directory(INVOICES_DIR, filename, mimetype=mime_map.get(ext, 'application/octet-stream'))



# --- Reports ---

@app.route('/reports')
def reports_page():
    db = get_db(DB_PATH)
    brand_rows = db.execute(
        "SELECT DISTINCT brand_en FROM products WHERE brand_en != '' ORDER BY brand_en"
    ).fetchall()
    supplier_rows = db.execute(
        "SELECT DISTINCT supplier_name FROM invoices WHERE supplier_name != '' ORDER BY supplier_name"
    ).fetchall()
    db.close()
    brands = [r['brand_en'] for r in brand_rows]
    suppliers = [r['supplier_name'] for r in supplier_rows]
    return render_template('reports.html', brands=brands, suppliers=suppliers)


# --- Report data API routes ---

@app.route('/reports/pl')
def report_pl():
    f = _parse_filters()
    try:
        data = rp.get_pl_data(DB_PATH, f['from_date'], f['to_date'])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

    headers = ['الشهر', 'الإيرادات', 'رسوم noon', 'تكلفة البضاعة',
               'تكاليف إضافية', 'مجمل الربح', 'صافي الربح', 'الهامش %']

    rows = []
    for d in data:
        margin_str = f"{d['margin_pct']:.2f}%" if d['margin_pct'] is not None else '—'
        rows.append([
            d['month_ar'],
            d['revenue'],
            d['fees'],
            d['cogs'],
            d['extra'],
            d['gross_profit'],
            d['net_profit'],
            margin_str,
        ])

    row_classes = ['' for _ in rows]

    totals = [
        'الإجمالي',
        round(sum(d['revenue'] for d in data), 2),
        round(sum(d['fees'] for d in data), 2),
        round(sum(d['cogs'] for d in data), 2),
        round(sum(d['extra'] for d in data), 2),
        round(sum(d['gross_profit'] for d in data), 2),
        round(sum(d['net_profit'] for d in data), 2),
        '',
    ]

    total_revenue = round(sum(d['revenue'] for d in data), 2)
    total_net = round(sum(d['net_profit'] for d in data), 2)
    total_fees = round(sum(d['fees'] for d in data), 2)
    overall_margin = round(total_net / total_revenue * 100, 2) if total_revenue else 0.0

    summary_cards = [
        {'label': 'إجمالي الإيرادات', 'value': f"{total_revenue:,.2f}", 'color': 'color-revenue'},
        {'label': 'صافي الربح الإجمالي', 'value': f"{total_net:,.2f}",
         'color': 'color-profit' if total_net >= 0 else 'color-loss'},
        {'label': 'إجمالي الرسوم', 'value': f"{total_fees:,.2f}", 'color': 'color-fees'},
        {'label': 'هامش الربح الإجمالي', 'value': f"{overall_margin:.2f}%",
         'color': 'color-profit' if overall_margin >= 0 else 'color-loss'},
    ]

    chart_colors = ['#3B6D11' if d['net_profit'] >= 0 else '#A32D2D' for d in data]
    chart = {
        'type': 'bar',
        'data': {
            'labels': [d['month_ar'] for d in data],
            'datasets': [{
                'label': 'صافي الربح',
                'data': [d['net_profit'] for d in data],
                'backgroundColor': chart_colors,
                'borderRadius': 4,
            }],
        },
        'options': {
            'responsive': True,
            'plugins': {'legend': {'display': False}},
            'scales': {'y': {'beginAtZero': True}},
        },
    }

    return jsonify({
        'success': True, 'headers': headers, 'rows': rows,
        'row_classes': row_classes, 'totals': totals,
        'summary_cards': summary_cards, 'chart': chart,
    })


@app.route('/reports/vat')
def report_vat():
    f = _parse_filters()
    try:
        data = rp.get_vat_data(DB_PATH, f['from_date'], f['to_date'])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

    headers = [
        'الشهر', 'المبيعات شامل VAT', 'VAT المخرجات',
        'رسوم نون (قبل VAT)', 'VAT مدخلات — نون',
        'VAT مدخلات — موردين', 'صافي VAT', 'الحالة',
    ]

    rows = []
    for d in data:
        rows.append([
            d['month_ar'], d['sales_incl'], d['output_vat'],
            d['fees_excl'], d['input_vat_noon'],
            d['input_vat_supp'], d['net_vat'],
            'مستحق' if d['status'] == 'payable' else 'قابل للاسترداد',
        ])
    row_classes = ['' for _ in rows]

    t_sales  = round(sum(d['sales_incl']     for d in data), 2)
    t_out    = round(sum(d['output_vat']     for d in data), 2)
    t_fees   = round(sum(d['fees_excl']      for d in data), 2)
    t_in_n   = round(sum(d['input_vat_noon'] for d in data), 2)
    t_in_s   = round(sum(d['input_vat_supp'] for d in data), 2)
    t_net    = round(sum(d['net_vat']        for d in data), 2)

    totals = ['الإجمالي', t_sales, t_out, t_fees, t_in_n, t_in_s, t_net, '']

    summary_cards = [
        {'label': 'VAT المخرجات (مبيعات)',     'value': f'{t_out:,.2f}',  'color': 'color-loss'},
        {'label': 'VAT مدخلات — رسوم نون',     'value': f'{t_in_n:,.2f}', 'color': 'color-profit'},
        {'label': 'VAT مدخلات — موردين',       'value': f'{t_in_s:,.2f}', 'color': 'color-profit'},
        {'label': 'صافي VAT للإقرار',          'value': f'{t_net:,.2f}',
         'color': 'color-loss' if t_net > 0 else 'color-profit'},
    ]

    chart = {
        'type': 'bar',
        'data': {
            'labels': [d['month_ar'] for d in data],
            'datasets': [
                {'label': 'VAT المخرجات',
                 'data': [d['output_vat'] for d in data],
                 'backgroundColor': '#A32D2Dcc', 'borderRadius': 4},
                {'label': 'VAT المدخلات (نون + موردين)',
                 'data': [round(d['input_vat_noon'] + d['input_vat_supp'], 2) for d in data],
                 'backgroundColor': '#3B6D11cc', 'borderRadius': 4},
            ],
        },
        'options': {
            'responsive': True,
            'plugins': {'legend': {'position': 'bottom'}},
            'scales': {'y': {'beginAtZero': True}},
        },
    }

    return jsonify({
        'success': True, 'headers': headers, 'rows': rows,
        'row_classes': row_classes, 'totals': totals,
        'summary_cards': summary_cards, 'chart': chart,
    })


@app.route('/reports/vat/excel')
def report_vat_excel():
    f = _parse_filters()
    data = rp.get_vat_data(DB_PATH, f['from_date'], f['to_date'])
    headers = [
        'الشهر', 'المبيعات شامل VAT', 'VAT المخرجات',
        'رسوم نون (قبل VAT)', 'VAT مدخلات — نون',
        'VAT مدخلات — موردين', 'صافي VAT', 'الحالة',
    ]
    rows = []
    for d in data:
        rows.append([
            d['month_ar'], d['sales_incl'], d['output_vat'],
            d['fees_excl'], d['input_vat_noon'], d['input_vat_supp'], d['net_vat'],
            'مستحق' if d['status'] == 'payable' else 'قابل للاسترداد',
        ])
    totals_row = [
        'الإجمالي',
        round(sum(d['sales_incl']     for d in data), 2),
        round(sum(d['output_vat']     for d in data), 2),
        round(sum(d['fees_excl']      for d in data), 2),
        round(sum(d['input_vat_noon'] for d in data), 2),
        round(sum(d['input_vat_supp'] for d in data), 2),
        round(sum(d['net_vat']        for d in data), 2),
        '',
    ]
    today = datetime.now().strftime('%Y%m%d')
    buf, fname = rp.build_excel(
        'VAT', headers, rows, totals_row=totals_row,
        currency_cols=[2, 3, 4, 5, 6, 7],
        filename=f'noon_vat_{today}.xlsx',
    )
    return send_file(buf, as_attachment=True, download_name=fname,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.route('/reports/sales')
def report_sales():
    f = _parse_filters()
    try:
        data = rp.get_sales_data(DB_PATH, f['from_date'], f['to_date'],
                                 f['brand'], f['sort_by'], f['status'])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'العلامة', 'مباع', 'مرتجع', 'نسبة الإرجاع%',
               'الإيرادات', 'رسوم noon', 'التكاليف', 'صافي الربح', 'الهامش%', 'الحالة']

    badge_labels = {'profitable': 'رابح', 'loss': 'خاسر', 'unknown': 'غير محدد'}
    rows = []
    for d in data:
        margin_str = f"{d['margin_pct']:.2f}%" if d['margin_pct'] is not None else '—'
        badge_html = (f'<span class="badge badge-{d["badge"]}">'
                      f'{badge_labels.get(d["badge"], d["badge"])}</span>')
        rows.append([
            d['sku'],
            d['partner_sku'],
            d['name_en'] or d['name_ar'] or d['sku'],
            d['brand_en'],
            d['units_sold'],
            d['units_returned'],
            f"{d['return_rate']:.2f}%",
            d['revenue'],
            d['noon_fees'],
            d['cogs'],
            d['net_profit'],
            margin_str,
            badge_html,
        ])

    row_classes = ['' for _ in rows]

    totals = [
        'الإجمالي', '', '', '',
        sum(d['units_sold'] for d in data),
        sum(d['units_returned'] for d in data),
        '',
        round(sum(d['revenue'] for d in data), 2),
        round(sum(d['noon_fees'] for d in data), 2),
        round(sum(d['cogs'] for d in data), 2),
        round(sum(d['net_profit'] for d in data), 2),
        '', '',
    ]

    summary_cards = [
        {'label': 'إجمالي المنتجات', 'value': str(len(data)), 'color': ''},
        {'label': 'إجمالي الوحدات المباعة', 'value': str(sum(d['units_sold'] for d in data)), 'color': ''},
        {'label': 'إجمالي الإيرادات',
         'value': f"{sum(d['revenue'] for d in data):,.2f}", 'color': 'color-revenue'},
        {'label': 'صافي الربح الإجمالي',
         'value': f"{sum(d['net_profit'] for d in data):,.2f}",
         'color': 'color-profit' if sum(d['net_profit'] for d in data) >= 0 else 'color-loss'},
    ]

    top10 = sorted(data, key=lambda x: x['net_profit'], reverse=True)[:10]
    chart = {
        'type': 'bar',
        'data': {
            'labels': [d['sku'] for d in top10],
            'datasets': [{
                'label': 'صافي الربح',
                'data': [d['net_profit'] for d in top10],
                'backgroundColor': ['#3B6D11' if d['net_profit'] >= 0 else '#A32D2D' for d in top10],
                'borderRadius': 4,
            }],
        },
        'options': {
            'indexAxis': 'y',
            'responsive': True,
            'plugins': {'legend': {'display': False}},
        },
    }

    return jsonify({
        'success': True, 'headers': headers, 'rows': rows,
        'row_classes': row_classes, 'totals': totals,
        'summary_cards': summary_cards, 'chart': chart,
    })


@app.route('/reports/fees')
def report_fees():
    f = _parse_filters()
    try:
        data = rp.get_fees_data(DB_PATH, f['from_date'], f['to_date'], f['brand'])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'مسلَّم', 'مرتجع', 'رسوم الإحالة',
               'رسوم FBN', 'إجمالي الرسوم', '% من الإيرادات', 'صافي بعد الرسوم']

    rows = []
    for d in data:
        rows.append([
            d['sku'],
            d['partner_sku'],
            d['name_en'] or d['name_ar'] or d['sku'],
            d['units_del'],
            d['units_ret'],
            d['referral'],
            d['fbn'],
            d['total_fees'],
            f"{d['fee_pct']:.2f}%",
            d['net_after_fees'],
        ])

    row_classes = ['' for _ in rows]

    sum_referral = round(sum(d['referral'] for d in data), 2)
    sum_fbn = round(sum(d['fbn'] for d in data), 2)
    sum_total_fees = round(sum(d['total_fees'] for d in data), 2)
    sum_revenue = round(sum(d['revenue'] for d in data), 2)
    avg_fee_rate = round(sum_total_fees / sum_revenue * 100, 2) if sum_revenue else 0.0

    totals = [
        'الإجمالي', '', '',
        sum(d['units_del'] for d in data),
        sum(d['units_ret'] for d in data),
        sum_referral, sum_fbn, sum_total_fees, '', '',
    ]

    summary_cards = [
        {'label': 'إجمالي رسوم الإحالة', 'value': f"{sum_referral:,.2f}", 'color': 'color-fees'},
        {'label': 'إجمالي رسوم FBN', 'value': f"{sum_fbn:,.2f}", 'color': 'color-fees'},
        {'label': 'إجمالي الرسوم', 'value': f"{sum_total_fees:,.2f}", 'color': 'color-fees'},
        {'label': 'متوسط نسبة الرسوم', 'value': f"{avg_fee_rate:.2f}%", 'color': ''},
    ]

    chart = {
        'type': 'doughnut',
        'data': {
            'labels': ['رسوم الإحالة', 'رسوم FBN'],
            'datasets': [{
                'data': [sum_referral, sum_fbn],
                'backgroundColor': ['#854F0B', '#185FA5'],
            }],
        },
        'options': {
            'responsive': True,
            'plugins': {'legend': {'position': 'bottom'}},
        },
    }

    return jsonify({
        'success': True, 'headers': headers, 'rows': rows,
        'row_classes': row_classes, 'totals': totals,
        'summary_cards': summary_cards, 'chart': chart,
    })


@app.route('/reports/inventory')
def report_inventory():
    f = _parse_filters()
    try:
        data = rp.get_inventory_data(DB_PATH, f['brand'], f['cost_min'], f['cost_max'])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'العلامة', 'تكلفة الوحدة', 'تكاليف إضافية',
               'إجمالي/وحدة', 'مباع', 'مرتجع', 'إجمالي COGS', 'إجمالي ت. إضافية', 'إجمالي الاستثمار']

    rows = []
    for d in data:
        rows.append([
            d['sku'],
            d['partner_sku'],
            d['name_en'] or d['name_ar'] or d['sku'],
            d['brand_en'],
            d['unit_cost'],
            d['extra_costs'],
            d['total_per_unit'],
            d['units_sold'],
            d['units_returned'],
            d['total_cogs'],
            d['total_extra'],
            d['total_investment'],
        ])

    row_classes = ['' for _ in rows]

    sum_cogs = round(sum(d['total_cogs'] for d in data), 2)
    sum_extra = round(sum(d['total_extra'] for d in data), 2)
    sum_investment = round(sum(d['total_investment'] for d in data), 2)
    products_with_cost = sum(1 for d in data if d['unit_cost'] > 0 or d['extra_costs'] > 0)

    totals = [
        'الإجمالي', '', '', '', '', '', '',
        sum(d['units_sold'] for d in data),
        sum(d['units_returned'] for d in data),
        sum_cogs, sum_extra, sum_investment,
    ]

    summary_cards = [
        {'label': 'منتجات بتكلفة محددة', 'value': str(products_with_cost), 'color': ''},
        {'label': 'إجمالي الاستثمار', 'value': f"{sum_investment:,.2f}", 'color': 'color-fees'},
        {'label': 'إجمالي COGS', 'value': f"{sum_cogs:,.2f}", 'color': 'color-fees'},
        {'label': 'إجمالي التكاليف الإضافية', 'value': f"{sum_extra:,.2f}", 'color': 'color-fees'},
    ]

    top10 = sorted(data, key=lambda x: x['total_investment'], reverse=True)[:10]
    chart = {
        'type': 'bar',
        'data': {
            'labels': [d['sku'] for d in top10],
            'datasets': [{
                'label': 'إجمالي الاستثمار',
                'data': [d['total_investment'] for d in top10],
                'backgroundColor': '#185FA5',
                'borderRadius': 4,
            }],
        },
        'options': {
            'indexAxis': 'y',
            'responsive': True,
            'plugins': {'legend': {'display': False}},
        },
    }

    return jsonify({
        'success': True, 'headers': headers, 'rows': rows,
        'row_classes': row_classes, 'totals': totals,
        'summary_cards': summary_cards, 'chart': chart,
    })


@app.route('/reports/invoices-report')
def report_invoices_report():
    f = _parse_filters()
    try:
        data = rp.get_invoices_report_data(DB_PATH, f['supplier'], f['from_date'], f['to_date'])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

    headers = ['رقم الفاتورة', 'المورد', 'التاريخ', 'الإجمالي',
               'الضريبة', 'الصافي', 'البنود', 'PDF']

    rows = []
    row_classes = []

    # Group by supplier for subtotals
    supplier_totals = {}
    for d in data:
        sup = d['supplier_name']
        if sup not in supplier_totals:
            supplier_totals[sup] = {'total': 0, 'vat': 0, 'net': 0, 'count': 0}
        supplier_totals[sup]['total'] += d['total_amount']
        supplier_totals[sup]['vat'] += d['vat_amount']
        supplier_totals[sup]['net'] += d['net_amount']
        supplier_totals[sup]['count'] += 1

    current_supplier = None
    for idx, d in enumerate(data):
        if d['supplier_name'] != current_supplier:
            current_supplier = d['supplier_name']
        rows.append([
            d['invoice_nr'],
            d['supplier_name'],
            d['invoice_date'],
            d['total_amount'],
            d['vat_amount'],
            d['net_amount'],
            d['item_count'],
            '✓' if d['has_pdf'] else '—',
        ])
        row_classes.append('')

        # Add supplier subtotal after last row of this supplier
        next_supplier = data[idx + 1]['supplier_name'] if idx + 1 < len(data) else None
        if next_supplier != current_supplier:
            st = supplier_totals[current_supplier]
            rows.append([
                f'مجموع: {current_supplier}', '', '',
                round(st['total'], 2), round(st['vat'], 2), round(st['net'], 2),
                st['count'], '',
            ])
            row_classes.append('table-secondary fw-bold')

    sum_total = round(sum(d['total_amount'] for d in data), 2)
    sum_vat = round(sum(d['vat_amount'] for d in data), 2)
    sum_net = round(sum(d['net_amount'] for d in data), 2)
    supplier_count = len(set(d['supplier_name'] for d in data))

    totals = [
        'الإجمالي الكلي', '', '',
        sum_total, sum_vat, sum_net, len(data), '',
    ]

    summary_cards = [
        {'label': 'عدد الفواتير', 'value': str(len(data)), 'color': ''},
        {'label': 'إجمالي المبالغ', 'value': f"{sum_total:,.2f}", 'color': 'color-revenue'},
        {'label': 'إجمالي الضريبة', 'value': f"{sum_vat:,.2f}", 'color': 'color-fees'},
        {'label': 'عدد الموردين', 'value': str(supplier_count), 'color': ''},
    ]

    # Chart: spending per supplier
    sup_spending = {s: supplier_totals[s]['net'] for s in supplier_totals}
    chart = {
        'type': 'bar',
        'data': {
            'labels': list(sup_spending.keys()),
            'datasets': [{
                'label': 'الصافي',
                'data': [round(v, 2) for v in sup_spending.values()],
                'backgroundColor': '#185FA5',
                'borderRadius': 4,
            }],
        },
        'options': {
            'responsive': True,
            'plugins': {'legend': {'display': False}},
        },
    }

    return jsonify({
        'success': True, 'headers': headers, 'rows': rows,
        'row_classes': row_classes, 'totals': totals,
        'summary_cards': summary_cards, 'chart': chart,
    })


# --- Report Excel export routes ---

@app.route('/reports/pl/excel')
def report_pl_excel():
    f = _parse_filters()
    data = rp.get_pl_data(DB_PATH, f['from_date'], f['to_date'])
    headers = ['الشهر', 'الإيرادات', 'رسوم noon', 'تكلفة البضاعة',
               'تكاليف إضافية', 'مجمل الربح', 'صافي الربح', 'الهامش %']
    rows = []
    for d in data:
        margin_str = f"{d['margin_pct']:.2f}%" if d['margin_pct'] is not None else '—'
        rows.append([d['month_ar'], d['revenue'], d['fees'], d['cogs'],
                     d['extra'], d['gross_profit'], d['net_profit'], margin_str])
    totals_row = [
        'الإجمالي',
        round(sum(d['revenue'] for d in data), 2),
        round(sum(d['fees'] for d in data), 2),
        round(sum(d['cogs'] for d in data), 2),
        round(sum(d['extra'] for d in data), 2),
        round(sum(d['gross_profit'] for d in data), 2),
        round(sum(d['net_profit'] for d in data), 2),
        '',
    ]
    today = datetime.now().strftime('%Y%m%d')
    buf, fname = rp.build_excel('P&L', headers, rows, totals_row=totals_row,
                                currency_cols=[2, 3, 4, 5, 6, 7], pct_cols=[8],
                                filename=f'noon_pl_{today}.xlsx')
    return send_file(buf, as_attachment=True, download_name=fname,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.route('/reports/sales/excel')
def report_sales_excel():
    f = _parse_filters()
    data = rp.get_sales_data(DB_PATH, f['from_date'], f['to_date'],
                             f['brand'], f['sort_by'], f['status'])
    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'العلامة', 'مباع', 'مرتجع', 'نسبة الإرجاع%',
               'الإيرادات', 'رسوم noon', 'التكاليف', 'صافي الربح', 'الهامش%', 'الحالة']
    rows = []
    for d in data:
        margin_str = f"{d['margin_pct']:.2f}%" if d['margin_pct'] is not None else '—'
        rows.append([d['sku'], d['partner_sku'], d['name_en'] or d['name_ar'] or d['sku'], d['brand_en'],
                     d['units_sold'], d['units_returned'], f"{d['return_rate']:.2f}%",
                     d['revenue'], d['noon_fees'], d['cogs'], d['net_profit'],
                     margin_str, d['badge']])
    totals_row = [
        'الإجمالي', '', '', '',
        sum(d['units_sold'] for d in data),
        sum(d['units_returned'] for d in data),
        '',
        round(sum(d['revenue'] for d in data), 2),
        round(sum(d['noon_fees'] for d in data), 2),
        round(sum(d['cogs'] for d in data), 2),
        round(sum(d['net_profit'] for d in data), 2),
        '', '',
    ]
    today = datetime.now().strftime('%Y%m%d')
    buf, fname = rp.build_excel('Sales', headers, rows, totals_row=totals_row,
                                currency_cols=[8, 9, 10, 11],
                                filename=f'noon_sales_{today}.xlsx')
    return send_file(buf, as_attachment=True, download_name=fname,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.route('/reports/fees/excel')
def report_fees_excel():
    f = _parse_filters()
    data = rp.get_fees_data(DB_PATH, f['from_date'], f['to_date'], f['brand'])
    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'مسلَّم', 'مرتجع', 'رسوم الإحالة',
               'رسوم FBN', 'إجمالي الرسوم', '% من الإيرادات', 'صافي بعد الرسوم']
    rows = []
    for d in data:
        rows.append([d['sku'], d['partner_sku'], d['name_en'] or d['name_ar'] or d['sku'],
                     d['units_del'], d['units_ret'], d['referral'], d['fbn'],
                     d['total_fees'], f"{d['fee_pct']:.2f}%", d['net_after_fees']])
    totals_row = [
        'الإجمالي', '', '',
        sum(d['units_del'] for d in data),
        sum(d['units_ret'] for d in data),
        round(sum(d['referral'] for d in data), 2),
        round(sum(d['fbn'] for d in data), 2),
        round(sum(d['total_fees'] for d in data), 2),
        '', '',
    ]
    today = datetime.now().strftime('%Y%m%d')
    buf, fname = rp.build_excel('Fees', headers, rows, totals_row=totals_row,
                                currency_cols=[6, 7, 8, 10],
                                filename=f'noon_fees_{today}.xlsx')
    return send_file(buf, as_attachment=True, download_name=fname,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.route('/reports/inventory/excel')
def report_inventory_excel():
    f = _parse_filters()
    data = rp.get_inventory_data(DB_PATH, f['brand'], f['cost_min'], f['cost_max'])
    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'العلامة', 'تكلفة الوحدة', 'تكاليف إضافية',
               'إجمالي/وحدة', 'مباع', 'مرتجع', 'إجمالي COGS', 'إجمالي ت. إضافية', 'إجمالي الاستثمار']
    rows = []
    for d in data:
        rows.append([d['sku'], d['partner_sku'], d['name_en'] or d['name_ar'] or d['sku'], d['brand_en'],
                     d['unit_cost'], d['extra_costs'], d['total_per_unit'],
                     d['units_sold'], d['units_returned'],
                     d['total_cogs'], d['total_extra'], d['total_investment']])
    totals_row = [
        'الإجمالي', '', '', '', '', '', '',
        sum(d['units_sold'] for d in data),
        sum(d['units_returned'] for d in data),
        round(sum(d['total_cogs'] for d in data), 2),
        round(sum(d['total_extra'] for d in data), 2),
        round(sum(d['total_investment'] for d in data), 2),
    ]
    today = datetime.now().strftime('%Y%m%d')
    buf, fname = rp.build_excel('Inventory', headers, rows, totals_row=totals_row,
                                currency_cols=[5, 6, 7, 10, 11, 12],
                                filename=f'noon_inventory_{today}.xlsx')
    return send_file(buf, as_attachment=True, download_name=fname,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@app.route('/reports/invoices-report/excel')
def report_invoices_excel():
    f = _parse_filters()
    data = rp.get_invoices_report_data(DB_PATH, f['supplier'], f['from_date'], f['to_date'])
    headers = ['رقم الفاتورة', 'المورد', 'التاريخ', 'الإجمالي',
               'الضريبة', 'الصافي', 'البنود', 'PDF']
    rows = []
    for d in data:
        rows.append([d['invoice_nr'], d['supplier_name'], d['invoice_date'],
                     d['total_amount'], d['vat_amount'], d['net_amount'],
                     d['item_count'], '✓' if d['has_pdf'] else '—'])
    totals_row = [
        'الإجمالي', '', '',
        round(sum(d['total_amount'] for d in data), 2),
        round(sum(d['vat_amount'] for d in data), 2),
        round(sum(d['net_amount'] for d in data), 2),
        len(data), '',
    ]
    today = datetime.now().strftime('%Y%m%d')
    buf, fname = rp.build_excel('Invoices', headers, rows, totals_row=totals_row,
                                currency_cols=[4, 5, 6],
                                filename=f'noon_invoices_{today}.xlsx')
    return send_file(buf, as_attachment=True, download_name=fname,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


# --- Report PDF export routes ---

@app.route('/reports/pl/pdf')
def report_pl_pdf():
    f = _parse_filters()
    data = rp.get_pl_data(DB_PATH, f['from_date'], f['to_date'])
    headers = ['الشهر', 'الإيرادات', 'رسوم noon', 'تكلفة البضاعة',
               'تكاليف إضافية', 'مجمل الربح', 'صافي الربح', 'الهامش %']
    rows = []
    for d in data:
        margin_str = f"{d['margin_pct']:.2f}%" if d['margin_pct'] is not None else '—'
        rows.append([d['month_ar'], d['revenue'], d['fees'], d['cogs'],
                     d['extra'], d['gross_profit'], d['net_profit'], margin_str])
    totals_row = ['الإجمالي',
                  round(sum(d['revenue'] for d in data), 2),
                  round(sum(d['fees'] for d in data), 2),
                  round(sum(d['cogs'] for d in data), 2),
                  round(sum(d['extra'] for d in data), 2),
                  round(sum(d['gross_profit'] for d in data), 2),
                  round(sum(d['net_profit'] for d in data), 2), '']
    buf, err = rp.build_pdf('تقرير الأرباح والخسائر الشهري', headers, rows, totals_row=totals_row)
    if err:
        return jsonify({'success': False, 'error': err}), 500
    today = datetime.now().strftime('%Y%m%d')
    return send_file(buf, as_attachment=True, download_name=f'noon_pl_{today}.pdf',
                     mimetype='application/pdf')


@app.route('/reports/sales/pdf')
def report_sales_pdf():
    f = _parse_filters()
    data = rp.get_sales_data(DB_PATH, f['from_date'], f['to_date'],
                             f['brand'], f['sort_by'], f['status'])
    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'مباع', 'مرتجع', 'الإيرادات',
               'رسوم noon', 'التكاليف', 'صافي الربح', 'الهامش%']
    rows = []
    for d in data:
        margin_str = f"{d['margin_pct']:.2f}%" if d['margin_pct'] is not None else '—'
        rows.append([d['sku'], d['partner_sku'], d['name_en'] or d['name_ar'] or d['sku'],
                     d['units_sold'], d['units_returned'],
                     d['revenue'], d['noon_fees'], d['cogs'], d['net_profit'], margin_str])
    totals_row = ['الإجمالي', '', '',
                  sum(d['units_sold'] for d in data),
                  sum(d['units_returned'] for d in data),
                  round(sum(d['revenue'] for d in data), 2),
                  round(sum(d['noon_fees'] for d in data), 2),
                  round(sum(d['cogs'] for d in data), 2),
                  round(sum(d['net_profit'] for d in data), 2), '']
    buf, err = rp.build_pdf('تقرير المبيعات حسب المنتج', headers, rows, totals_row=totals_row)
    if err:
        return jsonify({'success': False, 'error': err}), 500
    today = datetime.now().strftime('%Y%m%d')
    return send_file(buf, as_attachment=True, download_name=f'noon_sales_{today}.pdf',
                     mimetype='application/pdf')


@app.route('/reports/fees/pdf')
def report_fees_pdf():
    f = _parse_filters()
    data = rp.get_fees_data(DB_PATH, f['from_date'], f['to_date'], f['brand'])
    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'مسلَّم', 'مرتجع', 'رسوم الإحالة',
               'رسوم FBN', 'إجمالي الرسوم', '% الإيرادات', 'صافي بعد الرسوم']
    rows = []
    for d in data:
        rows.append([d['sku'], d['partner_sku'], d['name_en'] or d['name_ar'] or d['sku'],
                     d['units_del'], d['units_ret'], d['referral'], d['fbn'],
                     d['total_fees'], f"{d['fee_pct']:.2f}%", d['net_after_fees']])
    totals_row = ['الإجمالي', '', '',
                  sum(d['units_del'] for d in data),
                  sum(d['units_ret'] for d in data),
                  round(sum(d['referral'] for d in data), 2),
                  round(sum(d['fbn'] for d in data), 2),
                  round(sum(d['total_fees'] for d in data), 2), '', '']
    buf, err = rp.build_pdf('تقرير رسوم noon', headers, rows, totals_row=totals_row)
    if err:
        return jsonify({'success': False, 'error': err}), 500
    today = datetime.now().strftime('%Y%m%d')
    return send_file(buf, as_attachment=True, download_name=f'noon_fees_{today}.pdf',
                     mimetype='application/pdf')


@app.route('/reports/inventory/pdf')
def report_inventory_pdf():
    f = _parse_filters()
    data = rp.get_inventory_data(DB_PATH, f['brand'], f['cost_min'], f['cost_max'])
    headers = ['SKU noon', 'SKU الشريك', 'المنتج', 'العلامة', 'تكلفة الوحدة', 'إجمالي/وحدة',
               'مباع', 'مرتجع', 'إجمالي COGS', 'إجمالي الاستثمار']
    rows = []
    for d in data:
        rows.append([d['sku'], d['partner_sku'], d['name_en'] or d['name_ar'] or d['sku'], d['brand_en'],
                     d['unit_cost'], d['total_per_unit'],
                     d['units_sold'], d['units_returned'],
                     d['total_cogs'], d['total_investment']])
    totals_row = ['الإجمالي', '', '', '', '', '',
                  sum(d['units_sold'] for d in data),
                  sum(d['units_returned'] for d in data),
                  round(sum(d['total_cogs'] for d in data), 2),
                  round(sum(d['total_investment'] for d in data), 2)]
    buf, err = rp.build_pdf('تقرير المخزون والتكاليف', headers, rows, totals_row=totals_row)
    if err:
        return jsonify({'success': False, 'error': err}), 500
    today = datetime.now().strftime('%Y%m%d')
    return send_file(buf, as_attachment=True, download_name=f'noon_inventory_{today}.pdf',
                     mimetype='application/pdf')


@app.route('/reports/invoices-report/pdf')
def report_invoices_pdf():
    f = _parse_filters()
    data = rp.get_invoices_report_data(DB_PATH, f['supplier'], f['from_date'], f['to_date'])
    headers = ['رقم الفاتورة', 'المورد', 'التاريخ', 'الإجمالي',
               'الضريبة', 'الصافي', 'البنود']
    rows = []
    for d in data:
        rows.append([d['invoice_nr'], d['supplier_name'], d['invoice_date'],
                     d['total_amount'], d['vat_amount'], d['net_amount'], d['item_count']])
    totals_row = ['الإجمالي', '', '',
                  round(sum(d['total_amount'] for d in data), 2),
                  round(sum(d['vat_amount'] for d in data), 2),
                  round(sum(d['net_amount'] for d in data), 2),
                  len(data)]
    buf, err = rp.build_pdf('تقرير الفواتير والموردين', headers, rows, totals_row=totals_row)
    if err:
        return jsonify({'success': False, 'error': err}), 500
    today = datetime.now().strftime('%Y%m%d')
    return send_file(buf, as_attachment=True, download_name=f'noon_invoices_{today}.pdf',
                     mimetype='application/pdf')


@app.route('/reports/export')
def reports_export():
    export_type = request.args.get('type', '')
    if export_type not in ('pl', 'orders'):
        return "نوع التصدير غير صالح", 400

    db = get_db(DB_PATH)
    wb = Workbook()
    ws = wb.active
    today = datetime.now().strftime('%Y%m%d')

    if export_type == 'pl':
        ws.title = 'P&L'
        ws.append(['SKU', 'الاسم (EN)', 'الوحدات المباعة', 'الإيرادات (ر.س)',
                   'رسوم نون (ر.س)', 'تكلفة البضاعة (ر.س)',
                   'تكاليف إضافية (ر.س)', 'صافي الربح (ر.س)', 'هامش %'])
        for p in get_all_product_metrics(db):
            ws.append([
                p['sku'], p['name_en'], p['units_sold'],
                round(p['revenue'], 2), round(p['noon_fees'], 2),
                round(p['cogs'], 2), round(p['extra_costs'], 2),
                round(p['net_profit'], 2),
                round(p['margin_pct'], 2) if p['margin_pct'] is not None else '',
            ])
        filename = f'noon_pl_{today}.xlsx'

    else:
        ws.title = 'Orders'
        ws.append(['رقم الطلب', 'رقم العنصر', 'SKU', 'Partner SKU',
                   'العلامة (EN)', 'العلامة (AR)', 'المنتج (EN)', 'المنتج (AR)',
                   'الحالة', 'تاريخ الطلب', 'تاريخ التسليم', 'تاريخ الإرجاع',
                   'صافي العائد', 'رسوم الإحالة', 'رسوم FBN', 'إجمالي الدفع'])
        for o in db.execute("SELECT * FROM orders ORDER BY ordered_date DESC").fetchall():
            ws.append([
                o['order_nr'], o['item_nr'], o['sku'], o['partner_sku'],
                o['brand_en'], o['brand_ar'],
                o['product_title_en'], o['product_title_ar'],
                o['item_status'], o['ordered_date'],
                o['delivered_date'], o['returned_date'],
                o['net_proceeds'], o['referral_fee'],
                o['fbn_outbound_fee'], o['total_payment'],
            ])
        filename = f'noon_orders_{today}.xlsx'

    db.close()
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(buf, as_attachment=True, download_name=filename,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


# --- Pricing Calculator ---

@app.route('/calculator')
def calculator_page():
    return render_template('calculator.html')


@app.route('/api/calculate-price', methods=['POST'])
def api_calculate_price():
    data = request.get_json(silent=True) or {}
    try:
        cost               = float(data.get('cost', 0))
        cost_includes_vat  = bool(data.get('cost_includes_vat', False))
        commission_rate    = float(data.get('commission_rate', 0)) / 100
        shipping_fee       = float(data.get('shipping_fee', 0))
        storage_fee        = float(data.get('storage_fee', 0))
        ads_fee            = float(data.get('ads_fee', 0))
        other_fees         = float(data.get('other_fees', 0))
        target_margin      = float(data.get('target_margin', 0)) / 100
    except (TypeError, ValueError) as e:
        return jsonify({'success': False, 'error': f'قيم غير صالحة: {e}'}), 400

    if commission_rate + target_margin >= 1:
        return jsonify({'success': False,
                        'error': 'مجموع نسبة العمولة والهامش يجب أن يكون أقل من 100%'}), 400

    # Costs — all fees are entered excl. VAT (noon fees structure)
    cost_excl       = cost / 1.15 if cost_includes_vat else cost
    fixed_fees_excl = shipping_fee + storage_fee + ads_fee + other_fees

    # Solve: selling_excl × (1 - commission_rate - target_margin) = cost_excl + fixed_fees_excl
    denominator  = 1 - commission_rate - target_margin
    selling_excl = (cost_excl + fixed_fees_excl) / denominator
    selling_incl = selling_excl * 1.15

    commission_amount  = round(selling_excl * commission_rate, 2)
    fees_total_excl    = round(commission_amount + fixed_fees_excl, 2)
    input_vat_noon     = round(fees_total_excl * VAT_RATE, 2)
    output_vat         = round(selling_incl * VAT_FACTOR, 2)
    net_profit         = round(selling_excl - cost_excl - fees_total_excl, 2)
    actual_margin      = round(net_profit / selling_excl * 100, 2) if selling_excl else 0

    return jsonify({
        'success':           True,
        'cost_excl_vat':     round(cost_excl, 2),
        'fixed_fees_excl':   round(fixed_fees_excl, 2),
        'commission_amount': commission_amount,
        'fees_total_excl':   fees_total_excl,
        'input_vat_noon':    input_vat_noon,
        'selling_excl_vat':  round(selling_excl, 2),
        'selling_incl_vat':  round(selling_incl, 2),
        'output_vat':        output_vat,
        'net_profit':        net_profit,
        'actual_margin_pct': actual_margin,
    })


# --- Profitability Analysis ---

@app.route('/profitability')
def profitability_page():
    f          = _parse_filters()
    sku_search = request.args.get('sku_search', '').strip()
    badge_filter = request.args.get('badge_filter', '').strip()

    products = rp.get_profitability_data(
        DB_PATH, f['from_date'], f['to_date'], sku_search, badge_filter
    )

    totals = {
        'units_sold':  sum(p['units_sold']  for p in products),
        'revenue':     round(sum(p['revenue']     for p in products), 2),
        'noon_fees':   round(sum(p['noon_fees']   for p in products), 2),
        'input_vat_noon': round(sum(p['input_vat_noon'] for p in products), 2),
        'cogs':        round(sum(p['cogs']        for p in products), 2),
        'net_profit':  round(sum(p['net_profit']  for p in products), 2),
    }
    counts = {
        'profitable':   sum(1 for p in products if p['badge'] == 'profitable'),
        'low_margin':   sum(1 for p in products if p['badge'] == 'low_margin'),
        'loss':         sum(1 for p in products if p['badge'] == 'loss'),
        'missing_cost': sum(1 for p in products if p['badge'] == 'missing_cost'),
    }
    return render_template('profitability.html',
                           products=products, totals=totals, counts=counts,
                           from_date=f['from_date'], to_date=f['to_date'],
                           sku_search=sku_search, badge_filter=badge_filter)


@app.route('/profitability/excel')
def profitability_excel():
    f          = _parse_filters()
    sku_search = request.args.get('sku_search', '').strip()
    badge_filter = request.args.get('badge_filter', '').strip()

    products = rp.get_profitability_data(
        DB_PATH, f['from_date'], f['to_date'], sku_search, badge_filter
    )

    headers = [
        'SKU', 'المنتج', 'الوحدات', 'الإيرادات (شامل VAT)',
        'الإيرادات (بدون VAT)', 'رسوم نون', 'VAT رسوم نون',
        'تكلفة البضاعة', 'صافي الربح', 'هامش %', 'التصنيف',
    ]
    badge_labels = {
        'profitable': 'مربح', 'low_margin': 'هامش منخفض',
        'loss': 'خسارة', 'missing_cost': 'تكلفة مفقودة',
    }
    rows = [[
        p['sku'], p['name_en'] or p['name_ar'] or p['sku'],
        p['units_sold'], p['revenue'], p['revenue_excl_vat'],
        p['noon_fees_excl_vat'], p['input_vat_noon'],
        p['cogs'], p['net_profit'],
        p['margin_pct'] if p['margin_pct'] is not None else '',
        badge_labels.get(p['badge'], p['badge']),
    ] for p in products]

    totals_row = [
        'الإجمالي',
        '',
        sum(p['units_sold'] for p in products),
        round(sum(p['revenue']            for p in products), 2),
        round(sum(p['revenue_excl_vat']   for p in products), 2),
        round(sum(p['noon_fees_excl_vat'] for p in products), 2),
        round(sum(p['input_vat_noon']     for p in products), 2),
        round(sum(p['cogs']               for p in products), 2),
        round(sum(p['net_profit']         for p in products), 2),
        '', '',
    ]
    today = datetime.now().strftime('%Y%m%d')
    buf, fname = rp.build_excel(
        'Profitability', headers, rows, totals_row=totals_row,
        currency_cols=[4, 5, 6, 7, 8, 9], pct_cols=[10],
        filename=f'noon_profitability_{today}.xlsx',
    )
    return send_file(buf, as_attachment=True, download_name=fname,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


# --- VAT Center ---

@app.route('/vat-center')
def vat_center_page():
    f = _parse_filters()
    data = rp.get_vat_data(DB_PATH, f['from_date'], f['to_date'])
    totals = {
        'sales_incl':     round(sum(d['sales_incl']     for d in data), 2),
        'output_vat':     round(sum(d['output_vat']     for d in data), 2),
        'fees_excl':      round(sum(d['fees_excl']      for d in data), 2),
        'input_vat_noon': round(sum(d['input_vat_noon'] for d in data), 2),
        'input_vat_supp': round(sum(d['input_vat_supp'] for d in data), 2),
        'net_vat':        round(sum(d['net_vat']        for d in data), 2),
    }
    return render_template('vat_center.html',
                           data=data, totals=totals,
                           from_date=f['from_date'], to_date=f['to_date'])


# --- Settlements ---

@app.route('/settlements')
def settlements_page():
    f = _parse_filters()
    settlements = rp.get_settlements_data(DB_PATH, f['from_date'], f['to_date'])
    totals = {
        'gross_sales':    round(sum(s['gross_sales']   for s in settlements), 2),
        'total_fees':     round(sum(s['total_fees']    for s in settlements), 2),
        'vat_on_fees':    round(sum(s['vat_on_fees']   for s in settlements), 2),
        'our_net':        round(sum(s['our_net']       for s in settlements), 2),
        'actual_payout':  round(sum(s['actual_payout'] for s in settlements), 2),
        'mismatch_count': sum(1 for s in settlements if s['has_mismatch']),
    }
    return render_template('settlements.html',
                           settlements=settlements, totals=totals,
                           from_date=f['from_date'], to_date=f['to_date'])


# --- Browser auto-open ---

def open_browser():
    time.sleep(1.5)
    webbrowser.open('http://localhost:5000')


if __name__ == '__main__':
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(debug=False, port=5000, use_reloader=False)
