-- AlterTable: add extra_costs column to products
ALTER TABLE "products" ADD COLUMN "extra_costs" DECIMAL(12,4);
