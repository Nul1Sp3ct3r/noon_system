-- CreateTable
CREATE TABLE "reference_sequences" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_sequences_org_id_prefix_year_key" ON "reference_sequences"("org_id", "prefix", "year");

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "internal_ref" TEXT;
