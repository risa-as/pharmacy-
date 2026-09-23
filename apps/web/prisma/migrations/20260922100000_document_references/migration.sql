BEGIN;
CREATE FUNCTION next_document_reference(prefix text) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE n bigint;
BEGIN
  IF prefix NOT IN ('STK','TRF','PUR','INV','RTN','SHF','COL','PIN','WIN','FSL') THEN
    RAISE EXCEPTION 'Unknown document reference prefix';
  END IF;
  n := nextval(format('%I', lower(prefix) || '_document_seq')::regclass);
  RETURN prefix || '-' || lpad(n::text, greatest(4, length(n::text)), '0');
END;
$$;
CREATE SEQUENCE stk_document_seq;
CREATE SEQUENCE trf_document_seq;
CREATE SEQUENCE pur_document_seq;
CREATE SEQUENCE inv_document_seq;
CREATE SEQUENCE rtn_document_seq;
CREATE SEQUENCE shf_document_seq;
CREATE SEQUENCE col_document_seq;
CREATE SEQUENCE pin_document_seq;
CREATE SEQUENCE win_document_seq;
CREATE SEQUENCE fsl_document_seq;
LOCK TABLE "Stocktake" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "Stocktake" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Stocktake")
UPDATE "Stocktake" d SET "documentNumber" = 'STK-' || lpad(n::text, greatest(4,length(n::text)), '0') FROM numbered WHERE d.id = numbered.id;
SELECT setval('stk_document_seq', greatest((SELECT count(*) FROM "Stocktake"),1), (SELECT count(*) > 0 FROM "Stocktake"));
ALTER TABLE "Stocktake" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('STK'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Stocktake_documentNumber_key" ON "Stocktake"("documentNumber");
LOCK TABLE "Transfer" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "Transfer" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Transfer")
UPDATE "Transfer" d SET "documentNumber" = 'TRF-' || lpad(n::text, greatest(4,length(n::text)), '0') FROM numbered WHERE d.id = numbered.id;
SELECT setval('trf_document_seq', greatest((SELECT count(*) FROM "Transfer"),1), (SELECT count(*) > 0 FROM "Transfer"));
ALTER TABLE "Transfer" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('TRF'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Transfer_documentNumber_key" ON "Transfer"("documentNumber");
LOCK TABLE "Purchase" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "Purchase" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Purchase")
UPDATE "Purchase" d SET "documentNumber" = 'PUR-' || lpad(n::text, greatest(4,length(n::text)), '0') FROM numbered WHERE d.id = numbered.id;
SELECT setval('pur_document_seq', greatest((SELECT count(*) FROM "Purchase"),1), (SELECT count(*) > 0 FROM "Purchase"));
ALTER TABLE "Purchase" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('PUR'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Purchase_documentNumber_key" ON "Purchase"("documentNumber");
LOCK TABLE "Sale" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "Sale" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Sale")
UPDATE "Sale" d SET "documentNumber" = 'INV-' || lpad(n::text, greatest(4,length(n::text)), '0') FROM numbered WHERE d.id = numbered.id;
SELECT setval('inv_document_seq', greatest((SELECT count(*) FROM "Sale"),1), (SELECT count(*) > 0 FROM "Sale"));
ALTER TABLE "Sale" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('INV'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Sale_documentNumber_key" ON "Sale"("documentNumber");
LOCK TABLE "SaleReturn" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "SaleReturn" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "SaleReturn")
UPDATE "SaleReturn" d SET "documentNumber" = 'RTN-' || lpad(n::text, greatest(4,length(n::text)), '0') FROM numbered WHERE d.id = numbered.id;
SELECT setval('rtn_document_seq', greatest((SELECT count(*) FROM "SaleReturn"),1), (SELECT count(*) > 0 FROM "SaleReturn"));
ALTER TABLE "SaleReturn" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('RTN'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "SaleReturn_documentNumber_key" ON "SaleReturn"("documentNumber");
LOCK TABLE "Shift" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "Shift" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Shift")
UPDATE "Shift" d SET "documentNumber" = 'SHF-' || lpad(n::text, greatest(4,length(n::text)), '0') FROM numbered WHERE d.id = numbered.id;
SELECT setval('shf_document_seq', greatest((SELECT count(*) FROM "Shift"),1), (SELECT count(*) > 0 FROM "Shift"));
ALTER TABLE "Shift" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('SHF'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Shift_documentNumber_key" ON "Shift"("documentNumber");
LOCK TABLE "WarehouseRepCollection" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "WarehouseRepCollection" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "WarehouseRepCollection")
UPDATE "WarehouseRepCollection" d SET "documentNumber" = 'COL-' || lpad(n::text, greatest(4,length(n::text)), '0') FROM numbered WHERE d.id = numbered.id;
SELECT setval('col_document_seq', greatest((SELECT count(*) FROM "WarehouseRepCollection"),1), (SELECT count(*) > 0 FROM "WarehouseRepCollection"));
ALTER TABLE "WarehouseRepCollection" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('COL'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "WarehouseRepCollection_documentNumber_key" ON "WarehouseRepCollection"("documentNumber");
COMMIT;
