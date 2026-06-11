-- Add transaction_view import type and noon_statement_summaries table
-- for per-statement reconciliation of Noon Transaction View CSV files.

ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'transaction_view';

CREATE TABLE "noon_statement_summaries" (
  "id"                                   SERIAL PRIMARY KEY,
  "organization_id"                      INTEGER       NOT NULL,
  "import_batch_id"                      TEXT          NOT NULL,
  "reference_nr"                         TEXT          NOT NULL,
  "statement_date"                       TEXT,
  "net_proceeds"                         DECIMAL(14,2) NOT NULL DEFAULT 0,
  "fees_incl_vat"                        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "fees_excl_vat"                        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "statement_vat"                        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "statement_total"                      DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_after_vat"                        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tv_total"                             DECIMAL(14,2) NOT NULL DEFAULT 0,
  "difference"                           DECIMAL(10,2) NOT NULL DEFAULT 0,
  "status"                               TEXT          NOT NULL DEFAULT 'matched',
  "vat_estimated"                        BOOLEAN       NOT NULL DEFAULT true,
  "order_rows_count"                     INTEGER       NOT NULL DEFAULT 0,
  "order_update_rows_count"              INTEGER       NOT NULL DEFAULT 0,
  "ignored_payment_rows_count"           INTEGER       NOT NULL DEFAULT 0,
  "ignored_balance_transfer_rows_count"  INTEGER       NOT NULL DEFAULT 0,
  "created_at"                           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "noon_statement_summaries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
);

CREATE UNIQUE INDEX "noon_stmt_org_ref_unique"
  ON "noon_statement_summaries"("organization_id", "reference_nr");

CREATE INDEX "noon_stmt_org_idx"
  ON "noon_statement_summaries"("organization_id");

CREATE INDEX "noon_stmt_batch_idx"
  ON "noon_statement_summaries"("import_batch_id");
