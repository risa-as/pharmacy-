-- ميزة البونص (بونص/سلع مجانية) في نظام المذاخر B2B — Warehouse Bonus.
--
-- حالة قاعدة البيانات الحقيقية وقت كتابة هذه الهجرة (مقاسة عبر
-- `npx prisma migrate status` قبل إضافة هذا الملف، لا منسوخة من ملف سابق):
--   24 هجرة موجودة في prisma/migrations، وكلها مُطبَّقة فعلاً على قاعدة
--   الإنتاج الحية (neondb / ep-dry-paper-alh00a4i-pooler) — "Database schema
--   is up to date!" — أي صفر هجرات معلَّقة قبل هذا الملف.
--   هذا الملف (20260910000000_warehouse_bonus) هو الهجرة الخامسة والعشرون
--   المُضافة، وأول هجرة معلَّقة بعد إضافته (25 هجرة موجودة / 1 غير مُطبَّقة).
--   لم يُشغَّل `prisma migrate dev/deploy/reset/db push` هنا إطلاقاً (محظور
--   صراحة على هذا الفرع) — تطبيق هذه الهجرة مسؤولية إنسان لاحقاً عبر
--   `prisma migrate deploy`.
--
-- المحتوى: إضافات فقط، بلا أي حذف أو تعديل على جدول موجود —
--   - WarehouseCatalogItem.bonusThreshold / bonusQuantity: قاعدة بونص قياسية
--     اختيارية لكل صنف كتالوج («اشترِ X خذ Y مجاناً»). 0 (الافتراضي) يعني
--     "لا قاعدة بونص" لكلا العمودين.
--   - WarehouseOrderItem.bonusQuantity: الوحدات المجانية المعتمَدة فعلياً
--     لسطر طلب واحد — القيمة المُلزِمة في الخصم/الفوترة/الهامش، بصرف النظر
--     عن قاعدة الكتالوج أعلاه (المذخر يفاوض حالة بحالة).
-- تم توليد الـ DDL أدناه عبر:
--   npx prisma migrate diff --from-schema-datamodel <schema.prisma قبل التعديل> \
--     --to-schema-datamodel prisma/schema.prisma --script
-- ثم لصقه هنا بلا تعديل يدوي.

-- AlterTable
ALTER TABLE "WarehouseOrderItem" ADD COLUMN     "bonusQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WarehouseCatalogItem" ADD COLUMN     "bonusQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusThreshold" INTEGER NOT NULL DEFAULT 0;
