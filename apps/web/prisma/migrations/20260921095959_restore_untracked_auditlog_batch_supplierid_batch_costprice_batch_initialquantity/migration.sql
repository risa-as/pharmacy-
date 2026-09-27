-- Recreates the pre-state that "20260921100000_warehouse_return_settlement" expects: these tables or columns were created
-- with `prisma db push` and never had a migration. Shapes come from the earliest
-- schema.prisma version containing each table (AuditLog@b6fc4f9fd0, Batch.supplierId@4caa3adaef, Batch.costPrice@b6fc4f9fd0, Batch.initialQuantity@c22c64ffd3),
-- minus what later migrations add themselves. Applied only on databases built from
-- this migration chain; existing databases already have them (see
-- scripts/baseline-existing-db.mjs).

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "Batch" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "Batch" ADD COLUMN "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Batch" ADD COLUMN "initialQuantity" INTEGER NOT NULL DEFAULT 0;
