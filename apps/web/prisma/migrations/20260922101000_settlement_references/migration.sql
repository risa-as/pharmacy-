BEGIN;
CREATE OR REPLACE FUNCTION next_document_reference(prefix text) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE n bigint;
BEGIN
  IF prefix NOT IN ('STK','TRF','PUR','INV','RTN','SHF','COL','PIN','WIN','FSL','VCH') THEN
    RAISE EXCEPTION 'Unknown document reference prefix';
  END IF;
  n := nextval(format('%I', lower(prefix) || '_document_seq')::regclass);
  RETURN prefix || '-' || lpad(n::text, greatest(4, length(n::text)), '0');
END;
$$;
CREATE SEQUENCE vch_document_seq;
LOCK TABLE "WarehouseSettlement" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "WarehouseSettlement" ADD COLUMN "documentNumber" text;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY "createdAt",id) AS n FROM "WarehouseSettlement")
UPDATE "WarehouseSettlement" d SET "documentNumber" = 'VCH-' || lpad(n::text,greatest(4,length(n::text)),'0') FROM numbered WHERE d.id=numbered.id;
SELECT setval('vch_document_seq', greatest((SELECT count(*) FROM "WarehouseSettlement"),1), (SELECT count(*)>0 FROM "WarehouseSettlement"));
ALTER TABLE "WarehouseSettlement" ALTER COLUMN "documentNumber" SET DEFAULT next_document_reference('VCH'), ALTER COLUMN "documentNumber" SET NOT NULL;
CREATE UNIQUE INDEX "WarehouseSettlement_documentNumber_key" ON "WarehouseSettlement"("documentNumber");
COMMIT;
