-- ميزة نطاق المذخر: صفوف GlobalDrug خاصة بمذخر بعينه (بنفس فلسفة organizationId).
-- تعديل إضافي بالكامل: العمود nullable بلا قيمة افتراضية ولا تعبئة رجعية، فكل
-- صف قائم يبقى warehouseId = NULL وكل استعلام قائم يعيد نفس نتيجته الحالية.

ALTER TABLE "GlobalDrug" ADD COLUMN "warehouseId" TEXT;

-- قيد منفصل عن @@unique([barcode, organizationId]) بقصد: Postgres يعتبر NULL
-- مميزاً، فدمج العمودين في قيد واحد كان سيُفقد صفوف المؤسسات حمايتها بصمت.
-- هذا القيد لا يُفعَّل إلا حين warehouseId غير NULL — أي على صفوف المذاخر فقط.
CREATE UNIQUE INDEX "GlobalDrug_barcode_warehouseId_key" ON "GlobalDrug"("barcode", "warehouseId");

CREATE INDEX "GlobalDrug_warehouseId_idx" ON "GlobalDrug"("warehouseId");

ALTER TABLE "GlobalDrug" ADD CONSTRAINT "GlobalDrug_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
