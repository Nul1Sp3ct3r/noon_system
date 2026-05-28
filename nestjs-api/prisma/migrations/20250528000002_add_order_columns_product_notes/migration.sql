-- Add missing order columns (brand_ar, product_title_ar, delivered_date, returned_date)
ALTER TABLE "orders" ADD COLUMN "product_title_ar" TEXT;
ALTER TABLE "orders" ADD COLUMN "brand_ar" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivered_date" TEXT;
ALTER TABLE "orders" ADD COLUMN "returned_date" TEXT;

-- Add notes to products
ALTER TABLE "products" ADD COLUMN "notes" TEXT;
