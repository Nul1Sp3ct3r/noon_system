-- Add statement_ref to orders table so Transaction View imports can link
-- each order row back to its PS-* statement reference number.
-- Safe additive migration: nullable column with an index.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "statement_ref" TEXT;

CREATE INDEX IF NOT EXISTS "orders_statement_ref_idx" ON "orders"("statement_ref");
