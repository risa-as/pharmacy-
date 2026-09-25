-- Additive: a new table only. Records numbers handed out by
-- /api/sales/allocate-number so /api/sync/sales can tell a number reserved for
-- the sending device from one it merely claims. Numbers reserved before this
-- table existed are not recorded; such pending sales get a fresh number.
CREATE TABLE "InvoiceNumberReservation" (
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "licenseId" TEXT,
    "userId" TEXT,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceNumberReservation_pkey" PRIMARY KEY ("organizationId", "number")
);

CREATE UNIQUE INDEX "InvoiceNumberReservation_saleId_key" ON "InvoiceNumberReservation"("saleId");
