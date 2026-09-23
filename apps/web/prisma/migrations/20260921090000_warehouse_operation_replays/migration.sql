CREATE TABLE "WarehouseOperation" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarehouseOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WarehouseOperation_warehouseId_key_key" ON "WarehouseOperation"("warehouseId", "key");
