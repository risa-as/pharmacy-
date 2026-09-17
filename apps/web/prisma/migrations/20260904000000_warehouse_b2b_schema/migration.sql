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
--   2. Apply stage-1 migration (20260903000000_add_warehouse_role_and_user_link)
--      before this one.
--   3. Then run `prisma migrate deploy`.
--
-- Scope (Stage 2 of the Muthakhar/Warehouse B2B feature):
--   - WarehouseOrderStatus enum rebuilt as a full negotiation state machine
--   - WarehouseOrderItemStatus enum + per-item negotiation columns
--   - WarehouseCatalogItem table (barcode-keyed cross-tenant catalog)
--   - WarehouseOrderEvent table (order timeline)
--   - Supplier.warehouseId mirror-supplier link (report §4.1-ب)
-- ============================================================================

-- 1) WarehouseOrderStatus: Postgres cannot remove enum values, so the type is
--    rebuilt. Data semantics of the conversion:
--      PENDING   -> SENT          (old orders were effectively sent to the warehouse)
--      CONFIRMED -> UNDER_REVIEW  (no quotation evidence exists for old orders)
--      SHIPPED / DELIVERED / CANCELLED keep their meaning.
ALTER TABLE "WarehouseOrder" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "WarehouseOrderStatus_new" AS ENUM ('DRAFT', 'SENT', 'UNDER_REVIEW', 'QUOTED', 'APPROVED', 'REJECTED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
ALTER TABLE "WarehouseOrder" ALTER COLUMN "status" TYPE "WarehouseOrderStatus_new" USING (CASE "status"::text WHEN 'PENDING' THEN 'SENT' WHEN 'CONFIRMED' THEN 'UNDER_REVIEW' ELSE "status"::text END)::"WarehouseOrderStatus_new";
ALTER TABLE "WarehouseOrder" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "WarehouseOrderStatus";
ALTER TYPE "WarehouseOrderStatus_new" RENAME TO "WarehouseOrderStatus";

-- 2) Per-item negotiation state
CREATE TYPE "WarehouseOrderItemStatus" AS ENUM ('REQUESTED', 'AVAILABLE', 'PARTIAL', 'OUT_OF_STOCK');
ALTER TABLE "WarehouseOrderItem" ADD COLUMN "requestedPrice" DOUBLE PRECISION;
ALTER TABLE "WarehouseOrderItem" ADD COLUMN "quotedPrice" DOUBLE PRECISION;
ALTER TABLE "WarehouseOrderItem" ADD COLUMN "quotedQuantity" INTEGER;
ALTER TABLE "WarehouseOrderItem" ADD COLUMN "status" "WarehouseOrderItemStatus" NOT NULL DEFAULT 'REQUESTED';
ALTER TABLE "WarehouseOrderItem" ADD COLUMN "note" TEXT;

-- 3) WarehouseCatalogItem — warehouse drug catalog.
--    The duplicated `barcode` column is the cross-tenant matching key
--    (report §4.1-أ, option أ-1); `drugId` references the global GlobalDrug row
--    only (organizationId: NULL rows) — enforced by application logic
--    (resolveToGlobalDrug). `lastPriceUpdate` has no DB default; Prisma Client
--    sets it via @updatedAt on every write.
CREATE TABLE "WarehouseCatalogItem" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "lastPriceUpdate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseCatalogItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WarehouseCatalogItem_warehouseId_barcode_key" ON "WarehouseCatalogItem"("warehouseId", "barcode");
CREATE INDEX "WarehouseCatalogItem_barcode_idx" ON "WarehouseCatalogItem"("barcode");
CREATE INDEX "WarehouseCatalogItem_drugId_idx" ON "WarehouseCatalogItem"("drugId");
ALTER TABLE "WarehouseCatalogItem" ADD CONSTRAINT "WarehouseCatalogItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseCatalogItem" ADD CONSTRAINT "WarehouseCatalogItem_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "GlobalDrug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) WarehouseOrderEvent — order timeline (basis of the pharmacy tracking page)
CREATE TABLE "WarehouseOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseOrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WarehouseOrderEvent_orderId_createdAt_idx" ON "WarehouseOrderEvent"("orderId", "createdAt");
ALTER TABLE "WarehouseOrderEvent" ADD CONSTRAINT "WarehouseOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WarehouseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Supplier mirror link — one mirror supplier per (organization, warehouse).
--    In Postgres a UNIQUE index does not constrain rows where any column is
--    NULL, so hand-created manual suppliers are unaffected. The mirror row is
--    created automatically inside the approve-order transaction (Stage 5).
ALTER TABLE "Supplier" ADD COLUMN "warehouseId" TEXT;
CREATE UNIQUE INDEX "Supplier_organizationId_warehouseId_key" ON "Supplier"("organizationId", "warehouseId");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
