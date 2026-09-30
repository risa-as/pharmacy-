BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive: atomic daily-limit reservation and per-request measurements for the
-- AI assistant. Existing rows default to status OK and keep counting.
ALTER TABLE "AiUsageLog" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OK',
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "latencyMs" INTEGER,
ADD COLUMN "provider" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "categories" TEXT,
ADD COLUMN "inputChars" INTEGER,
ADD COLUMN "outputChars" INTEGER,
ADD COLUMN "cardCount" INTEGER,
ADD COLUMN "error" TEXT;
COMMIT;
