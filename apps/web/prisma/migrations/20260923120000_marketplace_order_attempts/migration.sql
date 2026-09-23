BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive: durable outcome of each marketplace purchase attempt (idempotency key).
CREATE TABLE "MarketplaceOrderAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "orderId" TEXT,
    "httpStatus" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceOrderAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceOrderAttempt_key_key" ON "MarketplaceOrderAttempt"("key");
CREATE UNIQUE INDEX "MarketplaceOrderAttempt_orderId_key" ON "MarketplaceOrderAttempt"("orderId");
CREATE INDEX "MarketplaceOrderAttempt_userId_idx" ON "MarketplaceOrderAttempt"("userId");
COMMIT;
