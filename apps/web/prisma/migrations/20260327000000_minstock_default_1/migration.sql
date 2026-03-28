-- Change default value of minStock from 0 to 1
ALTER TABLE "Inventory" ALTER COLUMN "minStock" SET DEFAULT 1;

-- Update existing records where minStock = 0 to 1
UPDATE "Inventory" SET "minStock" = 1 WHERE "minStock" = 0;
