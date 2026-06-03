-- VAT registration settings for organizations
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vat_registered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vat_number"     TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "profit_mode"    TEXT NOT NULL DEFAULT 'expense';
