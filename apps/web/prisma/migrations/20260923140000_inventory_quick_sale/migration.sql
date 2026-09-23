BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Additive (N09): the quick-sale flag moves from the drug shared by every
-- organisation to each branch's inventory row. Existing flags are copied to the
-- inventories of the flagged drug, so every branch keeps what it sees today.
-- GlobalDrug."isQuickSale" is left in place for the code already deployed.
ALTER TABLE "Inventory" ADD COLUMN "isQuickSale" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Inventory" i SET "isQuickSale" = true
FROM "GlobalDrug" d
WHERE i."drugId" = d.id AND d."isQuickSale" = true;
COMMIT;
