-- Add financial-engine tracking fields to NoonStatementSummary
ALTER TABLE "noon_statement_summaries"
  ADD COLUMN "source"                VARCHAR(50) NOT NULL DEFAULT 'transaction_view',
  ADD COLUMN "monthly_reconciled"    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "reconciliation_status" VARCHAR(50) NOT NULL DEFAULT 'tv_only',
  ADD COLUMN "payout_amount"         DECIMAL(14,2);

-- Add category to StatementFee for efficient supplementary-fee filtering
ALTER TABLE "statement_fees"
  ADD COLUMN "category" VARCHAR(50);

-- Backfill category from description using same rules as classifyFeeDescription()
UPDATE "statement_fees" SET "category" =
  CASE
    WHEN LOWER(description) LIKE '%referral%'                                             THEN 'referralFee'
    WHEN LOWER(description) LIKE '%fbn outbound%' OR LOWER(description) LIKE '%fbn out%' THEN 'fbnOutboundFee'
    WHEN LOWER(description) LIKE '%storage%'                                              THEN 'storageFee'
    WHEN LOWER(description) LIKE '%return administration%'
      OR LOWER(description) LIKE '%return admin%'                                         THEN 'returnFee'
    WHEN LOWER(description) LIKE '%damaged return%'
      OR LOWER(description) LIKE '%damaged item%'                                         THEN 'damageFee'
    WHEN LOWER(description) LIKE '%rtv%' OR LOWER(description) LIKE '%removal%'          THEN 'removalFee'
    WHEN LOWER(description) LIKE '%compensation%'                                         THEN 'compensation'
    ELSE 'other'
  END;

-- Performance indices
CREATE INDEX "noon_statement_summaries_statement_date_idx"
  ON "noon_statement_summaries"("statement_date");

CREATE INDEX "noon_statement_summaries_org_date_idx"
  ON "noon_statement_summaries"("organization_id", "statement_date");

CREATE INDEX "statement_fees_category_idx"
  ON "statement_fees"("organization_id", "category");
