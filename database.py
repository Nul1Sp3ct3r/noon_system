import sqlite3
import os


def init_db(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_nr TEXT,
            item_nr TEXT,
            sku TEXT,
            partner_sku TEXT,
            brand_en TEXT,
            brand_ar TEXT,
            product_title_en TEXT,
            product_title_ar TEXT,
            item_status TEXT,
            ordered_date TEXT,
            delivered_date TEXT,
            returned_date TEXT,
            net_proceeds REAL DEFAULT 0,
            referral_fee REAL DEFAULT 0,
            fbn_outbound_fee REAL DEFAULT 0,
            total_payment REAL DEFAULT 0,
            import_batch TEXT
        );

        CREATE TABLE IF NOT EXISTS products (
            sku TEXT PRIMARY KEY,
            partner_sku TEXT,
            brand_en TEXT,
            brand_ar TEXT,
            name_en TEXT,
            name_ar TEXT,
            unit_cost REAL DEFAULT 0,
            extra_costs REAL DEFAULT 0,
            notes TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_nr TEXT,
            supplier_name TEXT,
            invoice_date TEXT,
            total_amount REAL,
            vat_amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'SAR',
            notes TEXT,
            pdf_filename TEXT,
            pdf_original_name TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
            sku TEXT,
            product_name TEXT,
            quantity INTEGER,
            unit_cost REAL,
            total_cost REAL
        );

        CREATE TABLE IF NOT EXISTS imported_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            file_hash TEXT UNIQUE,
            imported_at TEXT,
            rows_added INTEGER,
            rows_updated INTEGER
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup ON orders(order_nr, item_nr);
        CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders(sku);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(item_status);
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
    """)
    conn.commit()
    conn.close()


def get_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn
