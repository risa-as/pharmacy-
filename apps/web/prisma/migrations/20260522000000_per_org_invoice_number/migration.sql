-- Migration: per-org invoice numbering
-- Replaces the single global autoincrement sequence with a per-organization counter table.

-- 1. Drop the global unique index (multiple orgs can now share the same invoice number)
DROP INDEX IF EXISTS "Sale_invoiceNumber_key";

-- 2. Remove the sequence-based default and make the column nullable
ALTER TABLE "Sale" ALTER COLUMN "invoiceNumber" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "invoiceNumber" DROP NOT NULL;

-- 3. Drop the global sequence
DROP SEQUENCE IF EXISTS "Sale_invoiceNumber_seq";

-- 4. Create per-org invoice counter table
CREATE TABLE "InvoiceCounter" (
    "organizationId" TEXT NOT NULL,
    "nextNumber"     INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "InvoiceCounter"
    ADD CONSTRAINT "InvoiceCounter_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Seed each org's counter so new sales continue after the current maximum
--    (avoids collisions between old global-sequence numbers and new per-org numbers)
INSERT INTO "InvoiceCounter" ("organizationId", "nextNumber")
SELECT b."organizationId",
       COALESCE(MAX(s."invoiceNumber"), 0) + 1
FROM   "Branch" b
LEFT   JOIN "Sale" s ON s."branchId" = b.id
GROUP  BY b."organizationId"
ON CONFLICT ("organizationId") DO NOTHING;
