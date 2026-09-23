BEGIN;
ALTER TABLE "WarehouseReturn" ADD COLUMN "creditNoteNumber" TEXT;
CREATE SEQUENCE warehouse_credit_note_seq;
CREATE FUNCTION next_warehouse_credit_note() RETURNS TEXT LANGUAGE SQL VOLATILE AS $$
  SELECT 'WCN-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END
  FROM nextval('warehouse_credit_note_seq') AS n;
$$;
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY COALESCE("acceptedAt", "createdAt"), id) AS n
  FROM "WarehouseReturn" WHERE status = 'ACCEPTED'
)
UPDATE "WarehouseReturn" r SET "creditNoteNumber" = 'WCN-' || CASE WHEN length(n::text) < 4 THEN lpad(n::text, 4, '0') ELSE n::text END
FROM numbered WHERE r.id = numbered.id;
SELECT setval('warehouse_credit_note_seq', GREATEST((SELECT count(*) FROM "WarehouseReturn" WHERE status = 'ACCEPTED'), 1), (SELECT count(*) > 0 FROM "WarehouseReturn" WHERE status = 'ACCEPTED'));
CREATE UNIQUE INDEX "WarehouseReturn_creditNoteNumber_key" ON "WarehouseReturn"("creditNoteNumber");
CREATE FUNCTION assign_warehouse_credit_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."creditNoteNumber" IS NOT NULL THEN
    NEW."creditNoteNumber" := OLD."creditNoteNumber";
  ELSIF NEW.status = 'ACCEPTED' THEN
    NEW."creditNoteNumber" := next_warehouse_credit_note();
  ELSE
    NEW."creditNoteNumber" := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_credit_note_number BEFORE INSERT OR UPDATE ON "WarehouseReturn"
FOR EACH ROW EXECUTE FUNCTION assign_warehouse_credit_note();
COMMIT;
