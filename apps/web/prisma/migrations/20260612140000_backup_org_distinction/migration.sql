-- Make uploaded backups distinguishable per organisation (in addition to the
-- existing branchId), and index both for scoped listing.
ALTER TABLE "Backup" ADD COLUMN "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "Backup_branchId_idx" ON "Backup"("branchId");
CREATE INDEX IF NOT EXISTS "Backup_organizationId_idx" ON "Backup"("organizationId");
