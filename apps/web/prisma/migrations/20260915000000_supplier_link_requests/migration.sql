-- طلبات ربط الموردين بالمذاخر: المؤسسة تطلب، ومدير المنصة يعتمد أو يرفض.
-- تعديل إضافي بالكامل: جدول جديد فقط، لا عمود يُضاف لجدول قائم ولا تعبئة رجعية،
-- فلا يتغيّر أي استعلام قائم ولا قيد Supplier(organizationId, warehouseId).

CREATE TABLE "SupplierLinkRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pendingKey" TEXT,
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierLinkRequest_pkey" PRIMARY KEY ("id")
);

-- pendingKey = supplierId طالما الطلب معلّق ثم NULL. Postgres يعتبر NULL مميزاً،
-- فالقيد يمنع طلبين معلّقين لنفس المورد ويسمح بأي عدد من الطلبات المحسومة.
CREATE UNIQUE INDEX "SupplierLinkRequest_pendingKey_key" ON "SupplierLinkRequest"("pendingKey");

CREATE INDEX "SupplierLinkRequest_status_createdAt_idx" ON "SupplierLinkRequest"("status", "createdAt");
CREATE INDEX "SupplierLinkRequest_organizationId_status_idx" ON "SupplierLinkRequest"("organizationId", "status");
CREATE INDEX "SupplierLinkRequest_warehouseId_idx" ON "SupplierLinkRequest"("warehouseId");
CREATE INDEX "SupplierLinkRequest_supplierId_idx" ON "SupplierLinkRequest"("supplierId");

ALTER TABLE "SupplierLinkRequest" ADD CONSTRAINT "SupplierLinkRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierLinkRequest" ADD CONSTRAINT "SupplierLinkRequest_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierLinkRequest" ADD CONSTRAINT "SupplierLinkRequest_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
