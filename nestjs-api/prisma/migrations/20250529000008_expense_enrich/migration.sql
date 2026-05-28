-- Expense enrichment: new enum values + new columns
-- All additive — zero impact on existing rows or data.

-- Extend PaymentMethod with modern payment channels
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'treasury';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'stc_pay';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'employee_advance';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'deferred';

-- Extend ExpenseStatus with full AP workflow states
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'rejected';

-- New enrichment columns (all nullable)
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "vat_treatment" TEXT,
  ADD COLUMN IF NOT EXISTS "cost_center"   TEXT,
  ADD COLUMN IF NOT EXISTS "account_code"  TEXT;

CREATE INDEX IF NOT EXISTS "expenses_cost_center_idx"   ON "expenses"("cost_center");
CREATE INDEX IF NOT EXISTS "expenses_account_code_idx"  ON "expenses"("account_code");
