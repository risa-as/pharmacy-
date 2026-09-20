-- ميزة وحدة التسعير: إعلان وحدة السعر (باكيت/شريط) وعدد الأشرطة في الباكيت.
--
-- سبب وجود هذا الملف: الأعمدة الأربعة أدناه أُضيفت إلى schema.prisma وولِّد
-- عميل Prisma عليها، بلا ترحيل — فكل استعلام يلمس WarehouseCatalogItem كان
-- يفشل بـ P2022 («The column WarehouseCatalogItem.priceUnit does not exist»)
-- وتسقط /warehouse/catalog و/warehouse/stock بخطأ 500.
--
-- التعديل إضافي بالكامل وآمن على قاعدة حيّة:
--   * أربعة أعمدة nullable فقط — ADD COLUMN بلا DEFAULT ولا NOT NULL، فلا
--     إعادة كتابة للجدول ولا قفل طويل على Postgres.
--   * لا تعبئة رجعية (backfill) إطلاقاً، ولا حتى بتخمين PACKET: قرار المخطط
--     الصريح أن NULL تعني «غير معروف بعد» وأن كل مستهلك يوقف التحويل عندها
--     بدل الافتراض — والافتراض الصامت هو العطب نفسه الذي تعالجه الميزة.
--   * لا قيود ولا فهارس جديدة: القيم محصورة في app/lib/pack-units.ts، ولا
--     استعلام يفلتر بهذه الأعمدة بعد.
--   * لا استعلام قائم يتغيّر سلوكه، فالأعمدة جديدة ولا يقرأها شيء قديم.
--
-- priceUnit نصّ لا enum بقصد: إضافة عمود nullable أخفّ على قاعدة إنتاج من
-- CREATE TYPE + ALTER TYPE، وحصر القيم ('PACKET' / 'STRIP') يبقى في
-- pack-units.ts وحدها كما يوثّق تعليق المخطط.

-- عدد الأشرطة في الباكيت — مرة واحدة لكل باركود (التعبئة خاصية بالدواء نفسه).
ALTER TABLE "GlobalDrug" ADD COLUMN "unitsPerPack" INTEGER;

-- وحدة الأسعار التي سعّر بها المذخر عرضاً بعينه — على مستوى العرض لا السطر.
ALTER TABLE "WarehouseOrder" ADD COLUMN "priceUnit" TEXT;

-- وحدة حقل price في كتالوج المذخر + تعبئته المعلَنة لهذا الصنف.
-- اختلاف unitsPerPack هنا عن نظيره في GlobalDrug تعارضٌ يوقف التحويل، ولا
-- يُرجَّح أحدهما — لذلك يُخزَّن الاثنان ولا يُدمجان.
ALTER TABLE "WarehouseCatalogItem" ADD COLUMN "priceUnit" TEXT;
ALTER TABLE "WarehouseCatalogItem" ADD COLUMN "unitsPerPack" INTEGER;
