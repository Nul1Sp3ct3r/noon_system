-- Expenses module: ExpenseCategory + Expense tables

-- New enums
CREATE TYPE "ExpenseStatus" AS ENUM ('draft', 'posted');
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'cash', 'credit_card', 'check', 'other');

-- Expense Categories
CREATE TABLE "expense_categories" (
  "id"              SERIAL       NOT NULL,
  "organization_id" INTEGER      NOT NULL,
  "name"            TEXT         NOT NULL,
  "account_code"    TEXT,
  "is_active"       BOOLEAN      NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_categories_organization_id_idx"
  ON "expense_categories"("organization_id");

ALTER TABLE "expense_categories"
  ADD CONSTRAINT "expense_categories_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Expenses
CREATE TABLE "expenses" (
  "id"                SERIAL          NOT NULL,
  "organization_id"   INTEGER         NOT NULL,
  "expense_date"      TEXT            NOT NULL,
  "vendor"            TEXT,
  "category_id"       INTEGER,
  "description"       TEXT,
  "amount_before_vat" DECIMAL(14,2)   NOT NULL,
  "vat_amount"        DECIMAL(12,2)   NOT NULL DEFAULT 0,
  "total_amount"      DECIMAL(14,2)   NOT NULL,
  "payment_method"    "PaymentMethod" NOT NULL DEFAULT 'bank_transfer',
  "reference_number"  TEXT,
  "notes"             TEXT,
  "attachment_data"   BYTEA,
  "attachment_name"   TEXT,
  "attachment_mime"   TEXT,
  "status"            "ExpenseStatus" NOT NULL DEFAULT 'draft',
  "journal_entry_id"  INTEGER,
  "created_by_id"     INTEGER,
  "created_at"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_organization_id_idx" ON "expenses"("organization_id");
CREATE INDEX "expenses_expense_date_idx"    ON "expenses"("expense_date");
CREATE INDEX "expenses_status_idx"          ON "expenses"("status");
CREATE INDEX "expenses_category_id_idx"     ON "expenses"("category_id");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_journal_entry_id_fkey"
  FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
