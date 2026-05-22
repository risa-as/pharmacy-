-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS "Sale_invoiceNumber_seq";

-- AlterTable: add invoiceNumber column (nullable first to allow backfill)
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "invoiceNumber" INTEGER;

-- Backfill existing rows in chronological order (createdAt ASC)
UPDATE "Sale" SET "invoiceNumber" = subquery.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS row_num
  FROM "Sale"
) subquery
WHERE "Sale".id = subquery.id;

-- Set sequence to start after the current maximum (or 1 if table is empty)
SELECT setval(
  '"Sale_invoiceNumber_seq"',
  COALESCE((SELECT MAX("invoiceNumber") FROM "Sale"), 0) + 1,
  false
);

-- Apply sequence as default and enforce NOT NULL + UNIQUE
ALTER TABLE "Sale"
  ALTER COLUMN "invoiceNumber" SET DEFAULT nextval('"Sale_invoiceNumber_seq"'),
  ALTER COLUMN "invoiceNumber" SET NOT NULL;

ALTER SEQUENCE "Sale_invoiceNumber_seq" OWNED BY "Sale"."invoiceNumber";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
