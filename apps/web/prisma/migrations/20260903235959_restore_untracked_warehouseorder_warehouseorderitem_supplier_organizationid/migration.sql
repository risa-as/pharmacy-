-- Recreates the pre-state that "20260904000000_warehouse_b2b_schema" expects: these tables or columns were created
-- with `prisma db push` and never had a migration. Shapes come from the earliest
-- schema.prisma version containing each table (WarehouseOrder@b6fc4f9fd0, WarehouseOrderItem@b6fc4f9fd0, Supplier.organizationId@a6676aaed2),
-- minus what later migrations add themselves. Applied only on databases built from
-- this migration chain; existing databases already have them (see
-- scripts/baseline-existing-db.mjs).

CREATE TYPE "WarehouseOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "WarehouseOrder" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "status" "WarehouseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "expectedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarehouseOrder_orderNumber_key" ON "WarehouseOrder"("orderNumber");

ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WarehouseOrderItem" (
    "id" TEXT NOT NULL,
    "warehouseOrderId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "WarehouseOrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WarehouseOrderItem" ADD CONSTRAINT "WarehouseOrderItem_warehouseOrderId_fkey" FOREIGN KEY ("warehouseOrderId") REFERENCES "WarehouseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WarehouseOrderItem" ADD CONSTRAINT "WarehouseOrderItem_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "GlobalDrug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD COLUMN "organizationId" TEXT;
