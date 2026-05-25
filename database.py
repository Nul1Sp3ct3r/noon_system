import sqlite3
import os
from datetime import datetime
from werkzeug.security import generate_password_hash

IS_VERCEL = bool(os.environ.get('VERCEL'))

if IS_VERCEL:
    import libsql_experimental as libsql


# ---------------------------------------------------------------------------
# Turso row shim — mimics sqlite3.Row (index + key access)
# ---------------------------------------------------------------------------

class _TursoRow:
    __slots__ = ('_keys', '_vals')

    def __init__(self, keys, values):
        self._keys = keys
        self._vals = tuple(values)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._vals[key]
        try:
            return self._vals[self._keys.index(key)]
        except ValueError:
            raise KeyError(key)

    def keys(self):
        return list(self._keys)

    def __iter__(self):
        return iter(self._vals)

    def __len__(self):
        return len(self._vals)


class _TursoCursor:
    """Wraps a libsql Rows object so fetchall/fetchone return _TursoRow objects."""

    def __init__(self, cursor):
        self._cursor = cursor
        # description is available immediately after execute (same format as sqlite3)
        self._cols = [d[0] for d in cursor.description] if cursor.description else []

    def fetchall(self):
        return [_TursoRow(self._cols, row) for row in self._cursor.fetchall()]

    def fetchone(self):
        row = self._cursor.fetchone()
        return _TursoRow(self._cols, row) if row is not None else None

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def description(self):
        return self._cursor.description

    def __iter__(self):
        for row in self._cursor:
            yield _TursoRow(self._cols, row)


class _TursoConnection:
    """Wraps a libsql Connection so every execute() returns a _TursoCursor."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, parameters=()):
        if parameters is None:
            parameters = ()
        elif isinstance(parameters, list):
            parameters = tuple(parameters)
        return _TursoCursor(self._conn.execute(sql, parameters))

    def executemany(self, sql, seq):
        return _TursoCursor(self._conn.executemany(sql, seq))

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


# ---------------------------------------------------------------------------
# Schema DDL as individual statements (required for Turso — no executescript)
# ---------------------------------------------------------------------------

_DDL = [
    """CREATE TABLE IF NOT EXISTS orders (
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
    )""",
    """CREATE TABLE IF NOT EXISTS products (
        sku TEXT PRIMARY KEY,
        partner_sku TEXT,
        brand_en TEXT,
        brand_ar TEXT,
        name_en TEXT,
        name_ar TEXT,
        barcode TEXT,
        unit_cost REAL DEFAULT 0,
        extra_costs REAL DEFAULT 0,
        notes TEXT,
        updated_at TEXT,
        cost_includes_vat INTEGER DEFAULT 1
    )""",
    """CREATE TABLE IF NOT EXISTS invoices (
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
    )""",
    """CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        sku TEXT,
        product_name TEXT,
        quantity INTEGER,
        unit_cost REAL,
        total_cost REAL
    )""",
    """CREATE TABLE IF NOT EXISTS imported_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        statement_nr TEXT,
        statement_date TEXT,
        filename TEXT,
        file_hash TEXT,
        imported_at TEXT,
        rows_added INTEGER DEFAULT 0,
        rows_updated INTEGER DEFAULT 0,
        rows_ignored INTEGER DEFAULT 0
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup ON orders(order_nr, item_nr, item_status)",
    "CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders(sku)",
    "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(item_status)",
    "CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)",
    """CREATE TABLE IF NOT EXISTS journal_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_date  TEXT NOT NULL,
        description TEXT NOT NULL,
        source_type TEXT,
        source_id   TEXT,
        created_at  TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS journal_lines (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        account_ar TEXT NOT NULL,
        debit      REAL DEFAULT 0,
        credit     REAL DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS idx_journal_lines_j ON journal_lines(journal_id)",
    """CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 0,
        created_at TEXT,
        last_login TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
    """CREATE TABLE IF NOT EXISTS noon_statement_fees (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        statement_nr   TEXT,
        statement_date TEXT,
        fee_type       TEXT,
        description    TEXT,
        excl_vat       REAL DEFAULT 0,
        vat_amount     REAL DEFAULT 0,
        incl_vat       REAL DEFAULT 0,
        import_batch   TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_nsf_batch ON noon_statement_fees(import_batch)",
    """CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        movement_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL DEFAULT 0,
        reference_type TEXT,
        reference_id TEXT,
        notes TEXT,
        is_void INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_inv_mov_sku ON inventory_movements(sku)",
    "CREATE INDEX IF NOT EXISTS idx_inv_mov_wh ON inventory_movements(warehouse_id)",
    "CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(movement_type)",
]


# ---------------------------------------------------------------------------
# init_db
# ---------------------------------------------------------------------------

def init_db(db_path):
    if IS_VERCEL:
        _init_turso()
    else:
        _init_sqlite(db_path)


def _init_sqlite(db_path):
    """Original sqlite3 path — unchanged."""
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
            barcode TEXT,
            unit_cost REAL DEFAULT 0,
            extra_costs REAL DEFAULT 0,
            notes TEXT,
            updated_at TEXT,
            cost_includes_vat INTEGER DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

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

        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup ON orders(order_nr, item_nr, item_status);
        CREATE INDEX IF NOT EXISTS idx_orders_sku ON orders(sku);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(item_status);
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

        CREATE TABLE IF NOT EXISTS journal_entries (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_date  TEXT NOT NULL,
            description TEXT NOT NULL,
            source_type TEXT,
            source_id   TEXT,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS journal_lines (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
            account_ar TEXT NOT NULL,
            debit      REAL DEFAULT 0,
            credit     REAL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_journal_lines_j ON journal_lines(journal_id);

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 0,
            created_at TEXT,
            last_login TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

        CREATE TABLE IF NOT EXISTS noon_statement_fees (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            statement_nr   TEXT,
            statement_date TEXT,
            fee_type       TEXT,
            description    TEXT,
            excl_vat       REAL DEFAULT 0,
            vat_amount     REAL DEFAULT 0,
            incl_vat       REAL DEFAULT 0,
            import_batch   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_nsf_batch ON noon_statement_fees(import_batch);

        CREATE TABLE IF NOT EXISTS warehouses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS inventory_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit_cost REAL DEFAULT 0,
            reference_type TEXT,
            reference_id TEXT,
            notes TEXT,
            is_void INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_inv_mov_sku ON inventory_movements(sku);
        CREATE INDEX IF NOT EXISTS idx_inv_mov_wh ON inventory_movements(warehouse_id);
        CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(movement_type);
    """)

    # Migration: upgrade imported_files if it has old schema
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

    # Migration: add last_login column if missing
    cur = conn.execute("PRAGMA table_info(users)")
    user_cols = {row[1] for row in cur.fetchall()}
    if 'last_login' not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN last_login TEXT")

    # Migration: upgrade dedup index to 3-column key (order_nr, item_nr, item_status)
    cur = conn.execute("PRAGMA index_info('idx_orders_dedup')")
    idx_cols = [row[2] for row in cur.fetchall()]
    if 'item_status' not in idx_cols:
        conn.execute("DROP INDEX IF EXISTS idx_orders_dedup")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup "
            "ON orders(order_nr, item_nr, item_status)"
        )

    # Migration: create noon_statement_fees if not exists
    conn.execute("""CREATE TABLE IF NOT EXISTS noon_statement_fees (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        statement_nr   TEXT,
        statement_date TEXT,
        fee_type       TEXT,
        description    TEXT,
        excl_vat       REAL DEFAULT 0,
        vat_amount     REAL DEFAULT 0,
        incl_vat       REAL DEFAULT 0,
        import_batch   TEXT
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_nsf_batch ON noon_statement_fees(import_batch)")

    # Migration: add cost_includes_vat / barcode if missing
    cur = conn.execute("PRAGMA table_info(products)")
    prod_cols = {row[1] for row in cur.fetchall()}
    if 'cost_includes_vat' not in prod_cols:
        conn.execute("ALTER TABLE products ADD COLUMN cost_includes_vat INTEGER DEFAULT 1")
    if 'barcode' not in prod_cols:
        conn.execute("ALTER TABLE products ADD COLUMN barcode TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)")

    # Migration: create inventory tables if not exists
    conn.execute("""CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
        is_active INTEGER DEFAULT 1, created_at TEXT
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL, warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        movement_type TEXT NOT NULL, quantity REAL NOT NULL,
        unit_cost REAL DEFAULT 0, reference_type TEXT, reference_id TEXT,
        notes TEXT, is_void INTEGER DEFAULT 0, created_at TEXT NOT NULL
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_sku ON inventory_movements(sku)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_wh ON inventory_movements(warehouse_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(movement_type)")

    # Seed default warehouses
    _wh_now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    for _wh_code, _wh_name in [('MAIN', 'المستودع الرئيسي'), ('FBN', 'مستودع نون FBN'),
                                 ('RETURNS', 'مستودع المرتجعات'), ('DAMAGED', 'مستودع التالف')]:
        conn.execute(
            "INSERT OR IGNORE INTO warehouses (name, code, is_active, created_at) VALUES (?,?,1,?)",
            (_wh_name, _wh_code, _wh_now)
        )

    # Seed default admin if users table is empty
    cnt = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if cnt == 0:
        conn.execute(
            "INSERT INTO users (username, password_hash, full_name, role, is_active, created_at)"
            " VALUES (?,?,?,?,1,?)",
            ('admin', generate_password_hash('admin123'), 'المدير', 'admin',
             datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        )

    conn.commit()
    conn.close()


def _init_turso():
    """Turso path — runs each DDL statement individually (no executescript).
    Wrapped in try/except so a cold-start connection failure logs a warning
    but does not crash the module import (tables already exist on warm starts).
    """
    try:
        conn = libsql.connect(
            database=os.environ['TURSO_DATABASE_URL'],
            auth_token=os.environ['TURSO_AUTH_TOKEN'],
        )
        for stmt in _DDL:
            conn.execute(stmt)

        # Migration check (rows are raw tuples here — no row_factory set yet)
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

        # Migration: add last_login column if missing
        cur = conn.execute("PRAGMA table_info(users)")
        user_cols = {row[1] for row in cur.fetchall()}
        if 'last_login' not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN last_login TEXT")

        # Migration: upgrade dedup index to 3-column key
        try:
            cur = conn.execute("PRAGMA index_info('idx_orders_dedup')")
            idx_cols = [row[2] for row in cur.fetchall()]
            if 'item_status' not in idx_cols:
                conn.execute("DROP INDEX IF EXISTS idx_orders_dedup")
                conn.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_dedup "
                    "ON orders(order_nr, item_nr, item_status)"
                )
        except Exception:
            pass

        # Migration: create noon_statement_fees if not exists
        conn.execute("""CREATE TABLE IF NOT EXISTS noon_statement_fees (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            statement_nr   TEXT,
            statement_date TEXT,
            fee_type       TEXT,
            description    TEXT,
            excl_vat       REAL DEFAULT 0,
            vat_amount     REAL DEFAULT 0,
            incl_vat       REAL DEFAULT 0,
            import_batch   TEXT
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nsf_batch ON noon_statement_fees(import_batch)")

        # Migration: add cost_includes_vat / barcode if missing
        try:
            cur = conn.execute("PRAGMA table_info(products)")
            prod_cols = {row[1] for row in cur.fetchall()}
            if 'cost_includes_vat' not in prod_cols:
                conn.execute("ALTER TABLE products ADD COLUMN cost_includes_vat INTEGER DEFAULT 1")
            if 'barcode' not in prod_cols:
                conn.execute("ALTER TABLE products ADD COLUMN barcode TEXT")
            # Always ensure index exists — safe whether column was just added or already present
            conn.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)")
        except Exception:
            pass

        # Migration: create inventory tables if not exists
        try:
            conn.execute("""CREATE TABLE IF NOT EXISTS warehouses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
                is_active INTEGER DEFAULT 1, created_at TEXT
            )""")
            conn.execute("""CREATE TABLE IF NOT EXISTS inventory_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT NOT NULL, warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
                movement_type TEXT NOT NULL, quantity REAL NOT NULL,
                unit_cost REAL DEFAULT 0, reference_type TEXT, reference_id TEXT,
                notes TEXT, is_void INTEGER DEFAULT 0, created_at TEXT NOT NULL
            )""")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_sku ON inventory_movements(sku)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_wh ON inventory_movements(warehouse_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON inventory_movements(movement_type)")
            _wh_now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            for _wh_code, _wh_name in [('MAIN', 'المستودع الرئيسي'), ('FBN', 'مستودع نون FBN'),
                                         ('RETURNS', 'مستودع المرتجعات'), ('DAMAGED', 'مستودع التالف')]:
                conn.execute(
                    "INSERT OR IGNORE INTO warehouses (name, code, is_active, created_at) VALUES (?,?,1,?)",
                    (_wh_name, _wh_code, _wh_now)
                )
        except Exception:
            pass

        # Seed default admin if users table is empty
        cnt_row = conn.execute("SELECT COUNT(*) FROM users").fetchone()
        if cnt_row is not None and int(cnt_row[0]) == 0:
            conn.execute(
                "INSERT INTO users (username, password_hash, full_name, role, is_active, created_at)"
                " VALUES (?,?,?,?,1,?)",
                ('admin', generate_password_hash('admin123'), 'المدير', 'admin',
                 datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            )

        conn.commit()
        conn.close()
    except Exception as e:
        import sys
        print(f"[Turso init warning] Schema init failed (tables may already exist): {e}",
              file=sys.stderr)


# ---------------------------------------------------------------------------
# get_db — called per-request throughout app.py and reports.py
# ---------------------------------------------------------------------------

def get_db(db_path=None):
    if IS_VERCEL:
        raw = libsql.connect(
            database=os.environ['TURSO_DATABASE_URL'],
            auth_token=os.environ['TURSO_AUTH_TOKEN'],
        )
        return _TursoConnection(raw)
    else:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.row_factory = sqlite3.Row
        return conn
