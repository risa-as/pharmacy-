// المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): منطق نقي بالكامل — بلا
// استيراد Prisma وبلا next/*، قابل للاختبار بمعزل عن قاعدة البيانات. يطابق
// نمط app/lib/warehouse-stock.ts / warehouse-accounts.ts: كل ما تعرضه مسارات
// الـ API (app/api/warehouse-portal/reports/*) يجب أن يمر عبر هذه الدوال بدل
// إعادة حساب القواعد في كل موقع. الاستعلام الفعلي عن قاعدة البيانات (بناء
// SoldLine[] من الطلبات المشحونة) يعيش في app/lib/warehouse-report-data.ts —
// انظر تعليق رأسه لمصدر كل حقل وسبب اعتماد effectiveLine() حصراً.
import { expiryBucket, type ExpiryBucket } from "./warehouse-stock";
// ميزة البونص: totalUnitsLeavingStock هي القاعدة الوحيدة لـ "مباع + مجاني" —
// نفس فلسفة effectiveLine، لا تُكرَّر جمع الكميتين هنا (انظر marginByItem).
import { totalUnitsLeavingStock } from "./warehouse-bonus";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/** يقرّب لمنزلة عشرية واحدة — مستخدَم في كل نسبة مئوية بهذا الملف كي تتّسق الواجهة. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── سطر مبيعات (Sold line) ───────────────────────────────────────────────────

/**
 * سطر مبيعات واحد كما يبنيه app/lib/warehouse-report-data.ts من بند طلب
 * مُخصَم فعلياً (SHIPPED/DELIVERED، عبر effectiveLine() حصراً — لا حساب
 * مستقل). costPrice قد يغيب (صنف لم تُسجَّل له تكلفة) أو يكون صفراً — كلاهما
 * "تكلفة غير معروفة" وليس "تكلفة صفرية فعلية"، وهذا حاسم في marginByItem
 * أدناه. pharmacyName قد يغيب نظرياً فقط (كل صف مصدره Organization.name
 * الإلزامي فعلياً)، فيُترك اختيارياً هنا للتساهل مع بيانات ناقصة مستقبلاً.
 */
export interface SoldLine {
  orderId?: string;
  isReturn?: boolean;
  costTotal?: number;
  barcode: string;
  tradeName: string;
  quantity: number;
  lineTotal: number;
  costPrice?: number;
  /**
   * ميزة البونص: وحدات مجانية غادرت المخزون مع هذا السطر فعلياً
   * (WarehouseOrderItem.bonusQuantity) — بلا إيراد (lineTotal/quantity أعلاه
   * لا يتضمنانها إطلاقاً، فتوب سيلرز/المبيعات بفترة لا تتأثر بها) لكن بتكلفة
   * كاملة في marginByItem أدناه. غائبة أو صفر تعني ببساطة "بلا بونص على هذا
   * السطر" — لا فرق بينهما هنا (بخلاف costPrice، لا حالة "مجهول" للبونص).
   */
  bonusQuantity?: number;
  organizationId: string;
  pharmacyName?: string;
  shippedAt: Date | string;
}

// ── المبيعات مجمّعة بفترة ─────────────────────────────────────────────────────

export interface SalesByPeriodEntry {
  key: string;
  total: number;
  orders: number;
  quantity: number;
}

/**
 * يحسب رقم الأسبوع بمعيار ISO-8601 (الاثنين أول أيام الأسبوع، الأسبوع الأول
 * هو أول أسبوع يحتوي خميس تقويم السنة) — بمعزل عن المنطقة الزمنية (UTC
 * بالكامل)، وإلا يتغيّر توزيع بعض التواريخ على الأسابيع حسب توقيت الخادم.
 */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // الاثنين=0 ... الأحد=6
  const dayNum = (d.getUTCDay() + 6) % 7;
  // انتقل إلى خميس هذا الأسبوع — السنة التي يقع فيها هذا الخميس هي isoYear.
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();

  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function periodKey(date: Date, period: "day" | "week" | "month"): string {
  date = new Date(date.getTime() + 3 * 60 * 60 * 1000); // Business calendar: Asia/Baghdad.
  if (period === "week") return isoWeekKey(date);

  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (period === "month") return `${y}-${m}`;

  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Production data carries the actual order/sale ID. Timestamp fallback is for legacy callers only. */
function orderKey(line: SoldLine): string {
  if (line.orderId) return line.orderId;
  return `${line.organizationId}::${normalizeDate(line.shippedAt).getTime()}`;
}

/**
 * إجمالي المبيعات مجمّعاً بفترة (يوم/أسبوع/شهر) — حسب تقويم بغداد لتفادي
 * انزياح المنطقة الزمنية، والنتيجة مرتّبة تصاعدياً حسب المفتاح (وهو مصمَّم
 * ليكون قابلاً للترتيب نصياً: YYYY-MM-DD / YYYY-Www / YYYY-MM).
 */
export function salesByPeriod(
  lines: SoldLine[],
  period: "day" | "week" | "month",
  now?: Date
): SalesByPeriodEntry[] {
  void now; // غير مستخدَم حالياً — التجميع مبني على shippedAt لكل سطر لا على "الآن"؛ مُبقًى للتوقيع القياسي (حَقن الوقت) في هذا الملف.

  const byKey = new Map<string, { total: number; quantity: number; orderKeys: Set<string> }>();

  for (const line of lines) {
    const key = periodKey(normalizeDate(line.shippedAt), period);
    const entry = byKey.get(key) ?? { total: 0, quantity: 0, orderKeys: new Set<string>() };
    entry.total += line.lineTotal;
    entry.quantity += line.quantity;
    if (!line.isReturn) entry.orderKeys.add(orderKey(line));
    byKey.set(key, entry);
  }

  return Array.from(byKey.entries())
    .map(([key, v]) => ({ key, total: v.total, orders: v.orderKeys.size, quantity: v.quantity }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ── الأكثر مبيعاً ─────────────────────────────────────────────────────────────

export interface TopSellerEntry {
  barcode: string;
  tradeName: string;
  quantity: number;
  total: number;
}

/** الأكثر مبيعاً — بالقيمة أو بالكمية. limit الافتراضي 10. */
export function topSellers(
  lines: SoldLine[],
  by: "value" | "quantity",
  limit: number = 10
): TopSellerEntry[] {
  const byBarcode = new Map<string, TopSellerEntry>();

  for (const line of lines) {
    const entry = byBarcode.get(line.barcode) ?? {
      barcode: line.barcode,
      tradeName: line.tradeName,
      quantity: 0,
      total: 0,
    };
    entry.quantity += line.quantity;
    entry.total += line.lineTotal;
    if (line.tradeName && line.tradeName !== line.barcode) entry.tradeName = line.tradeName;
    byBarcode.set(line.barcode, entry);
  }

  const sorted = Array.from(byBarcode.values()).sort((a, b) =>
    by === "value" ? b.total - a.total : b.quantity - a.quantity
  );

  return sorted.slice(0, Math.max(0, limit));
}

// ── الأصناف الراكدة ───────────────────────────────────────────────────────────

export interface SlowMoverEntry {
  barcode: string;
  tradeName: string;
  lastSoldAt: Date | null;
  daysSince: number | null;
}

/**
 * الأصناف الراكدة: كل صنف في الكتالوج لم يُطلب (ضمن lines المُمرَّرة) منذ
 * sinceDays يوماً — بما فيها الأصناف التي لم تُبَع إطلاقاً (lastSoldAt: null،
 * daysSince: null)، وهي **يجب أن تظهر دائماً** بصرف النظر عن sinceDays: صنف
 * لم يُبَع قط أكثر ركوداً من أي صنف بيع تاريخ محدَّد له، فاستبعاده هو الخطأ
 * الأسهل وقوعاً هنا.
 */
export function slowMovers(
  catalog: Array<{ barcode: string; tradeName: string }>,
  lines: SoldLine[],
  sinceDays: number,
  now?: Date
): SlowMoverEntry[] {
  const current = now ?? new Date();

  const lastSoldByBarcode = new Map<string, Date>();
  for (const line of lines) {
    if (line.isReturn) continue;
    const shippedAt = normalizeDate(line.shippedAt);
    const existing = lastSoldByBarcode.get(line.barcode);
    if (!existing || shippedAt.getTime() > existing.getTime()) {
      lastSoldByBarcode.set(line.barcode, shippedAt);
    }
  }

  const result: SlowMoverEntry[] = [];
  for (const item of catalog) {
    const lastSoldAt = lastSoldByBarcode.get(item.barcode) ?? null;
    const daysSince =
      lastSoldAt !== null ? Math.floor((current.getTime() - lastSoldAt.getTime()) / MS_PER_DAY) : null;

    if (daysSince === null || daysSince >= sinceDays) {
      result.push({ barcode: item.barcode, tradeName: item.tradeName, lastSoldAt, daysSince });
    }
  }

  // لم يُبَع إطلاقاً أولاً (الأكثر ركوداً منطقياً)، ثم الأقدم بيعاً فالأحدث.
  result.sort((a, b) => {
    if (a.daysSince === null && b.daysSince === null) return 0;
    if (a.daysSince === null) return -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });

  return result;
}

// ── نسبة التلبية ──────────────────────────────────────────────────────────────

export interface FulfilmentInputItem {
  status: string;
  quantity: number;
  quotedQuantity: number | null;
}

export interface FulfilmentRateResult {
  fullyFilled: number;
  partial: number;
  outOfStock: number;
  totalLines: number;
  ratePercent: number;
}

/**
 * نسبة التلبية — أهم مؤشر جودة لمذخر. المتوقَع أن يُمرَّر هنا فقط بنود
 * مَحسومة فعلياً (AVAILABLE/PARTIAL/OUT_OF_STOCK) — استبعاد REQUESTED
 * (لم يُحكَم عليه بعد) هو مسؤولية مسار الـ API قبل الاستدعاء (انظر
 * getFulfilmentItems في warehouse-report-data.ts)، فهذه الدالة لا تحمل قرار
 * "هل هذا البند جاهز للقياس؟" — لكنها تبقى آمنة دفاعياً: أي status غير
 * AVAILABLE/PARTIAL يُحتسَب outOfStock (غير مكتمل) بدل أن يُسقَط بصمت.
 *
 * ratePercent = fullyFilled ÷ totalLines × 100، مقرَّبة لمنزلة عشرية واحدة.
 * صفر بنود → 0 دائماً، لا NaN ولا قسمة على صفر.
 */
export function fulfilmentRate(items: FulfilmentInputItem[]): FulfilmentRateResult {
  let fullyFilled = 0;
  let partial = 0;
  let outOfStock = 0;

  for (const item of items) {
    if (item.status === "AVAILABLE") fullyFilled += 1;
    else if (item.status === "PARTIAL") partial += 1;
    else outOfStock += 1;
  }

  const totalLines = items.length;
  const ratePercent = totalLines === 0 ? 0 : round1((fullyFilled / totalLines) * 100);

  return { fullyFilled, partial, outOfStock, totalLines, ratePercent };
}

// ── هامش الربح لكل صنف ────────────────────────────────────────────────────────

export interface MarginByItemEntry {
  costComplete: boolean;
  barcode: string;
  tradeName: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number | null;
}

/**
 * هامش الربح لكل صنف. costPrice غائب أو صفر يعني "تكلفة غير معروفة" — ليس
 * تكلفة صفرية فعلية — لذا marginPercent يكون null (مجهول) في هذه الحالة،
 * **وليس 100%**: إظهار هامش 100% لأن التكلفة لم تُسجَّل كان سيضلّل المستخدم
 * فعلياً (قرار تسعير خاطئ). الإيراد يبقى يُعرَض دائماً حتى مع تكلفة مجهولة —
 * ما هو معروف يُعرَض، وما هو غير معروف يُعلَّم بوضوح لا يُخترَع.
 *
 * ميزة البونص: التكلفة (عند معرفتها) تُحتسَب على إجمالي الوحدات **الخارجة
 * فعلياً من المخزون** (مباعة + بونص، عبر totalUnitsLeavingStock) لا الكمية
 * المباعة وحدها — الإيراد (revenue) يبقى من lineTotal حصراً (لا يتغيّر ببونص
 * إطلاقاً، هذا هو معنى "بلا إيراد"). مثال: بيع 10 بسعر 1000 وتكلفة 600 مع
 * بونص 1 → الإيراد 10,000، والتكلفة 11×600=6,600 (لا 10×600=6,000)، فالهامش
 * 3,400 أي 34% — وليس 40%. مذخر يمنح 10% بونصاً يجب أن يرى هامشه ينخفض، لا
 * أن يُستبعَد البونص من الحساب فيبدو الهامش وكأن البونص لم يُمنَح أصلاً.
 */
export function marginByItem(lines: SoldLine[]): MarginByItemEntry[] {
  interface Acc {
    tradeName: string;
    revenue: number;
    cost: number;
    costKnown: boolean;
    missingCost: boolean;
  }

  const byBarcode = new Map<string, Acc>();

  for (const line of lines) {
    const acc = byBarcode.get(line.barcode) ?? {
      tradeName: line.tradeName,
      revenue: 0,
      cost: 0,
      costKnown: false,
      missingCost: false,
    };
    if (line.tradeName && line.tradeName !== line.barcode) acc.tradeName = line.tradeName;
    acc.revenue += line.lineTotal;

    if (typeof line.costTotal === 'number' && Number.isFinite(line.costTotal)) {
      acc.cost += line.costTotal;
      acc.costKnown = true;
    } else if (typeof line.costPrice === "number" && Number.isFinite(line.costPrice) && line.costPrice > 0) {
      const unitsLeavingStock = totalUnitsLeavingStock({
        soldQuantity: line.quantity,
        bonusQuantity: line.bonusQuantity ?? 0,
      });
      acc.cost += line.costPrice * unitsLeavingStock;
      acc.costKnown = true;
    } else {
      acc.missingCost = true;
    }

    byBarcode.set(line.barcode, acc);
  }

  return Array.from(byBarcode.entries()).map(([barcode, acc]) => {
    const margin = acc.revenue - acc.cost;
    const marginPercent = acc.costKnown && !acc.missingCost && acc.revenue > 0 ? round1((margin / acc.revenue) * 100) : null;
    return { barcode, tradeName: acc.tradeName, revenue: acc.revenue, cost: acc.cost, costComplete: acc.costKnown && !acc.missingCost, margin, marginPercent };
  });
}

// ── مخاطر الصلاحية ────────────────────────────────────────────────────────────

export interface ExpiryRiskBucketTotal {
  quantity: number;
  value: number;
}

export interface ExpiryRiskItem {
  tradeName: string;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  value: number;
  bucket: ExpiryBucket;
}

export interface ExpiryRiskResult {
  byBucket: Record<ExpiryBucket, ExpiryRiskBucketTotal>;
  items: ExpiryRiskItem[];
}

/**
 * مخاطر الصلاحية: قيمة البضاعة حسب فئة الانتهاء — الفئات وحدودها مأخوذة
 * حصراً من expiryBucket() في warehouse-stock.ts (لا تُكرَّر العتبات هنا).
 * value لكل دفعة = quantity × costPrice.
 */
export function expiryRisk(
  batches: Array<{ quantity: number; expiryDate: Date | string; costPrice: number; tradeName: string; batchNumber: string }>,
  now?: Date
): ExpiryRiskResult {
  const byBucket: Record<ExpiryBucket, ExpiryRiskBucketTotal> = {
    EXPIRED: { quantity: 0, value: 0 },
    CRITICAL: { quantity: 0, value: 0 },
    WARNING: { quantity: 0, value: 0 },
    OK: { quantity: 0, value: 0 },
  };

  const items: ExpiryRiskItem[] = [];

  for (const batch of batches) {
    const bucket = expiryBucket(batch.expiryDate, now);
    const value = batch.quantity * batch.costPrice;

    byBucket[bucket].quantity += batch.quantity;
    byBucket[bucket].value += value;

    items.push({
      tradeName: batch.tradeName,
      batchNumber: batch.batchNumber,
      expiryDate: normalizeDate(batch.expiryDate),
      quantity: batch.quantity,
      value,
      bucket,
    });
  }

  return { byBucket, items };
}

// ── مبيعات لكل صيدلية ─────────────────────────────────────────────────────────

export interface SalesByCustomerEntry {
  organizationId: string;
  pharmacyName: string;
  total: number;
  orders: number;
  lastOrderAt: Date;
}

/** مبيعات لكل صيدلية — orders يُعَدّ عبر نفس المفتاح الاصطناعي في orderKey() أعلاه. */
export function salesByCustomer(lines: SoldLine[]): SalesByCustomerEntry[] {
  interface Acc {
    pharmacyName: string;
    total: number;
    orderKeys: Set<string>;
    lastOrderAt: Date;
  }

  const byOrg = new Map<string, Acc>();

  for (const line of lines) {
    if (!line.organizationId) continue; // Inventory cost-only movements are not customer sales.
    const shippedAt = normalizeDate(line.shippedAt);
    const acc = byOrg.get(line.organizationId) ?? {
      pharmacyName: line.pharmacyName ?? "",
      total: 0,
      orderKeys: new Set<string>(),
      lastOrderAt: shippedAt,
    };
    acc.pharmacyName = line.pharmacyName ?? acc.pharmacyName;
    acc.total += line.lineTotal;
    if (!line.isReturn) acc.orderKeys.add(orderKey(line));
    if (shippedAt.getTime() > acc.lastOrderAt.getTime()) acc.lastOrderAt = shippedAt;
    byOrg.set(line.organizationId, acc);
  }

  return Array.from(byOrg.entries())
    .map(([organizationId, acc]) => ({
      organizationId,
      pharmacyName: acc.pharmacyName,
      total: acc.total,
      orders: acc.orderKeys.size,
      lastOrderAt: acc.lastOrderAt,
    }))
    .sort((a, b) => b.total - a.total);
}
