-- المندوبون (Field Sales Reps) — مذاخر B2B.
--
-- حالة قاعدة البيانات الحقيقية وقت كتابة هذه الهجرة (مقاسة عبر
-- `npx prisma migrate status` قبل إضافة هذا الملف، لا منسوخة من ملف سابق):
--   26 هجرة موجودة في prisma/migrations، منها هجرتان معلَّقتان فعلاً قبل هذا
--   الملف — "Following migrations have not yet been applied:
--   20260910000000_warehouse_bonus, 20260911000000_warehouse_purchases". لم
--   تُطبَّق أي منهما على قاعدة الإنتاج الحية (neondb / ep-dry-paper-alh00a4i-pooler)
--   بعد.
--   هذا الملف (20260912000000_warehouse_reps) هو الهجرة السابعة والعشرون
--   المُضافة، فتصبح الحالة بعده: 27 هجرة موجودة / ثلاث هجرات معلَّقة
--   (20260910000000_warehouse_bonus ثم 20260911000000_warehouse_purchases ثم
--   هذا الملف، بهذا الترتيب). لم يُشغَّل `prisma migrate dev/deploy/reset/db
--   push` هنا إطلاقاً (محظور صراحة على هذا الفرع) — تطبيق الهجرات الثلاث معاً
--   مسؤولية إنسان لاحقاً عبر `prisma migrate deploy`.
--
-- المحتوى: إضافات فقط، بلا أي حذف أو تعديل على جدول موجود —
--   - CommissionBasis: نوع حساب عمولة المندوب (مبيعات / ربح / تحصيل نقدي —
--     الأخيرة الأهم تجارياً لأنها تربط أجر المندوب بالتحصيل الفعلي للدين لا
--     مجرد تسجيله).
--   - WarehouseStockMoveType.REP_TRANSFER: قيمة جديدة على تعداد موجود — تمثّل
--     تحميل بضاعة من مخزون المذخر الرئيسي إلى سيارة مندوب (صرف من المخزون
--     الرئيسي، بنفس اتجاه SHIPMENT لكن لوجهة مندوب لا صيدلية).
--   - WarehouseRep: سجل المندوب — حساب دخول اختياري (userId فريد)، وقاعدة
--     عمولة (commissionBasis/commissionRate).
--   - WarehouseRepStock: "بضاعة السيارة" — رصيد مندوب من دفعة معيّنة
--     (WarehouseBatch)، مفتاح تفرّد (repId, batchId) واحد لكل زوج.
--   - WarehouseFieldSale / WarehouseFieldSaleItem: فاتورة بيع ميدانية وبنودها
--     — تُطابق WarehouseInvoice بلا WarehouseOrder خلفها (بيع فوري بلا تفاوض
--     مسبق)؛ customerName نصي حر إلزامي دائماً، organizationId اختياري فقط
--     حين تكون الصيدلية فعلاً على منصّتنا. unitCost لقطة كلفة الدفعة وقت البيع
--     (لعمولة الربح لاحقاً).
--   - WarehouseRepCollection: تحصيل نقدي من المندوب — قد يُطبَّق على فاتورة
--     ميدانية محدَّدة (fieldSaleId) أو يُسجَّل كتحصيل غير مخصَّص.
--
-- ملاحظة أمان ALTER TYPE ... ADD VALUE (السطر أدناه): على PostgreSQL 12+ هذا
-- الأمر آمن ضمن معاملة (transaction-safe) طالما لم تُقرأ/تُقارَن القيمة
-- الجديدة (REP_TRANSFER) ضمن نفس المعاملة التي أضافتها — وهو الحال هنا
-- بالضبط: لا صف واحد في هذه الهجرة يستخدم REP_TRANSFER كقيمة افتراضية أو في
-- شرط مقارنة؛ الجداول الجديدة لا تُشير إليه إطلاقاً، وأول استخدام فعلي له
-- سيكون لاحقاً من مسار API منفصل بعد نجاح هذه الهجرة (commit) تماماً. لذا
-- استُخدم IF NOT EXISTS احتياطاً إضافياً (إعادة تشغيل آمنة لهذه الهجرة لا
-- ترمي خطأ لو كانت القيمة موجودة بالفعل من محاولة سابقة).
--
-- تم توليد الـ DDL أدناه عبر:
--   npx prisma migrate diff --from-schema-datamodel <schema.prisma قبل التعديل> \
--     --to-schema-datamodel prisma/schema.prisma --script
-- ثم لصقه هنا مع تعديل يدوي واحد فقط: إضافة IF NOT EXISTS لسطر ALTER TYPE
-- (توليد migrate diff لا يضيفها تلقائياً).

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('SALES', 'PROFIT', 'COLLECTION');

-- AlterEnum
ALTER TYPE "WarehouseStockMoveType" ADD VALUE IF NOT EXISTS 'REP_TRANSFER';

-- CreateTable
CREATE TABLE "WarehouseRep" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "commissionBasis" "CommissionBasis" NOT NULL DEFAULT 'SALES',
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseRepStock" (
    "id" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseRepStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseFieldSale" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "organizationId" TEXT,
    "customerName" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "WarehouseInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseFieldSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseFieldSaleItem" (
    "id" TEXT NOT NULL,
    "fieldSaleId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "bonusQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WarehouseFieldSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseRepCollection" (
    "id" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "fieldSaleId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseRepCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseRep_userId_key" ON "WarehouseRep"("userId");

-- CreateIndex
CREATE INDEX "WarehouseRep_warehouseId_isActive_idx" ON "WarehouseRep"("warehouseId", "isActive");

-- CreateIndex
CREATE INDEX "WarehouseRepStock_repId_idx" ON "WarehouseRepStock"("repId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseRepStock_repId_batchId_key" ON "WarehouseRepStock"("repId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseFieldSale_invoiceNumber_key" ON "WarehouseFieldSale"("invoiceNumber");

-- CreateIndex
CREATE INDEX "WarehouseFieldSale_warehouseId_status_idx" ON "WarehouseFieldSale"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "WarehouseFieldSale_repId_soldAt_idx" ON "WarehouseFieldSale"("repId", "soldAt");

-- CreateIndex
CREATE INDEX "WarehouseFieldSaleItem_fieldSaleId_idx" ON "WarehouseFieldSaleItem"("fieldSaleId");

-- CreateIndex
CREATE INDEX "WarehouseRepCollection_repId_collectedAt_idx" ON "WarehouseRepCollection"("repId", "collectedAt");

-- AddForeignKey
ALTER TABLE "WarehouseRep" ADD CONSTRAINT "WarehouseRep_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRep" ADD CONSTRAINT "WarehouseRep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRepStock" ADD CONSTRAINT "WarehouseRepStock_repId_fkey" FOREIGN KEY ("repId") REFERENCES "WarehouseRep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRepStock" ADD CONSTRAINT "WarehouseRepStock_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WarehouseBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseFieldSale" ADD CONSTRAINT "WarehouseFieldSale_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseFieldSale" ADD CONSTRAINT "WarehouseFieldSale_repId_fkey" FOREIGN KEY ("repId") REFERENCES "WarehouseRep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseFieldSale" ADD CONSTRAINT "WarehouseFieldSale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseFieldSaleItem" ADD CONSTRAINT "WarehouseFieldSaleItem_fieldSaleId_fkey" FOREIGN KEY ("fieldSaleId") REFERENCES "WarehouseFieldSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseFieldSaleItem" ADD CONSTRAINT "WarehouseFieldSaleItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WarehouseBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseFieldSaleItem" ADD CONSTRAINT "WarehouseFieldSaleItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "WarehouseCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRepCollection" ADD CONSTRAINT "WarehouseRepCollection_repId_fkey" FOREIGN KEY ("repId") REFERENCES "WarehouseRep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRepCollection" ADD CONSTRAINT "WarehouseRepCollection_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseRepCollection" ADD CONSTRAINT "WarehouseRepCollection_fieldSaleId_fkey" FOREIGN KEY ("fieldSaleId") REFERENCES "WarehouseFieldSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
