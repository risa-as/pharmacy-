BEGIN;
ALTER TABLE "Warehouse" ADD COLUMN "salesPhone" TEXT, ADD COLUMN "followupPhone" TEXT, ADD COLUMN "managementPhone" TEXT;
ALTER TABLE "WarehouseOrder" ADD COLUMN "legacyOrderNumber" TEXT;
LOCK TABLE "WarehouseOrder" IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE "warehouse_order_number_seq";
CREATE FUNCTION next_warehouse_order_number() RETURNS TEXT LANGUAGE SQL VOLATILE AS $$
  SELECT 'WAI-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END
  FROM nextval('"warehouse_order_number_seq"') AS n;
$$;
-- Preserve references already used in shipments and historic documents.
UPDATE "WarehouseOrder" SET "legacyOrderNumber" = "orderNumber";
-- Free the unique namespace before assigning chronological references.
UPDATE "WarehouseOrder" SET "orderNumber" = NULL;
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "WarehouseOrder"
)
UPDATE "WarehouseOrder" o SET "orderNumber" = 'WAI-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END
FROM numbered WHERE o.id = numbered.id;
SELECT setval('"warehouse_order_number_seq"', GREATEST((SELECT count(*) FROM "WarehouseOrder"), 1), (SELECT count(*) > 0 FROM "WarehouseOrder"));
ALTER TABLE "WarehouseOrder" ALTER COLUMN "orderNumber" SET DEFAULT next_warehouse_order_number();
COMMIT;
