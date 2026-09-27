-- Recreates the pre-state that "20260225000000_add_suspension_fields" expects: these tables or columns were created
-- with `prisma db push` and never had a migration. Shapes come from the earliest
-- schema.prisma version containing each table (DeviceLicense@b6fc4f9fd0),
-- minus what later migrations add themselves. Applied only on databases built from
-- this migration chain; existing databases already have them (see
-- scripts/baseline-existing-db.mjs).
-- note: DeviceLicense.suspendedByOrgSuspension left to a later migration

CREATE TABLE "DeviceLicense" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "hardwareId" TEXT,
    "deviceName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceLicense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceLicense_licenseKey_key" ON "DeviceLicense"("licenseKey");

CREATE INDEX "DeviceLicense_licenseKey_idx" ON "DeviceLicense"("licenseKey");

CREATE INDEX "DeviceLicense_hardwareId_idx" ON "DeviceLicense"("hardwareId");

CREATE INDEX "DeviceLicense_branchId_idx" ON "DeviceLicense"("branchId");

ALTER TABLE "DeviceLicense" ADD CONSTRAINT "DeviceLicense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
