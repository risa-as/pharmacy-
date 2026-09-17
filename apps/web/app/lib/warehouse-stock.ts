// المرحلة 1 من ميزة تتبّع مخزون المذخر (Pass A): منطق نقي بالكامل — بلا استيراد
// Prisma وبلا next/*، قابل للاختبار بمعزل عن قاعدة البيانات. يطابق نمط
// app/lib/warehouse-quote.ts / app/lib/warehouse-order-state.ts: كل ما يُكتب
// لاحقاً في مسارات الـ API (المرحلة ب) يجب أن يمر عبر هذه الدوال بدل إعادة
// حساب القواعد في كل موقع.
//
// المرحلة ب: يستورد effectiveLine من warehouse-quote.ts (بلا استيراد دائري —
// ذلك الملف لا يستورد من هنا) كي يبقى "القيمة الفعلية لسطر الطلب" بقاعدة واحدة
// عبر كل الملفات الثلاثة (عرض السعر، جسر فاتورة الشراء، وخصم المخزون هنا).
import type { OrderLineStatus } from "./warehouse-quote";
import { effectiveLine } from "./warehouse-quote";
// ميزة البونص: totalUnitsLeavingStock هي القاعدة الوحيدة لـ "مباع + مجاني"،
// نفس فلسفة effectiveLine أعلاه — لا تُكرَّر جمع الكميتين هنا مرة أخرى.
import { totalUnitsLeavingStock } from "./warehouse-bonus";

// ── FEFO allocation ──────────────────────────────────────────────────────────

export interface BatchLike {
  id: string;
  quantity: number;
  expiryDate: Date | string;
  batchNumber?: string;
}

export interface Allocation {
  batchId: string;
  quantity: number;
}

export interface AllocationResult {
  ok: boolean;
  allocations: Allocation[];
  allocated: number;
  shortfall: number;
}

function normalizeDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function isPositiveInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

/**
 * تخصيص الكمية المطلوبة على الدفعات بأسلوب FEFO (أول منتهي أول مصروف) — الانضباط
 * الصحيح للأدوية، وهو **ليس** FIFO (أول وارد أول صادر). الدفعة الأقرب انتهاءً
 * تُستهلك أولاً بصرف النظر عن تاريخ استلامها.
 *
 * قواعد صارمة:
 * - لا تُخصَّص أبداً كمية من دفعة منتهية الصلاحية (expiryDate <= now)، حتى لو
 *   كانت الدفعة الوحيدة المتوفرة وتكفي الطلب بالكامل — يجب أن يفشل الطلب
 *   (shortfall = الطلب كاملاً) بدل شحن دواء منتهي.
 * - الدفعات بكمية <= 0 تُتجاهل.
 * - التلبية الجزئية نتيجة صحيحة: يُخصَّص المتوفر، ويُبلَّغ shortfall، و ok: false.
 * - طلب <= 0 أو غير صحيح (كسري) أو غير منتهٍ (NaN/Infinity) → رفض نظيف بلا أي تخصيص.
 * - عند تساوي تاريخ الانتهاء، يُفضَّل ترتيب حاسم وقابل للاختبار (حسب id تصاعدياً)
 *   كي تكون النتيجة مستقرة عبر التشغيلات المتكررة لنفس المدخلات.
 * - expiryDate يُقبل كـ Date أو نص ISO بلا فرق في السلوك؛ now تُحقن للاختبار
 *   (تفتَرِض new Date() افتراضياً) كي لا تعتمد الاختبارات على الساعة الحقيقية.
 */
export function allocateFEFO(
  batches: BatchLike[],
  requestedQuantity: number,
  now?: Date
): AllocationResult {
  if (!isPositiveInteger(requestedQuantity)) {
    return { ok: false, allocations: [], allocated: 0, shortfall: 0 };
  }

  const current = now ?? new Date();
  const currentMs = current.getTime();

  const sellable = batches
    .filter((b) => b.quantity > 0)
    .filter((b) => normalizeDate(b.expiryDate).getTime() > currentMs)
    .sort((a, b) => {
      const diff = normalizeDate(a.expiryDate).getTime() - normalizeDate(b.expiryDate).getTime();
      if (diff !== 0) return diff;
      // تعادل تاريخ الانتهاء: ترتيب حاسم بالـ id كي تكون النتيجة قابلة للاختبار.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const allocations: Allocation[] = [];
  let remaining = requestedQuantity;

  for (const batch of sellable) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantity);
    if (take <= 0) continue;
    allocations.push({ batchId: batch.id, quantity: take });
    remaining -= take;
  }

  const allocated = requestedQuantity - remaining;
  const shortfall = remaining;

  return { ok: shortfall === 0, allocations, allocated, shortfall };
}

// ── Stock summary ────────────────────────────────────────────────────────────

export interface StockSummary {
  /** إجمالي القابل للبيع فقط — يستثني المنتهي الصلاحية. */
  totalQuantity: number;
  expiredQuantity: number;
  /** عدد صفوف الدفعات المُمرَّرة، بصرف النظر عن الصلاحية أو الكمية. */
  batchCount: number;
  /** أقرب تاريخ انتهاء بين الدفعات غير المنتهية وذات الكمية > 0؛ null إن لم يوجد أي منها. */
  nearestExpiry: Date | null;
}

export function summarizeStock(batches: BatchLike[], now?: Date): StockSummary {
  const current = now ?? new Date();
  const currentMs = current.getTime();

  let totalQuantity = 0;
  let expiredQuantity = 0;
  let nearestExpiry: Date | null = null;

  for (const batch of batches) {
    const expiry = normalizeDate(batch.expiryDate);
    const isExpired = expiry.getTime() <= currentMs;
    const qty = batch.quantity > 0 ? batch.quantity : 0;

    if (isExpired) {
      expiredQuantity += qty;
      continue;
    }

    totalQuantity += qty;
    if (qty > 0 && (nearestExpiry === null || expiry.getTime() < nearestExpiry.getTime())) {
      nearestExpiry = expiry;
    }
  }

  return { totalQuantity, expiredQuantity, batchCount: batches.length, nearestExpiry };
}

// ── Expiry bucketing ─────────────────────────────────────────────────────────

export type ExpiryBucket = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * يصنّف تاريخ انتهاء دفعة واحدة إلى فئة خطر — أساس تقرير المخاطر والتنبيهات.
 *
 * الحدود (حاسمة ومختبرة عند الحافتين بالضبط):
 * - EXPIRED: عند اللحظة الحالية أو قبلها (expiryDate <= now).
 * - CRITICAL: خلال 90 يوماً من الآن — بما في ذلك اليوم التسعون بالضبط
 *   (الفرق بالمللي ثانية <= 90 يوماً يُصنَّف CRITICAL، وليس WARNING).
 * - WARNING: خلال 180 يوماً — بما في ذلك اليوم المئة والثمانون بالضبط
 *   (نفس منطق "ضمن الحد" الشامل: <= 180 يوماً).
 * - OK: أي شيء أبعد من 180 يوماً.
 */
export function expiryBucket(expiryDate: Date | string, now?: Date): ExpiryBucket {
  const current = now ?? new Date();
  const expiry = normalizeDate(expiryDate);
  const diffMs = expiry.getTime() - current.getTime();

  if (diffMs <= 0) return "EXPIRED";
  if (diffMs <= 90 * MS_PER_DAY) return "CRITICAL";
  if (diffMs <= 180 * MS_PER_DAY) return "WARNING";
  return "OK";
}

// ── Derived availability ─────────────────────────────────────────────────────

/**
 * WarehouseCatalogItem.isAvailable يبقى بمعناه الحالي بلا تغيير: مفتاح "أعرض
 * هذا الصنف" الذي يتحكم به التاجر يدوياً (قرار عرض، لا قرار مخزون). هذه
 * الدالة تحسب التوفر **الفعلي** الذي تراه الصيدلية عند الطلب — وهو ليس نفس
 * الشيء: صنف مُدرَج (isListed=true) لكن رصيده القابل للبيع صفر يجب ألا يظهر
 * متوفراً، وهذا هو إصلاح خطأ "متوفر أثناء نفاد المخزون". لا تُعاد تسمية أو
 * إعادة استخدام العمود isAvailable لهذا الغرض؛ المرحلة ب تعرض الدمج
 * (isListed && sellableQuantity > 0) في الواجهة/الـ API بدل تخزينه.
 */
export function deriveAvailability(input: { isListed: boolean; sellableQuantity: number }): boolean {
  return input.isListed && input.sellableQuantity > 0;
}

// ── Low-stock check ──────────────────────────────────────────────────────────

/**
 * minStock = 0 يعني "لم يُضبط حدّ" ويجب ألا يُبلَّغ أبداً كنقص مخزون، بصرف
 * النظر عن مدى انخفاض sellableQuantity (حتى صفر).
 */
export function isLowStock(input: { sellableQuantity: number; minStock: number }): boolean {
  return input.minStock > 0 && input.sellableQuantity <= input.minStock;
}

// ── Stock-move validation ────────────────────────────────────────────────────

// المندوبون: REP_TRANSFER (تحميل بضاعة على سيارة مندوب) صرف من المخزون
// الرئيسي تماماً كـ SHIPMENT — يدخل كلا المجموعتين. مصدر الحقيقة الوحيد
// لقيم WarehouseStockMoveType هو enum WarehouseStockMoveType في schema.prisma؛
// أي قيمة تُضاف هناك يجب أن تُضاف هنا أيضاً وإلا رفضتها validateStockMove
// خطأً كـ"نوع حركة غير معروف" رغم كونها قيمة enum صالحة فعلياً.
const OUTBOUND_MOVE_TYPES = new Set(["SHIPMENT", "DAMAGE", "REP_TRANSFER"]);
const KNOWN_MOVE_TYPES = new Set(["RECEIPT", "SHIPMENT", "ADJUSTMENT", "DAMAGE", "RETURN", "REP_TRANSFER"]);

export type ValidateStockMoveResult = { ok: true } | { ok: false; error: string };

/**
 * تحقق من صحة حركة مخزون واحدة قبل كتابتها (WarehouseStockMove.quantity دائماً
 * موجبة؛ type يحمل الاتجاه). الكمية يجب أن تكون عدداً صحيحاً موجباً؛ لحركات
 * الصرف (SHIPMENT, DAMAGE) يجب ألا تتجاوز الكمية المتوفرة فعلياً في الدفعة.
 */
export function validateStockMove(input: {
  type: string;
  quantity: number;
  batchQuantity?: number;
}): ValidateStockMoveResult {
  if (!KNOWN_MOVE_TYPES.has(input.type)) {
    return { ok: false, error: "نوع حركة المخزون غير معروف." };
  }

  if (!isPositiveInteger(input.quantity)) {
    return { ok: false, error: "كمية الحركة يجب أن تكون عدداً صحيحاً موجباً." };
  }

  if (OUTBOUND_MOVE_TYPES.has(input.type)) {
    if (typeof input.batchQuantity !== "number" || !Number.isFinite(input.batchQuantity)) {
      return { ok: false, error: "كمية الدفعة غير معروفة، لا يمكن التحقق من عملية الصرف." };
    }
    if (input.quantity > input.batchQuantity) {
      return { ok: false, error: "الكمية المطلوب صرفها أكبر من الكمية المتوفرة في الدفعة." };
    }
  }

  return { ok: true };
}

// ── Pass B: ربط بنود الطلب بخصم المخزون ─────────────────────────────────────
// هذا القسم يخدم PATCH /api/warehouse-portal/orders/[id]/shipping تحديداً
// (انتقال APPROVED → SHIPPED). القاعدة ذاتية الضبط: مذخر لم يُدخل أي دفعة لصنف
// معيّن لا يخضع للتحقق من المخزون له إطلاقاً (يستمر الشحن كما كان قبل هذه
// الميزة)، بينما أي مذخر بدأ إدخال دفعات لصنف يخضع فوراً لتطبيق المخزون عليه —
// بلا إعداد أو علم تفعيل أو يوم ترحيل. انظر التعليق الكامل في مسار الـ API.

export type { OrderLineStatus };

/** بند طلب كما يلزم لاشتقاق كمية الخصم — نفس حقول OrderLine في warehouse-quote.ts زائداً معرّف مطابقة (باركود). */
export interface OrderItemForDeduction {
  /** باركود الدواء العالمي — نفس مفتاح مطابقة الكتالوج (WarehouseCatalogItem.barcode). */
  barcode: string;
  status: OrderLineStatus;
  quantity: number;
  quotedQuantity?: number | null;
  unitPrice: number;
  quotedPrice?: number | null;
  /**
   * ميزة البونص: الوحدات المجانية المعتمَدة على هذا السطر
   * (WarehouseOrderItem.bonusQuantity) — تُضاف لكمية الخصم فقط إن كان السطر
   * يشحن فعلاً (quantity > 0 بعد effectiveLine). سطر OUT_OF_STOCK ببونص عالق
   * (بيانات قديمة أو خطأ إدخال) لا يخصم شيئاً على الإطلاق — لا مباع ولا بونص،
   * تماماً كما لو لم يُذكَر البونص إطلاقاً.
   */
  bonusQuantity?: number | null;
}

export interface RequiredDeduction {
  barcode: string;
  quantity: number;
}

/**
 * يحوّل بنود طلب مُراجَع إلى قائمة خصومات مخزون مطلوبة — عبر effectiveLine()
 * من warehouse-quote.ts حصراً (لا حساب كمية مستقل هنا، فلا تتفرّق القاعدتان
 * كما حدث قبل إصلاح effectiveLine نفسه): OUT_OF_STOCK يُستبعد دائماً (كميته
 * الفعلية صفر)، PARTIAL يستخدم quotedQuantity، AVAILABLE/REQUESTED يستخدمان
 * الكمية المطلوبة كاملة. الأصناف بكمية فعلية صفر (بينها OUT_OF_STOCK دوماً) لا
 * تظهر في الناتج إطلاقاً.
 *
 * ملاحظة: هذه الدالة لا تُجمِّع الأصناف المكرَّرة بنفس الباركود (بند طلبين
 * لنفس الدواء) — استخدم aggregateDeductions() على الناتج قبل استدعاء
 * allocateFEFO لكل صنف، وإلا يُخصَّص من نفس الدفعات أكثر من مرة.
 *
 * ميزة البونص: كمية الخصم لكل سطر = المباعة فعلياً (eff.quantity) + المجانية
 * (item.bonusQuantity) عبر totalUnitsLeavingStock() — البونص بضاعة حقيقية
 * تغادر الرفوف فتُخصَم بالضبط كأي وحدة مباعة. الشرط `eff.quantity > 0` يبقى
 * أولاً ومنفصلاً قبل إضافة البونص: سطر OUT_OF_STOCK دائماً eff.quantity = 0
 * (بصرف النظر عن bonusQuantity المخزَّن عليه)، فيُستبعَد سطره بالكامل هنا —
 * لا مباع ولا بونص يُخصَمان لصنف لم يُشحَن أصلاً.
 */
export function computeRequiredDeductions(items: OrderItemForDeduction[]): RequiredDeduction[] {
  const result: RequiredDeduction[] = [];
  for (const item of items) {
    const eff = effectiveLine(item);
    if (eff.quantity > 0) {
      const quantity = totalUnitsLeavingStock({
        soldQuantity: eff.quantity,
        bonusQuantity: item.bonusQuantity ?? 0,
      });
      result.push({ barcode: item.barcode, quantity });
    }
  }
  return result;
}

/**
 * يُجمِّع خصومات مكرَّرة بنفس الباركود (أكثر من بند طلب لنفس الدواء) بجمع
 * الكميات — يجب أن يُستدعى قبل allocateFEFO لكل صنف، وإلا يُخصَّص من نفس
 * الدفعات أكثر من مرة (كل استدعاء منفصل لا "يرى" ما استهلكه استدعاء آخر).
 */
export function aggregateDeductions(deductions: RequiredDeduction[]): RequiredDeduction[] {
  const byBarcode = new Map<string, number>();
  for (const d of deductions) {
    byBarcode.set(d.barcode, (byBarcode.get(d.barcode) ?? 0) + d.quantity);
  }
  return Array.from(byBarcode.entries()).map(([barcode, quantity]) => ({ barcode, quantity }));
}

export type StockTrackingDecision = "UNTRACKED_SKIP" | "ENFORCE";

/**
 * القاعدة ذاتية الضبط بالكامل، بلا أي حالة مخزَّنة: صنف بلا أي دفعة على
 * الإطلاق (batchCount === 0 — سواء لأن الكتالوج لا يملك صفاً لهذا الباركود
 * أصلاً، أو يملكه لكن بلا دفعات) يعني أن هذا المذخر لم يبدأ تتبّع مخزونه بعد،
 * فيُشحَن كما كان يُشحَن قبل ميزة المخزون (تجاهل صامت). أي دفعة واحدة مسجَّلة
 * — حتى لو صفرية الكمية أو منتهية — تعني أن هذا المذخر بدأ التتبّع، فيُطبَّق
 * التحقق من الكفاية فوراً بلا علم تفعيل أو يوم ترحيل.
 */
export function decideStockTracking(batchCount: number): StockTrackingDecision {
  return batchCount > 0 ? "ENFORCE" : "UNTRACKED_SKIP";
}
