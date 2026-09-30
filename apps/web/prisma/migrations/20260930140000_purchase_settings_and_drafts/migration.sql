BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- OPEN-14: saved smart purchasing settings (organization default + branch
-- override) and purchase draft measurement (draft -> warehouse orders).
-- Additive only: new tables and one nullable column; no data changes.

-- AlterTable
ALTER TABLE "WarehouseOrder" ADD COLUMN     "purchaseDraftId" TEXT;

-- CreateTable
CREATE TABLE "PurchasePlanningSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "coverageDays" INTEGER NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "safetyDays" INTEGER NOT NULL,
    "fromArrival" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchasePlanningSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "settingsSource" TEXT NOT NULL,
    "coverageDays" INTEGER NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "safetyDays" INTEGER NOT NULL,
    "fromArrival" BOOLEAN NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseDraftLine" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "barcode" TEXT,
    "suggestedUnits" INTEGER NOT NULL,
    "draftUnits" INTEGER NOT NULL,
    "unitsPerPack" INTEGER NOT NULL,
    "draftPacks" INTEGER NOT NULL,

    CONSTRAINT "PurchaseDraftLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchasePlanningSettings_organizationId_scopeKey_key" ON "PurchasePlanningSettings"("organizationId", "scopeKey");

-- CreateIndex
CREATE INDEX "PurchaseDraft_organizationId_createdAt_idx" ON "PurchaseDraft"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseDraft_branchId_createdAt_idx" ON "PurchaseDraft"("branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseDraftLine_draftId_drugId_key" ON "PurchaseDraftLine"("draftId", "drugId");

-- CreateIndex
CREATE INDEX "WarehouseOrder_purchaseDraftId_idx" ON "WarehouseOrder"("purchaseDraftId");

-- AddForeignKey
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_purchaseDraftId_fkey" FOREIGN KEY ("purchaseDraftId") REFERENCES "PurchaseDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePlanningSettings" ADD CONSTRAINT "PurchasePlanningSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePlanningSettings" ADD CONSTRAINT "PurchasePlanningSettings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDraft" ADD CONSTRAINT "PurchaseDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDraft" ADD CONSTRAINT "PurchaseDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDraftLine" ADD CONSTRAINT "PurchaseDraftLine_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PurchaseDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
