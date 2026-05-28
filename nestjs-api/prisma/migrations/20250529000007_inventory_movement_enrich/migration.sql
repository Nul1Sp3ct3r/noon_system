-- Additive enrichment columns for inventory_movements
-- All nullable — zero impact on existing rows

ALTER TABLE "inventory_movements"
  ADD COLUMN IF NOT EXISTS "reference_type"      TEXT,
  ADD COLUMN IF NOT EXISTS "reason_code"         TEXT,
  ADD COLUMN IF NOT EXISTS "unit_cost_override"  DECIMAL(12, 4);

CREATE INDEX IF NOT EXISTS "inventory_movements_reference_type_idx"
  ON "inventory_movements"("reference_type");

CREATE INDEX IF NOT EXISTS "inventory_movements_reason_code_idx"
  ON "inventory_movements"("reason_code");
