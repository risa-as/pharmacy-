BEGIN;
-- Do not renumber historical documents. A conflicting history must be reviewed.
LOCK TABLE "Branch" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "Sale" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId"
    WHERE s."invoiceNumber" IS NOT NULL
    GROUP BY b."organizationId", s."invoiceNumber" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate invoice numbers within an organization; review before migration';
  END IF;
END $$;

ALTER TABLE "Sale" ADD COLUMN "invoiceOrganizationId" TEXT NOT NULL DEFAULT '';
UPDATE "Sale" s SET "invoiceOrganizationId" = b."organizationId"
FROM "Branch" b WHERE b.id = s."branchId";

CREATE FUNCTION enforce_sale_invoice_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT b."organizationId" INTO STRICT NEW."invoiceOrganizationId"
    FROM "Branch" b WHERE b.id = NEW."branchId" FOR SHARE;
  RETURN NEW;
END $$;
CREATE TRIGGER sale_invoice_scope BEFORE INSERT OR UPDATE OF "branchId", "invoiceNumber", "invoiceOrganizationId"
  ON "Sale" FOR EACH ROW EXECUTE FUNCTION enforce_sale_invoice_scope();
CREATE UNIQUE INDEX "Sale_invoiceOrganizationId_invoiceNumber_key"
  ON "Sale" ("invoiceOrganizationId", "invoiceNumber");

-- Keep the derived scope consistent even during an administrative branch move.
-- A collision aborts the entire move instead of corrupting invoice identity.
CREATE FUNCTION refresh_branch_invoice_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."organizationId" IS DISTINCT FROM NEW."organizationId" THEN
    UPDATE "Sale" SET "invoiceOrganizationId" = NEW."organizationId" WHERE "branchId" = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER branch_invoice_scope AFTER UPDATE OF "organizationId" ON "Branch"
  FOR EACH ROW EXECUTE FUNCTION refresh_branch_invoice_scope();

ALTER TABLE "DeviceSigningKey" DROP CONSTRAINT "DeviceSigningKey_licenseId_fkey";
ALTER TABLE "DeviceSigningKey" ADD CONSTRAINT "DeviceSigningKey_licenseId_fkey"
  FOREIGN KEY ("licenseId") REFERENCES "DeviceLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceSigningNonce" DROP CONSTRAINT "DeviceSigningNonce_keyId_fkey";
ALTER TABLE "DeviceSigningNonce" ADD CONSTRAINT "DeviceSigningNonce_keyId_fkey"
  FOREIGN KEY ("keyId") REFERENCES "DeviceSigningKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
