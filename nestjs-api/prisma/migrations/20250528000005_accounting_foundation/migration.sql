-- Phase 1: Chart of Accounts + Journal enhancements
-- Phase 7: Journal Templates
-- Phase 8: Accounting Periods

-- New enums
CREATE TYPE "AccountType"    AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE "NormalBalance"  AS ENUM ('debit', 'credit');
CREATE TYPE "JournalStatus"  AS ENUM ('draft', 'posted', 'reversed');

-- Chart of Accounts table
CREATE TABLE "accounts" (
  "id"               SERIAL         NOT NULL,
  "organization_id"  INTEGER        NOT NULL,
  "code"             TEXT           NOT NULL,
  "name_ar"          TEXT           NOT NULL,
  "name_en"          TEXT,
  "account_type"     "AccountType"  NOT NULL,
  "normal_balance"   "NormalBalance" NOT NULL,
  "parent_id"        INTEGER,
  "is_active"        BOOLEAN        NOT NULL DEFAULT true,
  "description"      TEXT,
  "created_at"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_organization_id_code_key" ON "accounts"("organization_id", "code");
CREATE INDEX "accounts_organization_id_idx"  ON "accounts"("organization_id");
CREATE INDEX "accounts_parent_id_idx"        ON "accounts"("parent_id");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Upgrade journal_entries
ALTER TABLE "journal_entries"
  ADD COLUMN "journal_number" TEXT,
  ADD COLUMN "reference"      TEXT,
  ADD COLUMN "status"         "JournalStatus" NOT NULL DEFAULT 'posted',
  ADD COLUMN "created_by_id"  INTEGER;

CREATE INDEX "journal_entries_journal_number_idx" ON "journal_entries"("journal_number");
CREATE INDEX "journal_entries_status_idx"         ON "journal_entries"("status");

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Upgrade journal_lines
ALTER TABLE "journal_lines"
  ADD COLUMN "account_id" INTEGER,
  ADD COLUMN "notes"      TEXT;

CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Journal Templates
CREATE TABLE "journal_templates" (
  "id"               SERIAL       NOT NULL,
  "organization_id"  INTEGER      NOT NULL,
  "name"             TEXT         NOT NULL,
  "description"      TEXT,
  "template_lines"   JSONB        NOT NULL,
  "is_active"        BOOLEAN      NOT NULL DEFAULT true,
  "is_system"        BOOLEAN      NOT NULL DEFAULT false,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "journal_templates_organization_id_idx" ON "journal_templates"("organization_id");

ALTER TABLE "journal_templates" ADD CONSTRAINT "journal_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Accounting Periods
CREATE TABLE "accounting_periods" (
  "id"               SERIAL       NOT NULL,
  "organization_id"  INTEGER      NOT NULL,
  "period_year"      INTEGER      NOT NULL,
  "period_month"     INTEGER      NOT NULL,
  "is_closed"        BOOLEAN      NOT NULL DEFAULT false,
  "closed_at"        TIMESTAMP(3),
  "closed_by_id"     INTEGER,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_periods_org_year_month_key"
  ON "accounting_periods"("organization_id", "period_year", "period_month");
CREATE INDEX "accounting_periods_organization_id_idx" ON "accounting_periods"("organization_id");

ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_id_fkey"
  FOREIGN KEY ("closed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
