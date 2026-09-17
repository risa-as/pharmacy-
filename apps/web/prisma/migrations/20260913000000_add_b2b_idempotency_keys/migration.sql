ALTER TABLE "WarehouseOrder" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "WarehouseOrder_idempotencyKey_key" ON "WarehouseOrder"("idempotencyKey");

ALTER TABLE "WarehousePayment" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "WarehousePayment_idempotencyKey_key" ON "WarehousePayment"("idempotencyKey");
