-- Merchant user management — additive only.
-- Adds merchant-specific role values and extends users table.

-- ALTER TYPE ADD VALUE cannot run inside a transaction on older Postgres.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'merchant_owner';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'merchant_accountant';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'merchant_inventory';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'merchant_data_entry';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'merchant_viewer';

-- Extend users table (additive, safe on existing rows)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone"  TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email"  TEXT;
