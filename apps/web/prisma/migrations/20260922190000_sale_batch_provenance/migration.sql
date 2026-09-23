BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "SaleItem" ADD COLUMN "batchAllocations" TEXT;
ALTER TABLE "SaleReturnItem" ADD COLUMN "batchAllocations" TEXT,
ADD COLUMN "stockStatus" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN "stockReviewNote" TEXT,
ADD COLUMN "stockReviewedBy" TEXT,
ADD COLUMN "stockReviewedAt" TIMESTAMP(3);

COMMIT;
