// المرحلة 4 من ميزة المذاخر (بدائل الدواء): طبقة وصل غير نقية — تجلب صفوف
// كتالوج المذخر المطلوبة من قاعدة البيانات ثم تستدعي المنطق النقي
// (rankAlternatives في warehouse-alternatives.ts) لكل صنف.
//
// لماذا ملف مشترك منفصل بدل تكرار الاستعلام في كل موضع: هذا بالضبط استُدعي
// من موضعين يجب ألا ينحرفا عن بعضهما — app/warehouse/orders/page.tsx (قائمة
// كل الطلبات، التحميل الأول) وapp/api/warehouse-portal/orders/[id]/route.ts
// (طلب واحد، يُستدعى من refreshOne في OrdersClient.tsx بعد إرسال العرض). نفس
// الفخ موجود فعلاً وموثَّق لميزة البونص (bonusRuleByBarcode مكرَّرة حرفياً في
// كلا الملفين اليوم) — لا نكرّره هنا لميزة جديدة طالما يمكن تفاديه بدالة واحدة.
//
// واجهة Prisma المُحقنة (WarehouseCatalogFinder) أصغر سطح ممكن — نفس نمط
// CatalogPrisma في warehouse-catalog.ts — كي تبقى الدالة قابلة للاختبار بـ
// prisma وهمي دون قاعدة بيانات فعلية.
// استيراد نسبي لا عبر alias "@/*" عمداً — نفس نمط warehouse-stock.ts/
// warehouse-reports.ts: هذا الملف مُختبَر مباشرة تحت vitest في هذا المستودع،
// الذي لا يحل alias "@/*" (انظر vitest.config.ts وتعليق warehouse-permissions.ts).
import { summarizeStock, type BatchLike } from "./warehouse-stock";
import { rankAlternatives, type RankedAlternative } from "./warehouse-alternatives";

export interface OrderItemForAlternatives {
  id: string;
  drug: { barcode: string; alternatives: string[] };
}

interface CatalogRowForAlternatives {
  barcode: string;
  price: number;
  isAvailable: boolean;
  drug: { tradeName: string };
  batches: BatchLike[];
}

export interface WarehouseCatalogFinder {
  warehouseCatalogItem: {
    findMany(args: {
      where: { warehouseId: string; barcode: { in: string[] } };
      include: {
        drug: { select: { tradeName: true } };
        batches: { select: { id: true; quantity: true; expiryDate: true } };
      };
    }): Promise<CatalogRowForAlternatives[]>;
  };
}

/**
 * يبني خريطة itemId → بدائل مرشَّحة لكل صنف في `items` باستعلام واحد فقط على
 * اتحاد كل الباركودات المذكورة عبر كل الأصناف (لا استعلام لكل صنف على حدة) —
 * نفس أسلوب bonusRules في الملفين المذكورين أعلاه حرفياً.
 *
 * `items` فارغة أو بلا أي بديل مذكور إطلاقاً → لا استعلام قاعدة بيانات
 * (الحارس alternativeBarcodes.length > 0)، وخريطة بمفاتيح كل الأصناف وقيمة []
 * لكل منها.
 */
export async function buildAlternativesByItemId(
  prisma: WarehouseCatalogFinder,
  warehouseId: string,
  items: OrderItemForAlternatives[]
): Promise<Map<string, RankedAlternative[]>> {
  // دواء لا يكون بديلاً لنفسه — نفس الفلتر يُطبَّق هنا (لبناء اتحاد الاستعلام)
  // ولكل صنف على حدة أدناه (rankAlternatives نفسها لا تعرف "صاحب" المصفوفة).
  const ownBarcodeExcluded = (it: OrderItemForAlternatives) =>
    (it.drug.alternatives ?? []).filter((b) => b && b !== it.drug.barcode);

  const allAlternativeBarcodes = Array.from(new Set(items.flatMap(ownBarcodeExcluded)));

  const alternativeCatalogRows =
    allAlternativeBarcodes.length > 0
      ? await prisma.warehouseCatalogItem.findMany({
          where: { warehouseId, barcode: { in: allAlternativeBarcodes } },
          include: {
            drug: { select: { tradeName: true } },
            batches: { select: { id: true, quantity: true, expiryDate: true } },
          },
        })
      : [];

  // isListed تُمرَّر خاماً (WarehouseCatalogItem.isAvailable) بلا دمج مسبَق مع
  // sellableQuantity هنا — rankAlternatives هي المكان الوحيد الذي يقرّر
  // "متاح فعلاً = مُدرَج ومخزونه > 0"؛ دمجها هنا أيضاً كان يُطبِّق نفس القاعدة
  // مرتين في مكانين (بالضبط ما يمنعه تعليق effectiveLine في warehouse-quote.ts).
  const sharedCatalog = alternativeCatalogRows.map((row) => ({
    barcode: row.barcode,
    tradeName: row.drug.tradeName,
    price: row.price,
    sellableQuantity: summarizeStock(row.batches).totalQuantity,
    isListed: row.isAvailable,
  }));

  const result = new Map<string, RankedAlternative[]>();
  for (const it of items) {
    result.set(
      it.id,
      rankAlternatives({ alternativeBarcodes: ownBarcodeExcluded(it), catalog: sharedCatalog })
    );
  }
  return result;
}
