-- Product Families: logical grouping of Noon SKU variants for reporting.
-- Accounting/imports remain SKU-based; families aggregate at the reporting layer only.

CREATE TABLE "product_families" (
  "id"               SERIAL PRIMARY KEY,
  "organization_id"  INTEGER        NOT NULL,
  "name"             TEXT           NOT NULL,
  "description"      TEXT,
  "base_cost"        DECIMAL(12, 4),
  "cost_includes_vat" BOOLEAN       NOT NULL DEFAULT false,
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_families_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
);

CREATE INDEX "product_families_org_idx" ON "product_families"("organization_id");

CREATE TABLE "product_family_items" (
  "id"          SERIAL PRIMARY KEY,
  "family_id"   INTEGER        NOT NULL,
  "product_id"  INTEGER        NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_family_items_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "product_families"("id") ON DELETE CASCADE,
  CONSTRAINT "product_family_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "product_family_items_unique"
  ON "product_family_items"("family_id", "product_id");

CREATE INDEX "product_family_items_family_idx"   ON "product_family_items"("family_id");
CREATE INDEX "product_family_items_product_idx"  ON "product_family_items"("product_id");
