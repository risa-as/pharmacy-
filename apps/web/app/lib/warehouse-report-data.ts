/** Complete paged sales/return data. Shipment costs use immutable movement snapshots; field sales use their recorded item costs. Unknown historical costs stay unknown. */
import { readWarehousePages } from './warehouse-pagination';
import type { Prisma } from '@prisma/client';
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
    const parsedTo = toParam ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(toParam) ? `${toParam}T23:59:59.999+03:00` : toParam) : null;
    const to = parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : now;

    const defaultFrom = new Date(to.getTime() - DEFAULT_REPORT_RANGE_DAYS * MS_PER_DAY);
    const parsedFrom = fromParam ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? `${fromParam}T00:00:00+03:00` : fromParam) : null;
    let from = parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : defaultFrom;

    if (from.getTime() > to.getTime()) from = defaultFrom;

    const minFrom = new Date(to.getTime() - MAX_REPORT_RANGE_DAYS * MS_PER_DAY);
    if (from.getTime() < minFrom.getTime()) from = minFrom;

    return { from, to };
}




/** كل بنود كتالوج هذا المذخر (باركود + اسم تجاري) — أساس slowMovers الذي يحتاج الكتالوج كاملاً لا المُباع فقط. */
export async function getWarehouseCatalogForReports(
    warehouseId: string
): Promise<Array<{ barcode: string; tradeName: string }>> {
    const items = await readWarehousePages(page => prisma.warehouseCatalogItem.findMany({
        ...page,
        where: { warehouseId },
        select: { id: true, barcode: true, drug: { select: { tradeName: true } } },
    }));
    return items.map((it) => ({ barcode: it.barcode, tradeName: it.drug.tradeName }));
}

/**
 * بنود المبيعات (SoldLine[]) لمذخر ضمن نطاق تاريخ — أساس تقارير المبيعات/
 * الأكثر مبيعاً/الراكد/الهامش/العملاء. انظر تعليق رأس الملف لمصدر كل حقل.
 */
export async function getSoldLines(warehouseId: string, range: ReportDateRange): Promise<SoldLine[]> {
    return prisma.$transaction(tx => getSoldLinesSnapshot(tx, warehouseId, range), { isolationLevel: 'RepeatableRead', maxWait: 10000, timeout: 60000 });
}
async function getSoldLinesSnapshot(db: Prisma.TransactionClient, warehouseId: string, range: ReportDateRange): Promise<SoldLine[]> {
    const orders = await readWarehousePages(page => db.warehouseOrder.findMany({
        ...page,
        where: {
            warehouseId,
            status: { in: ['SHIPPED', 'DELIVERED'] },
            events: { some: { type: 'SHIPPED', createdAt: { gte: range.from, lte: range.to } } },
        },
        select: { id: true,
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
    }));

    const moves = await readWarehousePages(page => db.warehouseStockMove.findMany({ ...page,
        where: { catalogItem: { warehouseId }, type: 'SHIPMENT', createdAt: { gte: range.from, lte: range.to } },
        select: { id: true, orderId: true, quantity: true, unitCost: true, catalogItem: { select: { barcode: true } } } }));
    const costByLine = new Map<string, number>();
    const quantityByLine = new Map<string, number>();
    const unknownCosts = new Set<string>();
    for (const move of moves) {
        const key = move.orderId + ':' + move.catalogItem.barcode;
        quantityByLine.set(key, (quantityByLine.get(key) ?? 0) + Math.abs(move.quantity));
        if (move.unitCost === null) unknownCosts.add(key);
        else costByLine.set(key, (costByLine.get(key) ?? 0) + Math.abs(move.quantity) * move.unitCost);
    }

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
            const costKey = order.id + ':' + item.drug.barcode;
            const allUnits = order.items.filter(i => i.drug.barcode === item.drug.barcode).reduce((n,i) => n + (effectiveLine(i).quantity > 0 ? effectiveLine(i).quantity + i.bonusQuantity : 0), 0);
            const costComplete = !unknownCosts.has(costKey) && quantityByLine.get(costKey) === allUnits;

            lines.push({
                barcode: item.drug.barcode,
                tradeName: item.drug.tradeName,
                quantity: eff.quantity,
                lineTotal: eff.lineTotal,
                orderId: order.id,
                costTotal: costComplete ? costByLine.get(costKey)! * (eff.quantity + item.bonusQuantity) / allUnits : undefined,
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

    const fieldSales = await readWarehousePages(page => db.warehouseFieldSale.findMany({ ...page,
        where: { warehouseId, status: { not: 'CANCELLED' }, soldAt: { gte: range.from, lte: range.to } },
        include: { items: { include: { catalogItem: { include: { drug: true } } } } } }));
    for (const sale of fieldSales) for (const item of sale.items) lines.push({
        orderId: 'field:' + sale.id, barcode: item.catalogItem.barcode, tradeName: item.catalogItem.drug.tradeName,
        quantity: item.quantity, bonusQuantity: item.bonusQuantity, lineTotal: item.quantity * item.unitPrice,
        costTotal: (item.quantity + item.bonusQuantity) * item.unitCost,
        organizationId: sale.organizationId ?? ('external:' + sale.customerName), pharmacyName: sale.customerName, shippedAt: sale.soldAt,
    });
    // Recognize the credit on its acceptance date, even when the original sale
    // falls outside the selected range. Quarantined goods have not regained saleable cost.
    const returns = await readWarehousePages(page => db.warehouseReturn.findMany({ ...page,
        where: { warehouseId, status: 'ACCEPTED', acceptedAt: { gte: range.from, lte: range.to } }, include: { items: true } }));
    const returnedBarcodes = Array.from(new Set(returns.flatMap(returned => returned.items.map(item => item.barcode))));
    const names = returnedBarcodes.length ? await readWarehousePages(page => db.warehouseCatalogItem.findMany({ ...page,
        where: { warehouseId, barcode: { in: returnedBarcodes } }, select: { id: true, barcode: true, drug: { select: { tradeName: true } } } })) : [];
    const nameByBarcode = new Map(names.map(item => [item.barcode, item.drug.tradeName]));
    // Portal/legacy orders can contain drugs that never entered this warehouse's
    // catalog. Resolve from the original, tenant-scoped orders even when their
    // shipment date lies outside the selected return-report period.
    const originalOrders = returns.length ? await readWarehousePages(page => db.warehouseOrder.findMany({ ...page,
        where: { warehouseId, id: { in: Array.from(new Set(returns.map(item => item.orderId))) } },
        select: { id: true, items: { select: { drug: { select: { barcode: true, tradeName: true } } } } },
    })) : [];
    for (const order of originalOrders) for (const item of order.items) {
        if (!nameByBarcode.has(item.drug.barcode)) nameByBarcode.set(item.drug.barcode, item.drug.tradeName);
    }
    for (const returned of returns) for (const item of returned.items) lines.push({
        orderId: returned.orderId, isReturn: true, barcode: item.barcode, tradeName: nameByBarcode.get(item.barcode) ?? item.barcode,
        quantity: -item.quantity, lineTotal: -item.quantity * item.unitPrice, costTotal: 0,
        organizationId: returned.organizationId, shippedAt: returned.acceptedAt!,
    });
    const releasedMoves = await readWarehousePages(page => db.warehouseStockMove.findMany({ ...page,
        where: { catalogItem: { warehouseId }, type: 'RETURN', createdAt: { gte: range.from, lte: range.to } },
        include: { catalogItem: { include: { drug: true } } } }));
    for (const move of releasedMoves) lines.push({ orderId: move.orderId ?? move.id, isReturn: true,
        barcode: move.catalogItem.barcode, tradeName: move.catalogItem.drug.tradeName, quantity: 0, lineTotal: 0,
        costTotal: move.unitCost === null ? undefined : -move.quantity * move.unitCost,
        organizationId: '', shippedAt: move.createdAt });

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
    const orders = await readWarehousePages(page => prisma.warehouseOrder.findMany({
        ...page,
        where: {
            warehouseId,
            status: { notIn: ['DRAFT', 'SENT', 'UNDER_REVIEW', 'CANCELLED'] },
            createdAt: { gte: range.from, lte: range.to },
        },
        select: { id: true,
            items: { select: { status: true, quantity: true, quotedQuantity: true } },
        },
    }));

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
    const batches = await readWarehousePages(page => prisma.warehouseBatch.findMany({
        ...page,
        where: { catalogItem: { warehouseId }, quantity: { gt: 0 } },
        select: { id: true,
            quantity: true,
            expiryDate: true,
            costPrice: true,
            batchNumber: true,
            catalogItem: { select: { drug: { select: { tradeName: true } } } },
        },
    }));
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
              readWarehousePages(page => prisma.warehouseFieldSale.findMany({
        ...page,
                  where: { status: { not: 'CANCELLED' }, repId: { in: repIds }, soldAt: { gte: range.from, lte: range.to } },
                  select: { id: true,
                      repId: true,
                      items: { select: { quantity: true, bonusQuantity: true, unitPrice: true, unitCost: true } },
                  },
              })),
              prisma.warehouseRepCollection.groupBy({
                  by: ['repId'],
                  where: { repId: { in: repIds }, fieldSaleId: { not: null }, collectedAt: { gte: range.from, lte: range.to } },
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
