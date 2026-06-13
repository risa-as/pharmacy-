-- AddColumn isActive to User (soft-disable departed employees without deleting).
-- Default true so every existing user remains active after the migration.
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
