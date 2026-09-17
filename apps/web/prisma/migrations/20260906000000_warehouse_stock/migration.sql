-- ============================================================================
-- STATUS: NOT YET APPLIED. Verified 2026-09-05 via `npx prisma migrate
-- status`: 20 migrations found, 19 applied, and exactly ONE pending —
-- 20260905000000_drop_warehouse_order_item_total_price. There is no other
-- backlog: the earlier 6-migration warning that appears in older migration
-- headers in this repo is stale and does not describe the current database.
--
-- ORDER OF APPLICATION — a human must run, in this order:
--   1. 20260905000000_drop_warehouse_order_item_total_price  (already pending, unrelated to this change)
--   2. This migration (20260906000000_warehouse_stock)
-- via:
--     npx prisma migrate deploy
--
-- Hand-written rather than generated via `prisma migrate dev`, because that
-- command must never be run against this repo's .env DATABASE_URL — it points
-- at the LIVE production database (6 customer organizations, 11 users, 10,217
-- sales, 7,601 batches).
--
-- SCOPE (Phase 1 / Pass A of the warehouse stock-tracking feature):
--   WarehouseCatalogItem is the مذخر's equivalent of the pharmacy's
--   Inventory model; it gains the same minStock/costPrice fields Inventory
--   already has. WarehouseBatch mirrors Batch (same field names) so both
--   systems read alike. WarehouseStockMove is a new audit trail the pharmacy
--   side has no equivalent of — needed here for stocktakes and dispute
--   resolution between مذاخر and pharmacies.
--
--   No data migration needed: every new column on WarehouseCatalogItem has a
--   default (minStock 0, costPrice 0), and the two new tables start empty.
--   isAvailable is untouched — it keeps its existing meaning as the
--   merchant's listing toggle; true sellable availability is computed on
--   read (see app/lib/warehouse-stock.ts: deriveAvailability), not stored.
--
-- SAFETY
--   SELECT COUNT(*) FROM "WarehouseCatalogItem";  ->  0 rows
--   (verified 2026-09-05 by read-only psql against the live database).
--   The table is currently empty, so the two new columns add nothing to
--   backfill; even with existing rows this would be lossless, since both
--   columns carry a DEFAULT (minStock 0, costPrice 0). WarehouseBatch and
--   WarehouseStockMove are brand-new tables — nothing to migrate into them.
-- ============================================================================

-- 1) WarehouseCatalogItem: mirror Inventory.minStock / Inventory.cost.
ALTER TABLE "WarehouseCatalogItem" ADD COLUMN "minStock" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WarehouseCatalogItem" ADD COLUMN "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 2) Stock-move direction enum.
CREATE TYPE "WarehouseStockMoveType" AS ENUM ('RECEIPT', 'SHIPMENT', 'ADJUSTMENT', 'DAMAGE', 'RETURN');

-- 3) WarehouseBatch — mirrors Batch (id, batchNumber, expiryDate, quantity,
--    initialQuantity, costPrice); supplierId (Batch, FK) becomes supplierName
--    (free text) because the مذخر has no Supplier table for its own vendors.
CREATE TABLE "WarehouseBatch" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "initialQuantity" INTEGER NOT NULL DEFAULT 0,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WarehouseBatch_catalogItemId_idx" ON "WarehouseBatch"("catalogItemId");
CREATE INDEX "WarehouseBatch_catalogItemId_expiryDate_idx" ON "WarehouseBatch"("catalogItemId", "expiryDate");
CREATE INDEX "WarehouseBatch_expiryDate_quantity_idx" ON "WarehouseBatch"("expiryDate", "quantity");
ALTER TABLE "WarehouseBatch" ADD CONSTRAINT "WarehouseBatch_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "WarehouseCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) WarehouseStockMove — audit trail. catalogItemId is a real FK (cascades
--    with its catalog item); batchId is a real FK but ON DELETE SET NULL, so
--    the audit row survives even if its batch is later removed (mirrors
--    Batch.supplierId's SET NULL pattern). orderId is a PLAIN column with NO
--    foreign key / relation to WarehouseOrder, deliberately — this keeps the
--    stock-tracking module decoupled from the order/negotiation module (a
--    SHIPMENT move records which order caused it without requiring this
--    table to depend on WarehouseOrder's schema or lifecycle).
CREATE TABLE "WarehouseStockMove" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "WarehouseStockMoveType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "actorName" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseStockMove_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WarehouseStockMove_catalogItemId_createdAt_idx" ON "WarehouseStockMove"("catalogItemId", "createdAt");
ALTER TABLE "WarehouseStockMove" ADD CONSTRAINT "WarehouseStockMove_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "WarehouseCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseStockMove" ADD CONSTRAINT "WarehouseStockMove_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WarehouseBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
