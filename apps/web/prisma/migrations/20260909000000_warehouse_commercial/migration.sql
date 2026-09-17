-- Phase 5 (الصقل التجاري) من نظام المذاخر B2B — Warehouse Commercial Refinements.
--
-- حالة قاعدة البيانات الحقيقية وقت كتابة هذه الهجرة (مقاسة عبر
-- `npx prisma migrate status` قبل إضافة هذا الملف، لا منسوخة من ملف سابق):
--   23 هجرة موجودة في prisma/migrations، منها 4 لم تُطبَّق بعد على قاعدة
--   الإنتاج الحية (neondb / ep-dry-paper-alh00a4i-pooler):
--     20260905000000_drop_warehouse_order_item_total_price
--     20260906000000_warehouse_stock
--     20260907000000_warehouse_accounts
--     20260908000000_warehouse_roles
--   هذا الملف (20260909000000_warehouse_commercial) هو الهجرة الخامسة غير
--   المُطبَّقة — يصبح المجموع 24 هجرة موجودة / 5 غير مُطبَّقة بعد إضافته.
--   لم يُشغَّل `prisma migrate dev/deploy/reset/db push` هنا إطلاقاً (محظور
--   صراحة على هذا الفرع) — تطبيق كل الهجرات المعلَّقة الخمس معاً مسؤولية
--   إنسان لاحقاً عبر `prisma migrate deploy`.
--
-- المحتوى: إضافات فقط، بلا أي حذف أو تعديل على جدول موجود —
--   - WarehouseCatalogPrice: سعر شريحة تسعير لكل صنف كتالوج (Part 2).
--   - WarehouseReturn / WarehouseReturnItem: طلبات إرجاع/إشعارات دائن من
--     الصيدلية على طلب مذخر مُسلَّم (Part 4).
-- تم توليد الـ DDL أدناه عبر:
--   npx prisma migrate diff --from-schema-datamodel <schema.prisma قبل التعديل> \
--     --to-schema-datamodel prisma/schema.prisma --script
-- ثم لصقه هنا بلا تعديل يدوي.

-- CreateTable
CREATE TABLE "WarehouseCatalogPrice" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseCatalogPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseReturn" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WarehouseReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseCatalogPrice_catalogItemId_idx" ON "WarehouseCatalogPrice"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseCatalogPrice_catalogItemId_tier_key" ON "WarehouseCatalogPrice"("catalogItemId", "tier");

-- CreateIndex
CREATE INDEX "WarehouseReturn_warehouseId_status_idx" ON "WarehouseReturn"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "WarehouseReturn_orderId_idx" ON "WarehouseReturn"("orderId");

-- CreateIndex
CREATE INDEX "WarehouseReturnItem_returnId_idx" ON "WarehouseReturnItem"("returnId");

-- AddForeignKey
ALTER TABLE "WarehouseCatalogPrice" ADD CONSTRAINT "WarehouseCatalogPrice_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "WarehouseCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseReturnItem" ADD CONSTRAINT "WarehouseReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "WarehouseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
