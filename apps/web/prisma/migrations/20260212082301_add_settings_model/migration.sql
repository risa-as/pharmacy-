-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Pharmacy System',
    "phone" TEXT,
    "address" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "taxNumber" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IQD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "GlobalDrug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "GlobalDrug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
