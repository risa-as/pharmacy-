/**
 * warehouse-report-data.ts
 *
 * المرحلة 4 من نظام المذاخر B2B (التقارير والأداء): طبقة استعلام غير نقية
 * (تستورد Prisma) تُنتج المدخلات التي تستهلكها دوال app/lib/warehouse-reports.ts
 * النقية. غير نقية عمداً — بخلاف warehouse-reports.ts الذي يبقى نقياً بالكامل
 * كي يُختبَر وحدوياً تحت إعداد vitest في هذا المستودع (لا يحل alias "@/*")،
 * نفس فلسفة الفصل المتّبعة في warehouse-permission-guard.ts وwarehouse-context.ts.
 *
 * هذا هو الموقع الوحيد الذي يبني SoldLine[] — كل مسارات
 * GET /api/warehouse-portal/reports/* تستدعيه بدل إعادة كتابة نفس الانضمام
 * (order → items → drug، وربط costPrice من الكتالوج) سبع مرات، فلا تتفرّق
 * قاعدة "من أين تأتي بيانات المبيعات؟" بين التقارير كما تفرّقت سابقاً قاعدة
 * "قيمة السطر الفعلية" بين مسار العرض ومسار الاعتماد قبل إصلاح effectiveLine()
 * (انظر التعليق الحرج في warehouse-quote.ts).
 *
 * مصدر بنود المبيعات: طلبات بحالة SHIPPED أو DELIVERED فقط — الطلب يصبح
 * "مبيعاً" فعلياً لحظة الشحن (خصم المخزون يحدث حينها، انظر
 * app/api/warehouse-portal/orders/[id]/shipping/route.ts)؛ DELIVERED لاحقة
 * على نفس الخط الزمني لنفس الطلب ولا تضيف بنوداً جديدة (انظر
 * warehouse-order-state.ts: SHIPPED → DELIVERED هو الانتقال الوحيد الممكن،
 * بلا عودة وبلا CANCELLED بعد الشحن). كمية/قيمة كل سطر تُحسَب **حصراً** عبر
 * effectiveLine() من warehouse-quote.ts — لا حساب مستقل هنا بأي شكل، فسطر
 * OUT_OF_STOCK (كميته الفعلية صفر) يُستبعَد تلقائياً من كل تقرير.
 *
 * تاريخ الشحن (shippedAt): يُؤخَذ من WarehouseOrderEvent بنوع 'SHIPPED' —
 * وليس من order.updatedAt، الذي يتغيّر لاحقاً مرة أخرى عند الانتقال إلى
 * DELIVERED فيُفسِد أي تجميع/ترتيب زمني لو اعتُمِد عليه بدلاً من ذلك. هذا
 * الحدث فريد لكل طلب مُشحَن فعلياً (transition واحد فقط SHIPPED في كامل عمر
 * الطلب)، فـ take:1 آمن هنا.
 *
 * costPrice: يأتي من WarehouseCatalogItem.costPrice المطابق (warehouseId +
 * barcode) **وقت توليد التقرير**، لا سعر التكلفة الفعلي وقت الشحن (لا يوجد
 * عمود تأريخ تكلفة على الكتالوج) — فهامش الربح في التقارير تقريبي لأي صنف
 * تغيّرت تكلفته لاحقاً. موثَّق أيضاً في تعليق GET /reports/margins.
 */
import { prisma } from '@/app/lib/prisma';
import { effectiveLine, type OrderLineStatus } from '@/app/lib/warehouse-quote';
import type { SoldLine } from '@/app/lib/warehouse-reports';
import { computeFieldSaleProfit, type CommissionBasisValue } from '@/app/lib/warehouse-reps';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** سقف نطاق التاريخ لأي تقرير — يمنع استعلاماً بلا حدود يمسح كامل تاريخ المذخر. */
export const MAX_REPORT_RANGE_DAYS = 730;
const DEFAULT_REPORT_RANGE_DAYS = 90;

export interface ReportDateRange {
    from: Date;
    to: Date;
}

/**
 * يحسم from/to من query params لمسارات التقارير. الافتراضي: آخر 90 يوماً
 * تنتهي عند "الآن" (أو عند `to` المُمرَّر إن كان صالحاً). قواعد التساهل مع
 * مدخلات تالفة (fail-soft لا fail-hard — هذه تقارير قراءة فقط، رفض الطلب على
 * تاريخ مشوَّه أسوأ من تجاهله والعودة للافتراضي):
 *   - to تالف/غائب → الآن.
 *   - from تالف/غائب → to ناقص 90 يوماً.
 *   - from > to → يُتجاهَل ويُستبدَل بالافتراضي (نفس القاعدة أعلاه).
 *   - from أبعد من MAX_REPORT_RANGE_DAYS قبل to → يُقصّ إلى هذا الحد بصرف
 *     النظر عمّا طُلِب — هذا هو السقف الذي يمنع استعلاماً غير محدود.
 */
export function resolveReportDateRange(
    fromParam: string | null | undefined,
    toParam: string | null | undefined,
    now: Date = new Date()
): ReportDateRange {
    const parsedTo = toParam ? new Date(toParam) : null;
    const to = parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : now;

    const defaultFrom = new Date(to.getTime() - DEFAULT_REPORT_RANGE_DAYS * MS_PER_DAY);
    const parsedFrom = fromParam ? new Date(fromParam) : null;
    let from = parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : defaultFrom;

    if (from.getTime() > to.getTime()) from = defaultFrom;

    const minFrom = new Date(to.getTime() - MAX_REPORT_RANGE_DAYS * MS_PER_DAY);
    if (from.getTime() < minFrom.getTime()) from = minFrom;

    return { from, to };
}

/**
 * سقف صفوف دفاعي لكل استعلام تقرير — بخلاف MAX_REPORT_RANGE_DAYS (يحدّ نطاق
 * التاريخ)، هذا يحدّ عدد الصفوف بصرف النظر عن النطاق، فمذخر بكتالوج أو سجل
 * مبيعات ضخم جداً استثنائياً لا يُحمَّل بالكامل إلى الذاكرة/المتصفح. بعيد جداً
 * عن أي حجم بيانات فعلي حالي في المنصة (الكتالوج الأكبر ~2700 صنف، إجمالي
 * المبيعات على مستوى المنصة كلها ~10 آلاف)، فلا يقصّ بيانات حقيقية اليوم.
 */
const REPORT_ROW_CAP = 5000;

/** كل بنود كتالوج هذا المذخر (باركود + اسم تجاري) — أساس slowMovers الذي يحتاج الكتالوج كاملاً لا المُباع فقط. */
export async function getWarehouseCatalogForReports(
    warehouseId: string
): Promise<Array<{ barcode: string; tradeName: string }>> {
    const items = await prisma.warehouseCatalogItem.findMany({
        where: { warehouseId },
        select: { barcode: true, drug: { select: { tradeName: true } } },
        take: REPORT_ROW_CAP,
    });
    return items.map((it) => ({ barcode: it.barcode, tradeName: it.drug.tradeName }));
}

/**
 * بنود المبيعات (SoldLine[]) لمذخر ضمن نطاق تاريخ — أساس تقارير المبيعات/
 * الأكثر مبيعاً/الراكد/الهامش/العملاء. انظر تعليق رأس الملف لمصدر كل حقل.
 */
export async function getSoldLines(warehouseId: string, range: ReportDateRange): Promise<SoldLine[]> {
    const orders = await prisma.warehouseOrder.findMany({
        where: {
            warehouseId,
            status: { in: ['SHIPPED', 'DELIVERED'] },
            events: { some: { type: 'SHIPPED', createdAt: { gte: range.from, lte: range.to } } },
        },
        take: REPORT_ROW_CAP,
        select: {
            updatedAt: true,
            branch: { select: { organizationId: true, organization: { select: { name: true } } } },
            items: {
                select: {
                    status: true,
                    quantity: true,
                    unitPrice: true,
                    quotedPrice: true,
                    quotedQuantity: true,
                    bonusQuantity: true,
                    drug: { select: { barcode: true, tradeName: true } },
                },
            },
            events: {
                where: { type: 'SHIPPED' },
                select: { createdAt: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
            },
        },
    });

    const barcodes = new Set<string>();
    for (const order of orders) {
        for (const item of order.items) barcodes.add(item.drug.barcode);
    }

    const catalogItems =
        barcodes.size > 0
            ? await prisma.warehouseCatalogItem.findMany({
                  where: { warehouseId, barcode: { in: Array.from(barcodes) } },
                  select: { barcode: true, costPrice: true },
              })
            : [];
    const costByBarcode = new Map(catalogItems.map((c) => [c.barcode, c.costPrice]));

    const lines: SoldLine[] = [];
    for (const order of orders) {
        // احتياط دفاعي فقط: كل طلب هنا حالته SHIPPED/DELIVERED فيَملك حتماً حدث
        // SHIPPED واحداً على الأقل — لكن لا نفترض ذلك بصمت لو فشل ترحيل بيانات قديم.
        const shippedAt = order.events[0]?.createdAt ?? order.updatedAt;
        const organizationId = order.branch.organizationId;
        const pharmacyName = order.branch.organization.name;

        for (const item of order.items) {
            const eff = effectiveLine({
                status: item.status as OrderLineStatus,
                quantity: item.quantity,
                quotedQuantity: item.quotedQuantity,
                unitPrice: item.unitPrice,
                quotedPrice: item.quotedPrice,
            });
            if (eff.quantity <= 0) continue; // OUT_OF_STOCK أو كمية فعلية صفرية — ليس مبيعاً.

            lines.push({
                barcode: item.drug.barcode,
                tradeName: item.drug.tradeName,
                quantity: eff.quantity,
                lineTotal: eff.lineTotal,
                costPrice: costByBarcode.get(item.drug.barcode) ?? 0,
                // ميزة البونص: يصل marginByItem كما هو — لا حساب مستقل هنا. سطر
                // OUT_OF_STOCK لا يصل هذه النقطة أصلاً (استُبعد أعلاه بـ eff.quantity
                // <= 0 continue)، فبونصه العالق (إن وُجد) لا يدخل أي تقرير.
                bonusQuantity: item.bonusQuantity ?? 0,
                organizationId,
                pharmacyName,
                shippedAt,
            });
        }
    }

    return lines;
}

/**
 * بنود الطلب لنطاق تاريخ (بحسب تاريخ إنشاء الطلب) — أساس تقرير نسبة التلبية.
 * تُستبعَد الطلبات التي لم تصل مرحلة التسعير بعد (DRAFT/SENT/UNDER_REVIEW —
 * لا حكم بعد على أصنافها) وCANCELLED (أُلغيت، لا تعكس جودة تلبية فعلية)، وكل
 * بند بحالة REQUESTED ضمن الطلبات المتبقية (لم يُحكَم عليه لسبب آخر) — هذا هو
 * ما تفترضه fulfilmentRate() في warehouse-reports.ts (انظر تعليقها).
 */
export async function getFulfilmentItems(
    warehouseId: string,
    range: ReportDateRange
): Promise<Array<{ status: string; quantity: number; quotedQuantity: number | null }>> {
    const orders = await prisma.warehouseOrder.findMany({
        where: {
            warehouseId,
            status: { notIn: ['DRAFT', 'SENT', 'UNDER_REVIEW', 'CANCELLED'] },
            createdAt: { gte: range.from, lte: range.to },
        },
        take: REPORT_ROW_CAP,
        select: {
            items: { select: { status: true, quantity: true, quotedQuantity: true } },
        },
    });

    const items: Array<{ status: string; quantity: number; quotedQuantity: number | null }> = [];
    for (const order of orders) {
        for (const item of order.items) {
            if (item.status === 'REQUESTED') continue;
            items.push({ status: item.status, quantity: item.quantity, quotedQuantity: item.quotedQuantity });
        }
    }
    return items;
}

/** كل دفعات هذا المذخر بكمية حية (> 0) — أساس تقرير مخاطر الصلاحية. دفعات مستهلَكة بالكامل لا قيمة مخاطرة فيها. */
export async function getWarehouseBatchesForReports(warehouseId: string): Promise<
    Array<{ quantity: number; expiryDate: Date; costPrice: number; tradeName: string; batchNumber: string }>
> {
    const batches = await prisma.warehouseBatch.findMany({
        where: { catalogItem: { warehouseId }, quantity: { gt: 0 } },
        take: REPORT_ROW_CAP,
        select: {
            quantity: true,
            expiryDate: true,
            costPrice: true,
            batchNumber: true,
            catalogItem: { select: { drug: { select: { tradeName: true } } } },
        },
    });
    return batches.map((b) => ({
        quantity: b.quantity,
        expiryDate: b.expiryDate,
        costPrice: b.costPrice,
        tradeName: b.catalogItem.drug.tradeName,
        batchNumber: b.batchNumber,
    }));
}

// ── المندوبون (أداء الفترة) ──────────────────────────────────────────────
// مصدر مشترك لصف GET /api/warehouse-portal/reps (قائمة المندوبين + عمولة
// الفترة) وGET /api/warehouse-portal/reports/reps (تقرير المندوبين) — كلاهما
// يحتاج نفس التجميع بالضبط (مبيعات/ربح/تحصيل لكل مندوب ضمن فترة)، فلا يُكتب
// مرتين. الإيراد/الكلفة/الربح لكل مندوب يُشتقّان حصراً عبر computeFieldSaleProfit
// من app/lib/warehouse-reps.ts (نفس قاعدة بونص «بلا إيراد لكن كلفة كاملة»
// المُقرَّرة هناك) — لا حساب هامش موازٍ هنا. حساب العمولة نفسه (computeCommission)
// يبقى مسؤولية المُستدعي، فهذه الدالة تُرجِع فقط الأسس الثلاثة الخام.

export interface RepPerformanceRow {
    repId: string;
    name: string;
    commissionBasis: CommissionBasisValue;
    commissionRate: number;
    salesTotal: number;
    profitTotal: number;
    collectedTotal: number;
}

export async function getRepPerformance(
    warehouseId: string,
    range: ReportDateRange
): Promise<RepPerformanceRow[]> {
    const reps = await prisma.warehouseRep.findMany({
        where: { warehouseId },
        select: { id: true, name: true, commissionBasis: true, commissionRate: true },
    });
    const repIds = reps.map((r) => r.id);

    const [sales, collections] = repIds.length > 0
        ? await Promise.all([
              prisma.warehouseFieldSale.findMany({
                  where: { repId: { in: repIds }, soldAt: { gte: range.from, lte: range.to } },
                  take: REPORT_ROW_CAP,
                  select: {
                      repId: true,
                      items: { select: { quantity: true, bonusQuantity: true, unitPrice: true, unitCost: true } },
                  },
              }),
              prisma.warehouseRepCollection.groupBy({
                  by: ['repId'],
                  where: { repId: { in: repIds }, collectedAt: { gte: range.from, lte: range.to } },
                  _sum: { amount: true },
              }),
          ])
        : [[], []];

    const itemsByRep = new Map<string, { quantity: number; bonusQuantity: number; unitPrice: number; unitCost: number }[]>();
    for (const sale of sales) {
        const list = itemsByRep.get(sale.repId) ?? [];
        list.push(...sale.items);
        itemsByRep.set(sale.repId, list);
    }
    const collectedByRep = new Map(collections.map((c) => [c.repId, c._sum.amount ?? 0]));

    return reps.map((rep) => {
        const profit = computeFieldSaleProfit(itemsByRep.get(rep.id) ?? []);
        return {
            repId: rep.id,
            name: rep.name,
            commissionBasis: rep.commissionBasis as CommissionBasisValue,
            commissionRate: rep.commissionRate,
            salesTotal: profit.revenue,
            profitTotal: profit.profit,
            collectedTotal: collectedByRep.get(rep.id) ?? 0,
        };
    });
}
