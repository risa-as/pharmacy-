BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Additive (N20): insurance companies and discounts get an owning organisation.
-- Existing rows keep NULL (ownership unknown, never guessed): they stay readable
-- by every organisation as before and only SUPER_ADMIN may change them.
ALTER TABLE "InsuranceCompany" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Discount" ADD COLUMN "organizationId" TEXT;
CREATE INDEX "InsuranceCompany_organizationId_idx" ON "InsuranceCompany"("organizationId");
CREATE INDEX "Discount_organizationId_idx" ON "Discount"("organizationId");
COMMIT;
