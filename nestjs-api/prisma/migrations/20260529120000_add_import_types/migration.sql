-- Add new ImportType values for weekly Noon sales and full inventory snapshot imports.
-- ALTER TYPE ADD VALUE cannot run inside a transaction on older PostgreSQL versions;
-- Prisma's migration engine handles this correctly via its transaction-exempt path.

ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'weekly_noon';
ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'full_inventory';
