-- Add PDF attachment fields to invoices
ALTER TABLE "invoices" ADD COLUMN "pdf_data" BYTEA;
ALTER TABLE "invoices" ADD COLUMN "pdf_filename" TEXT;
ALTER TABLE "invoices" ADD COLUMN "pdf_original_name" TEXT;
