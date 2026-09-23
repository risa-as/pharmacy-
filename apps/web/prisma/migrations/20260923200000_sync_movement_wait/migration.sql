BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive (N02-R2): server-recorded first sight of a cash movement waiting for
-- its sale or return, so the review deadline never depends on the device clock.
CREATE TABLE "SyncMovementWait" (
    "transactionId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncMovementWait_pkey" PRIMARY KEY ("transactionId")
);
CREATE INDEX "SyncMovementWait_branchId_idx" ON "SyncMovementWait"("branchId");
COMMIT;
