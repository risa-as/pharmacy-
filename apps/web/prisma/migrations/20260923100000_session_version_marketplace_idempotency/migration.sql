BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive and backward compatible: existing sessions and tokens carry no
-- version and are treated as version 0, which matches the default.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "MarketplaceOrder_idempotencyKey_key" ON "MarketplaceOrder"("idempotencyKey");
COMMIT;
