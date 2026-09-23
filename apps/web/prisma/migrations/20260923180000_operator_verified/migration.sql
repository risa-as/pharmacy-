BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive (N16): whether a desktop-synced sale or debt payment proved its
-- operator with a server-issued operator proof. Nullable, no backfill: existing
-- rows stay NULL (unknown), which is what they are.
ALTER TABLE "Sale" ADD COLUMN "operatorVerified" BOOLEAN;
ALTER TABLE "DebtPayment" ADD COLUMN "operatorVerified" BOOLEAN;
COMMIT;
