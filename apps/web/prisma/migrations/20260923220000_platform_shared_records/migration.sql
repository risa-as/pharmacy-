BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive (N20): an explicit "platform record" flag. Unknown ownership is not
-- shared ownership: rows without an organisation stay hidden from organisations
-- unless SUPER_ADMIN marks them shared or assigns them to their organisation.
ALTER TABLE "InsuranceCompany" ADD COLUMN "isPlatformShared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Discount" ADD COLUMN "isPlatformShared" BOOLEAN NOT NULL DEFAULT false;
COMMIT;
