-- AlterTable: add prescriptionScanDailyLimit to Organization
ALTER TABLE "Organization" ADD COLUMN "prescriptionScanDailyLimit" INTEGER NOT NULL DEFAULT 20;

-- CreateTable: PrescriptionScanLog
CREATE TABLE "PrescriptionScanLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrescriptionScanLog_branchId_createdAt_idx" ON "PrescriptionScanLog"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "PrescriptionScanLog" ADD CONSTRAINT "PrescriptionScanLog_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
