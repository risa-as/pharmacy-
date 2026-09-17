-- ============================================================================
-- STATUS: NOT YET APPLIED to any database (local, staging, or the live Neon
-- production DB this repo's .env DATABASE_URL points at).
--
-- This migration was hand-written (not generated via `prisma migrate dev`)
-- because the working tree's DATABASE_URL is a LIVE production database that
-- already has 6 unrelated migrations pending from other work. Running
-- `prisma migrate dev` or `prisma migrate deploy` against it from this branch
-- would apply someone else's unreviewed pending migrations alongside this one.
--
-- Before running `prisma migrate deploy`, a human must:
--   1. Review and resolve the 6 pre-existing pending migrations first (in the
--      order they were created), independently of this change.
--   2. Confirm this migration applies cleanly after those (schema.prisma in
--      this branch only adds the Role value, the WarehouseUserType enum, and
--      the two nullable User columns/index/FK below — nothing else from the
--      wider Warehouses/B2B feature, which lands in later stages).
--   3. Then run `prisma migrate deploy`.
-- ============================================================================

-- AlterEnum
-- Postgres cannot run `ALTER TYPE ... ADD VALUE` inside a transaction block
-- on PostgreSQL versions before 12 — and Prisma wraps every migration file in
-- a single transaction. `IF NOT EXISTS` makes this statement idempotent/safe
-- to re-run, but does not by itself bypass that pre-12 restriction. On
-- PostgreSQL 12+ (the Neon target for this project), `ADD VALUE` IS allowed
-- inside a transaction, as long as the new enum value is not *read/used* in
-- that same transaction — this migration only adds the value and never
-- references 'WAREHOUSE' anywhere else below, so it is safe here.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'WAREHOUSE';

-- CreateEnum
CREATE TYPE "WarehouseUserType" AS ENUM ('OWNER', 'STAFF');

-- AlterTable
-- Adds the warehouse-identity link to User. Both columns are nullable: every
-- existing (pharmacy) user is unaffected and keeps warehouseId = NULL.
ALTER TABLE "User" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "User" ADD COLUMN "warehouseUserType" "WarehouseUserType";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_warehouseId_idx" ON "User"("warehouseId");

-- AddForeignKey
-- ON DELETE SET NULL: deleting a Warehouse does not cascade-delete its user
-- accounts; it only detaches them (mirrors the User.branchId -> Branch FK
-- convention used elsewhere in this schema).
ALTER TABLE "User" ADD CONSTRAINT "User_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
