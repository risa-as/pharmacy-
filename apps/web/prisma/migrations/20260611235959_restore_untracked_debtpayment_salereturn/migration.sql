-- Recreates the pre-state that "20260612000000_add_audit_user_attribution" expects: these tables or columns were created
-- with `prisma db push` and never had a migration. Shapes come from the earliest
-- schema.prisma version containing each table (DebtPayment@b6fc4f9fd0, SaleReturn@b6fc4f9fd0),
-- minus what later migrations add themselves. Applied only on databases built from
-- this migration chain; existing databases already have them (see
-- scripts/baseline-existing-db.mjs).
-- note: FK SaleReturn_safeId_fkey -> Safe deferred (target not created yet)

CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SaleReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT,
    "saleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "safeId" TEXT,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaleReturn_returnNumber_key" ON "SaleReturn"("returnNumber");

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
