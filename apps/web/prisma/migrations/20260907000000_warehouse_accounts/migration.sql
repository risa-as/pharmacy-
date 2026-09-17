-- ============================================================================
-- STATUS: NOT YET APPLIED. Verified 2026-09-05 via `npx prisma migrate
-- status`: 21 migrations found, 19 applied, and exactly TWO pending —
-- 20260905000000_drop_warehouse_order_item_total_price and
-- 20260906000000_warehouse_stock. This migration (20260907000000) is a THIRD,
-- NEW pending migration on top of those two, making three pending in total
-- once this file lands. There is no other backlog: the "6 pending
-- migrations" warning that appears in some older migration headers in this
-- repo is stale and does not describe the current database.
--
-- ORDER OF APPLICATION — a human must run, in this exact order:
--   1. 20260905000000_drop_warehouse_order_item_total_price  (already pending, unrelated to this change)
--   2. 20260906000000_warehouse_stock                        (already pending, unrelated to this change)
--   3. This migration (20260907000000_warehouse_accounts)
-- via:
--     npx prisma migrate deploy
--
-- Hand-written rather than generated via `prisma migrate dev`, because that
-- command must never be run against this repo's .env DATABASE_URL — it points
-- at the LIVE production database (6 customer organizations, 11 users, 10,217
-- sales, 7,601 batches). The SQL below was produced offline (no DB
-- connection, no writes) via:
--     npx prisma migrate diff --from-schema-datamodel <schema without this
--       phase's 3 models/1 enum> --to-schema-datamodel prisma/schema.prisma
--       --script
-- against two temporary copies of schema.prisma, then this header was added
-- by hand. The generated table/column/constraint/index SQL itself is
-- untouched machine output — it is not the free-hand hand-written SQL that
-- normally needs the extra scrutiny that note implies.
--
-- SCOPE (Phase 2 of the Muthakhar/Warehouse B2B feature — الحسابات والعملاء):
--   The مذخر (warehouse) side of the platform had NO financial model at all.
--   Debts were tracked only in SupplierPayment, which belongs to the
--   PHARMACY (supplierId -> Supplier -> Organization) — so a pharmacy knows
--   what it owes a مذخر, while the مذخر has no model of who owes it money or
--   how much. This migration adds three new tables purely on the مذخر side,
--   with NO changes to SupplierPayment/Supplier/Purchase and no data
--   migration (all three tables start empty; every new/changed column on an
--   existing table would need a migration too, but there are none here — only
--   new relations on already-nullable/optional-side FK columns of existing
--   tables are implied via Prisma relations, which need no DB migration
--   since the FK columns living on the new tables are what changes):
--
--   - WarehouseCustomer: the مذخر's commercial terms with one pharmacy
--     (Organization) — credit limit (0 = no limit), payment term in days
--     (0 = cash/no term), price tier, blocked flag. One row per
--     (warehouseId, organizationId), auto-created on that pair's first
--     approved order (see app/api/warehouses/orders/[id]/route.ts) the same
--     way the Stage-5 mirror Supplier is auto-created.
--
--   - WarehouseInvoice: issued automatically inside that same approval
--     transaction. total is taken verbatim from the same effectiveLine()-
--     derived plan.total already used to build the draft Purchase — never
--     recomputed by a second rule — so the two sides of the trade can never
--     financially diverge again (the exact failure mode effectiveLine() in
--     app/lib/warehouse-quote.ts was written to prevent between the quote
--     total and the draft-purchase total). orderId is UNIQUE: one invoice
--     per order, and a concurrent double-approval of the same order can only
--     ever create one WarehouseInvoice row (the loser's whole transaction
--     rolls back on the unique-constraint violation).
--
--   - WarehousePayment: money received against a WarehouseInvoice.
--     paidAmount/status on WarehouseInvoice are updated by a
--     conditional/compare-and-swap UPDATE (WHERE including the paidAmount
--     value as read) in the same transaction as this INSERT, in
--     app/api/warehouse-portal/invoices/[id]/payments/route.ts — the same
--     concurrency discipline already used by
--     app/api/warehouse-portal/stock/adjust/route.ts.
--
--   New enum WarehouseInvoiceStatus { UNPAID, PARTIAL, PAID, CANCELLED }.
--
--   All pure status/aging/credit-limit/payment-application logic lives in
--   app/lib/warehouse-accounts.ts (no Prisma import, unit-tested in
--   app/lib/__tests__/warehouse-accounts.test.ts) — this migration only adds
--   the storage those pure functions' callers read and write.
-- ============================================================================

-- CreateEnum
CREATE TYPE "WarehouseInvoiceStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "WarehouseCustomer" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 0,
    "priceTier" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseInvoice" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "WarehouseInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehousePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehousePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseCustomer_warehouseId_idx" ON "WarehouseCustomer"("warehouseId");

-- CreateIndex
CREATE INDEX "WarehouseCustomer_organizationId_idx" ON "WarehouseCustomer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseCustomer_warehouseId_organizationId_key" ON "WarehouseCustomer"("warehouseId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseInvoice_orderId_key" ON "WarehouseInvoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseInvoice_invoiceNumber_key" ON "WarehouseInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "WarehouseInvoice_warehouseId_status_idx" ON "WarehouseInvoice"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "WarehouseInvoice_organizationId_idx" ON "WarehouseInvoice"("organizationId");

-- CreateIndex
CREATE INDEX "WarehouseInvoice_dueAt_idx" ON "WarehouseInvoice"("dueAt");

-- CreateIndex
CREATE INDEX "WarehousePayment_invoiceId_idx" ON "WarehousePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "WarehousePayment_warehouseId_receivedAt_idx" ON "WarehousePayment"("warehouseId", "receivedAt");

-- AddForeignKey
ALTER TABLE "WarehouseCustomer" ADD CONSTRAINT "WarehouseCustomer_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCustomer" ADD CONSTRAINT "WarehouseCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseInvoice" ADD CONSTRAINT "WarehouseInvoice_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseInvoice" ADD CONSTRAINT "WarehouseInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehousePayment" ADD CONSTRAINT "WarehousePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "WarehouseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehousePayment" ADD CONSTRAINT "WarehousePayment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
