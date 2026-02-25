-- AddColumn isSuspended and suspendedAt to Organization
ALTER TABLE "Organization" ADD COLUMN "isSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- AddColumn suspendedByOrgSuspension to DeviceLicense
ALTER TABLE "DeviceLicense" ADD COLUMN "suspendedByOrgSuspension" BOOLEAN NOT NULL DEFAULT false;
