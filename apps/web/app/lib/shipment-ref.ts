// مرجع الشحنة المولَّد آلياً (قرار صاحب النظام 2026-09): يحل محل «رقم الدفعة»
// الذي كان المذخر يكتبه يدوياً وقت التسعير (WarehouseOrderItem.batchNumber).
// التجربة أثبتت أن رقماً يكتبه المذخر بيده وقت التسعير — قبل انتقاء البضاعة
// فعلياً من الرفّ — ليس رقم دفعة حقيقياً بل وعداً، وغالباً يُترَك فارغاً أو
// يُكتب عشوائياً. القرار: يُصدره النظام نفسه فيصبح مرجعاً تتبّعياً صادقاً —
// "هذا ما أصدره النظام لهذا السطر"، لا ادّعاء برقم دفعة حقيقي من مصنع.
//
// نقي بالكامل — بلا Prisma وبلا next/* — يستدعيه:
//  - app/api/warehouse-portal/orders/[id]/quote/route.ts (خادمياً، وهو مصدر
//    القيمة المخزَّنة فعلياً في batchNumber).
//  - app/warehouse/orders/OrdersClient.tsx (للعرض المسبق فقط قبل الحفظ —
//    سطر لم يُسعَّر بعد لا قيمة محفوظة له، فتُحسَب نفس القيمة محلياً ليرى
//    المذخر ما سيُصدره النظام دون إرسالها في الطلب — الخادم يتجاهل أي قيمة
//    واردة من العميل لهذا الحقل تماماً).
//
// حتمي بالكامل عمداً — بلا Date.now()/Math.random()/randomUUID():
// PATCH .../quote استبدال كامل (لا دمج) لكل أصناف الطلب في كل مرة، وقد يُعيد
// المذخر التسعير لنفس الطلب عدة مرات (تعديل سعر، تصحيح كمية...). أي عنصر
// عشوائي كان سيولّد قيمة مختلفة في كل إعادة تسعير فتتفرّق سجلات الصيدلية
// (PurchaseItem المنسوخة عند الاعتماد) عن سجلات المذخر (WarehouseOrderItem
// المُستبدَلة) — نفس الخلل الذي كان تاريخ الانتهاء المُختلَق يسبّبه، لكن هنا
// في رقم الدفعة بدل التاريخ. الحتمية تعني الاعتماد فقط على مدخلات ثابتة لكل
// سطر: رقم الطلب + ترتيب السطر المستقر بين كل أصناف نفس الطلب.

/** لا رقم طلب صالح (نادر، دفاعي فقط) — المرجع يبقى صالحاً ومتتبَّعاً عبر هوية
 *  السطر نفسها بدل بادئة الطلب، لا سلسلة عارية بلا معنى مثل "-L1" وحدها. */
const FALLBACK_PREFIX = "REF";

/**
 * الجزء المميِّز من رقم الطلب — لا الرقم كاملاً: أرقام الطلبات في هذا النظام
 * على صورة `WO-51045DA4-AC5D-4358-BC2E-B76813799ABB` (بادئة + UUID)، وطباعة
 * الـUUID كاملاً على ملصق دفعة لا يقرأه بشر فعلياً. نأخذ أول جزأين فقط
 * (البادئة الثابتة + أول ثمانية أحرف من الـUUID) — كافيان للتمييز البصري بين
 * طلبين مختلفين دون الإطالة، ويطابقان تماماً ما يظهر في عنوان نافذة المراجعة
 * (`مراجعة الطلب ${order.orderNumber}`) فيسهل الربط بصرياً بين الاثنين.
 */
function distinctiveOrderSegment(orderNumber: string): string {
  const parts = orderNumber.trim().split("-").filter(Boolean);
  if (parts.length === 0) return FALLBACK_PREFIX;
  if (parts.length === 1) return parts[0].toUpperCase();
  return `${parts[0]}-${parts[1]}`.toUpperCase();
}

/**
 * يبني مرجع الشحنة لسطر واحد. `ordinal` يجب أن يأتي من ترتيب مستقر لكل أصناف
 * الطلب (انظر computeShipmentOrdinals أدناه) — أبداً من موضع السطر في المصفوفة
 * كما وصلت من الشبكة/القاعدة، فإعادة تسعير الطلب قد يعيد الأصناف بترتيب مختلف
 * (JSON.stringify على Map، ترتيب findMany غير مضمون بلا orderBy صريح...) وهذا
 * كان سيُعيد ترقيم كل الأسطر بصمت بين تسعيرين لنفس الطلب.
 *
 * orderNumber فارغ/null (دفاعي — لا يحدث عملياً، كل طلب يُنشأ برقم دائماً):
 * يُستبدَل ببادئة REF + أول ثمانية أحرف من itemId، فتبقى القيمة صالحة ومميَّزة
 * عن أي سطر آخر (حتى في طلب آخر فارغ الرقم أيضاً) بدل نص عارٍ بلا معنى.
 */
export function buildShipmentRef(
  orderNumber: string | null | undefined,
  itemId: string,
  ordinal: number
): string {
  const trimmed = typeof orderNumber === "string" ? orderNumber.trim() : "";
  const prefix = trimmed
    ? distinctiveOrderSegment(trimmed)
    : `${FALLBACK_PREFIX}-${itemId.slice(0, 8).toUpperCase()}`;
  return `${prefix}-L${ordinal}`;
}

/**
 * الترتيب المستقر المشترك بين الخادم والعميل: كل أصناف الطلب (لا فقط ما
 * يُحكَم عليه في هذا الاستدعاء تحديداً) مرتّبة أبجدياً حسب itemId، فترقيم سطر
 * معيّن (L1, L2, ...) لا يتغيّر أبداً طالما لم تتغيّر مجموعة أصناف الطلب نفسها
 * — بصرف النظر عن ترتيب وصولها من الشبكة أو القاعدة أو ترتيب ما أرسله المذخر
 * فعلياً في هذا النداء تحديداً.
 */
export function computeShipmentOrdinals(itemIds: string[]): Map<string, number> {
  const sorted = [...itemIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const ordinals = new Map<string, number>();
  sorted.forEach((id, index) => ordinals.set(id, index + 1));
  return ordinals;
}

/**
 * الدالة الوحيدة التي يستدعيها كل من route.ts وOrdersClient.tsx فعلياً — تجمع
 * computeShipmentOrdinals وbuildShipmentRef معاً كي لا يُعاد بناء منطق الترتيب
 * في أكثر من مكان (نفس الأصناف يجب أن تُرتَّب بنفس الطريقة في كل استدعاء، وإلا
 * أنتج الخادم والعميل ترقيمين مختلفين لنفس السطر).
 */
export function computeShipmentRefs(
  orderNumber: string | null | undefined,
  itemIds: string[]
): Map<string, string> {
  const ordinals = computeShipmentOrdinals(itemIds);
  const refs = new Map<string, string>();
  for (const itemId of itemIds) {
    refs.set(itemId, buildShipmentRef(orderNumber, itemId, ordinals.get(itemId)!));
  }
  return refs;
}
