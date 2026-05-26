# Backup & Restore Guide — Noon Financial

## How to Download a Backup

1. Log in as an admin user.
2. Navigate to **الإدارة → النسخ الاحتياطية** (`/admin/backups`).
3. Select the target organization from the dropdown.
4. Click **تنزيل النسخة الاحتياطية**.
5. A JSON file named `backup_org_<org_id>_<timestamp>.json` will download.

## What Is Included

The backup exports the following tables for the selected organization:

| Table | Description |
|-------|-------------|
| `products` | Product catalog with costs |
| `orders` | Sales and return orders |
| `invoices` | Supplier invoices |
| `invoice_items` | Line items for each invoice |
| `imported_files` | Import history log |
| `noon_statement_fees` | Noon fee statement rows |
| `warehouses` | Warehouse definitions |
| `inventory_movements` | Full inventory movement ledger |
| `audit_logs` | Security and action audit trail |

Each row is serialized as a JSON object. Only rows belonging to the selected
`organization_id` are included.

## What Is Excluded

The following data is intentionally **not** exported for security reasons:

- `password_hash` — user password hashes
- CSRF tokens, session tokens, or authentication tokens
- Environment variables (`SECRET_KEY`, `TURSO_AUTH_TOKEN`, etc.)
- Data belonging to other organizations
- The `users` table (contains password hashes)

## Backup File Format

```json
{
  "meta": {
    "exported_at": "2026-05-26 10:30:00",
    "organization_id": 1,
    "exported_by_user_id": 2,
    "app": "Noon Financial",
    "version": "1.0"
  },
  "data": {
    "products": [ { "sku": "R0001", ... }, ... ],
    "orders":   [ { ... }, ... ],
    ...
  }
}
```

## Manual Restore Procedure

Automatic restore is not yet implemented. To restore data:

1. **Obtain the backup JSON file** from the admin.

2. **Parse the JSON** using Python or any JSON tool:
   ```python
   import json
   with open('backup_org_1_20260526_103000.json') as f:
       backup = json.load(f)
   ```

3. **Connect to the target database** (SQLite or Turso):
   ```python
   import sqlite3
   conn = sqlite3.connect('data/noon.db')
   ```

4. **Re-insert rows** for each table using `INSERT OR IGNORE`:
   ```python
   for table, rows in backup['data'].items():
       if not rows:
           continue
       cols = list(rows[0].keys())
       placeholders = ','.join(['?'] * len(cols))
       sql = f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
       for row in rows:
           conn.execute(sql, [row[c] for c in cols])
   conn.commit()
   ```

5. **Verify** critical row counts after restore:
   ```sql
   SELECT COUNT(*) FROM products;
   SELECT COUNT(*) FROM orders;
   SELECT COUNT(*) FROM invoices;
   ```

6. **Restart the application** and confirm data is visible.

> **Warning:** Never restore into a database with existing production data without
> first taking a fresh backup. Use `INSERT OR IGNORE` (not `INSERT OR REPLACE`) to
> avoid overwriting newer records.

## Recommended Backup Policy

| Frequency | Retention | Storage |
|-----------|-----------|---------|
| Daily | 30 days | Off-server (S3, Google Drive, etc.) |
| Weekly | 3 months | Cold storage |
| Monthly | 1 year | Encrypted archive |

- Download backups from `/admin/backups` at the end of each business day.
- Store files in a location separate from the Vercel/production environment.
- Test restore to a staging environment at least once per quarter.
- Verify the downloaded JSON is valid (not empty or truncated) after each export.
- The `audit_logs` table is included in backups for compliance and accountability.

## Security Notes

- Backup downloads are rate-limited to **5 per hour per admin user**.
- Every backup download is logged in `audit_logs` with action `backup_export`.
- Only users with role `admin` can access `/admin/backups` and `/admin/backups/download`.
- The backup JSON never contains password hashes or authentication secrets.
