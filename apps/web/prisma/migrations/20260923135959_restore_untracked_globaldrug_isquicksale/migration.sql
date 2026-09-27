-- Recreates the pre-state that "20260923140000_inventory_quick_sale" expects: these tables or columns were created
-- with `prisma db push` and never had a migration. Shapes come from the earliest
-- schema.prisma version containing each table (GlobalDrug.isQuickSale@1e743f87d4),
-- minus what later migrations add themselves. Applied only on databases built from
-- this migration chain; existing databases already have them (see
-- scripts/baseline-existing-db.mjs).

ALTER TABLE "GlobalDrug" ADD COLUMN "isQuickSale" BOOLEAN NOT NULL DEFAULT false;
