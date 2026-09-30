BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- OPEN-14 completion: transfer days in the saved purchasing settings (default
-- 1, the previous fixed value) and a closing time for purchase drafts.
-- Additive only. 20260930140000 is pinned and is not edited.

-- AlterTable
ALTER TABLE "PurchaseDraft" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PurchasePlanningSettings" ADD COLUMN     "transferDays" INTEGER NOT NULL DEFAULT 1;


COMMIT;
