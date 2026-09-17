-- مشتريات المذخر وذممه الدائنة (Warehouse Purchases & Payables).
--
-- حالة قاعدة البيانات الحقيقية وقت كتابة هذه الهجرة (مقاسة عبر
-- `npx prisma migrate status` قبل إضافة هذا الملف، لا منسوخة من ملف سابق):
--   25 هجرة موجودة في prisma/migrations، منها هجرة واحدة معلَّقة فعلاً قبل
--   هذا الملف: 20260910000000_warehouse_bonus — "Following migration have
--   not yet been applied: 20260910000000_warehouse_bonus". لم تُطبَّق أي من
--   الاثنتين على قاعدة الإنتاج الحية (neondb / ep-dry-paper-alh00a4i-pooler)
--   بعد.
--   هذا الملف (20260911000000_warehouse_purchases) هو الهجرة السادسة
--   والعشرون المُضافة، فتصبح الحالة بعده: 26 هجرة موجودة / هجرتان معلَّقتان
--   (20260910000000_warehouse_bonus ثم هذا الملف، بهذا الترتيب). لم يُشغَّل
--   `prisma migrate dev/deploy/reset/db push` هنا إطلاقاً (محظور صراحة على
--   هذا الفرع) — تطبيق الهجرتين معاً مسؤولية إنسان لاحقاً عبر
--   `prisma migrate deploy`.
--
-- المحتوى: إضافات فقط، بلا أي حذف أو تعديل على جدول موجود —
--   - WarehouseBatch.purchaseItemId: عمود تتبّعي خام (String? بلا FK) يربط
--     دفعة بسطر فاتورة الشراء التي أنشأتها، حين وُجدت. بلا قيد مفتاح أجنبي
--     عمداً (نفس انضباط WarehouseStockMove.orderId الموجود سلفاً) — تتبّع
--     بحت لا قيد بنيوي على جدول إنتاجي حي.
--   - WarehouseSupplier: الشركة الدوائية التي يشتري منها المذخر (كانت حتى
--     الآن نصاً حراً فقط على WarehouseBatch.supplierName، بلا كيان خلفه).
--   - WarehousePurchase: فاتورة شراء واردة من مورّد. total محسوب من بنودها،
--     status يعيد استخدام WarehouseInvoiceStatus الموجود سلفاً (بلا تعداد
--     مواز).
--   - WarehousePurchaseItem: بنود فاتورة الشراء (بونص/كمية مدفوعة/كلفة وحدة).
--   - WarehouseSupplierPayment: دفعة سداد صادرة من المذخر لمورّد — الاتجاه
--     المعاكس تماماً لـ WarehousePayment الموجود سلفاً.
-- تم توليد الـ DDL أدناه عبر:
--   npx prisma migrate diff --from-schema-datamodel <schema.prisma قبل التعديل> \
--     --to-schema-datamodel prisma/schema.prisma --script
-- ثم لصقه هنا بلا تعديل يدوي.

-- AlterTable
ALTER TABLE "WarehouseBatch" ADD COLUMN     "purchaseItemId" TEXT;

-- CreateTable
CREATE TABLE "WarehouseSupplier" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "contactPerson" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehousePurchase" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "WarehouseInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehousePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehousePurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "bonusQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WarehousePurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseSupplierPayment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseSupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseSupplier_warehouseId_idx" ON "WarehouseSupplier"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSupplier_warehouseId_name_key" ON "WarehouseSupplier"("warehouseId", "name");

-- CreateIndex
CREATE INDEX "WarehousePurchase_warehouseId_status_idx" ON "WarehousePurchase"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "WarehousePurchase_dueAt_idx" ON "WarehousePurchase"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarehousePurchase_warehouseId_supplierId_invoiceNumber_key" ON "WarehousePurchase"("warehouseId", "supplierId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "WarehousePurchaseItem_purchaseId_idx" ON "WarehousePurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "WarehousePurchaseItem_catalogItemId_idx" ON "WarehousePurchaseItem"("catalogItemId");

-- CreateIndex
CREATE INDEX "WarehouseSupplierPayment_purchaseId_idx" ON "WarehouseSupplierPayment"("purchaseId");

-- CreateIndex
CREATE INDEX "WarehouseSupplierPayment_warehouseId_paidAt_idx" ON "WarehouseSupplierPayment"("warehouseId", "paidAt");

-- AddForeignKey
ALTER TABLE "WarehouseSupplier" ADD CONSTRAINT "WarehouseSupplier_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehousePurchase" ADD CONSTRAINT "WarehousePurchase_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehousePurchase" ADD CONSTRAINT "WarehousePurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "WarehouseSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehousePurchaseItem" ADD CONSTRAINT "WarehousePurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "WarehousePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehousePurchaseItem" ADD CONSTRAINT "WarehousePurchaseItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "WarehouseCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseSupplierPayment" ADD CONSTRAINT "WarehouseSupplierPayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "WarehousePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseSupplierPayment" ADD CONSTRAINT "WarehouseSupplierPayment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
