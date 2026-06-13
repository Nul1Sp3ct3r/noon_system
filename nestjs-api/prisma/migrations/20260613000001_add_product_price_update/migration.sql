-- Add product_price_update to ImportType enum
ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'product_price_update';

-- Create product_cost_updates table for rollback/history tracking
CREATE TABLE "product_cost_updates" (
  "id"               SERIAL PRIMARY KEY,
  "organization_id"  INTEGER NOT NULL,
  "import_batch_id"  TEXT NOT NULL,
  "product_id"       INTEGER NOT NULL,
  "sku"              TEXT NOT NULL,
  "partner_sku"      TEXT,
  "old_cost"         DECIMAL(12,4),
  "new_cost"         DECIMAL(12,4) NOT NULL,
  "cost_includes_vat" BOOLEAN NOT NULL DEFAULT false,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_cost_updates_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_cost_updates_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "product_cost_updates_organization_id_idx" ON "product_cost_updates"("organization_id");
CREATE INDEX "product_cost_updates_import_batch_id_idx" ON "product_cost_updates"("import_batch_id");
CREATE INDEX "product_cost_updates_product_id_idx" ON "product_cost_updates"("product_id");
