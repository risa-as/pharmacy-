CREATE TABLE "WarehouseSettlement" (
 "id" TEXT NOT NULL, "warehouseId" TEXT NOT NULL, "organizationId" TEXT,
 "kind" TEXT NOT NULL, "reference" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
 "amount" DOUBLE PRECISION NOT NULL, "direction" TEXT NOT NULL,
 "actorId" TEXT NOT NULL, "details" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WarehouseSettlement_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "WarehouseSettlement_amount_check" CHECK ("amount" >= 0 AND "amount" < 'Infinity'::float8)
);
CREATE UNIQUE INDEX "WarehouseSettlement_warehouseId_kind_reference_key" ON "WarehouseSettlement"("warehouseId", "kind", "reference");
CREATE INDEX "WarehouseSettlement_warehouseId_createdAt_idx" ON "WarehouseSettlement"("warehouseId", "createdAt");
CREATE INDEX "WarehouseSettlement_warehouseId_sourceId_idx" ON "WarehouseSettlement"("warehouseId", "sourceId");
