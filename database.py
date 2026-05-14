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
            statement_nr TEXT,
            statement_date TEXT,
            filename TEXT,
            file_hash TEXT,
            imported_at TEXT,
            rows_added INTEGER DEFAULT 0,
            rows_updated INTEGER DEFAULT 0,
            rows_ignored INTEGER DEFAULT 0
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup ON orders(order_nr, item_nr);
        CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders(sku);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(item_status);
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
    """)

    # Migration: upgrade imported_files if it has old schema (file_hash UNIQUE, missing columns)
    cur = conn.execute("PRAGMA table_info(imported_files)")
    cols = {row[1] for row in cur.fetchall()}
    if 'statement_nr' not in cols:
        conn.execute("ALTER TABLE imported_files RENAME TO _imported_files_old")
        conn.execute("""
            CREATE TABLE imported_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                statement_nr TEXT,
                statement_date TEXT,
                filename TEXT,
                file_hash TEXT,
                imported_at TEXT,
                rows_added INTEGER DEFAULT 0,
                rows_updated INTEGER DEFAULT 0,
                rows_ignored INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            INSERT INTO imported_files (filename, file_hash, imported_at, rows_added, rows_updated)
            SELECT filename, file_hash, imported_at, rows_added, rows_updated
            FROM _imported_files_old
        """)
        conn.execute("DROP TABLE _imported_files_old")
    elif 'rows_ignored' not in cols:
        conn.execute("ALTER TABLE imported_files ADD COLUMN rows_ignored INTEGER DEFAULT 0")

    conn.commit()
    conn.close()


def get_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn
