BEGIN;
-- Preserve existing warehouses; new warehouses start as an order portal.
ALTER TABLE "Warehouse" ADD COLUMN "operatingMode" TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE "Warehouse" ALTER COLUMN "operatingMode" SET DEFAULT 'ORDER_PORTAL';
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_operatingMode_check" CHECK ("operatingMode" IN ('FULL', 'ORDER_PORTAL'));
ALTER TABLE "WarehouseOrder" ADD COLUMN "shipmentMode" TEXT;
ALTER TABLE "WarehouseOrder" ADD COLUMN "externalShipment" JSONB;
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_shipmentMode_check" CHECK ("shipmentMode" IS NULL OR "shipmentMode" IN ('FULL', 'ORDER_PORTAL'));
COMMIT;
