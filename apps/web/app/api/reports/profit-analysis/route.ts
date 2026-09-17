export const dynamic = 'force-dynamic';

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from '@/app/lib/tenant-utils';

/** Dead-stock rows carry the totals of the full result in every row (window functions). */
interface DeadStockRow {
    drugId: string; tradeName: string; barcode: string; branch: string;
    currentStock: number; estimatedValue: number;
    totalCount: number; totalValue: number;
}

/** Most valuable dead items returned; the totals still cover all of them. */
const DEAD_STOCK_LIMIT = 100;

/**
 * Items still in stock that this branch has not sold in the dead-stock window.
 * Done in SQL: loading the whole inventory with its batches and every sold drug
 * id took ~150 s on a 3,000-item branch and timed out the mobile app.
 */
async function queryDeadStock(
    tenantBranchWhere: Record<string, any>,
    branchId: string | null,
    since: Date,
): Promise<DeadStockRow[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (typeof tenantBranchWhere.branchId === 'string') {
        conditions.push(Prisma.sql`i."branchId" = ${tenantBranchWhere.branchId}`);
    }
    const orgId = tenantBranchWhere.branch?.organizationId;
    if (typeof orgId === 'string') {
        conditions.push(Prisma.sql`br."organizationId" = ${orgId}`);
    }
    if (branchId) conditions.push(Prisma.sql`i."branchId" = ${branchId}`);

    return prisma.$queryRaw<DeadStockRow[]>`
        WITH dead AS (
            SELECT
                i."drugId"                                                                   AS "drugId",
                d."tradeName"                                                                AS "tradeName",
                d."barcode"                                                                  AS "barcode",
                br."name"                                                                    AS "branch",
                COALESCE(SUM(b.quantity), 0)::int                                            AS "currentStock",
                COALESCE(SUM(b.quantity * COALESCE(NULLIF(b."costPrice", 0), i.cost, 0)), 0)  AS "estimatedValue"
            FROM "Inventory" i
            JOIN "GlobalDrug" d ON d.id = i."drugId"
            JOIN "Branch" br ON br.id = i."branchId"
            LEFT JOIN "Batch" b ON b."inventoryId" = i.id AND b.quantity > 0
            WHERE ${Prisma.join(conditions, ' AND ')}
              AND NOT EXISTS (
                  SELECT 1 FROM "SaleItem" si
                  JOIN "Sale" s ON s.id = si."saleId"
                  WHERE si."drugId" = i."drugId" AND s."branchId" = i."branchId" AND s."createdAt" >= ${since}
              )
            GROUP BY i.id, i."drugId", d."tradeName", d."barcode", br."name"
            HAVING COALESCE(SUM(b.quantity), 0) > 0
        )
        SELECT dead.*,
               COUNT(*) OVER ()                       AS "totalCount",
               COALESCE(SUM("estimatedValue") OVER (), 0) AS "totalValue"
        FROM dead
        ORDER BY "estimatedValue" DESC
        LIMIT ${DEAD_STOCK_LIMIT}
    `;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');

        const dateFrom = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dateTo = toDate ? new Date(toDate) : new Date();

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const branchFilter = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };

        const deadStockWindow  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const nearExpiryWindow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

        // ── Run all queries in parallel ────────────────────────────────────────
        const [saleItems, deadStockRows, expiringBatches] = await Promise.all([
            // Sale items for the requested period — include sale.branchId for cost map lookup
            prisma.saleItem.findMany({
                where: {
                    sale: { createdAt: { gte: dateFrom, lte: dateTo }, ...branchFilter },
                },
                select: {
                    drugId: true,
                    quantity: true,
                    price: true,
                    cost: true,
                    sale: { select: { branchId: true } },
                    drug: { select: { id: true, tradeName: true, barcode: true } },
                },
            }),
            // Dead stock, computed in the database (see queryDeadStock)
            queryDeadStock(tenantBranchWhere, branchId, deadStockWindow),
            // Batches expiring within 90 days
            prisma.batch.findMany({
                where: {
                    expiryDate: { lte: nearExpiryWindow },
                    quantity:   { gt: 0 },
                    inventory:  branchId ? { branchId } : undefined,
                },
                include: {
                    inventory: {
                        include: {
                            drug:   { select: { tradeName: true, barcode: true } },
                            branch: { select: { name: true } },
                        },
                    },
                },
                orderBy: { expiryDate: 'asc' },
            }),
        ]);

        // ── Cost map: branchId_drugId → inventory.cost ─────────────────────────
        // Same approach as the web profits page — uses current inventory cost price
        // instead of saleItem.cost (which defaults to 0 and is often unpopulated).
        // Only the drugs actually sold in the period are fetched; loading the whole
        // inventory with its batches took ~80 s on a 3,000-item branch.
        const soldDrugIds = Array.from(new Set(saleItems.map((i) => i.drugId)));
        const costRows = soldDrugIds.length > 0
            ? await prisma.inventory.findMany({
                where: { ...branchFilter, drugId: { in: soldDrugIds } },
                select: { branchId: true, drugId: true, cost: true },
            })
            : [];
        const costMap = new Map<string, number>();
        for (const inv of costRows) {
            costMap.set(`${inv.branchId}_${inv.drugId}`, inv.cost);
        }

        // ── 1. Profit per product ──────────────────────────────────────────────
        const profitByDrug = new Map<string, {
            drugId: string; tradeName: string; barcode: string;
            totalRevenue: number; totalCost: number;
            totalQuantitySold: number; profitMargin: number;
        }>();

        for (const item of saleItems) {
            const drugId      = item.drugId;
            const saleBranchId = item.sale.branchId;
            // Prefer inventory.cost (consistent with web profits page),
            // fall back to saleItem.cost only when drug is not in inventory
            const unitCost  = costMap.get(`${saleBranchId}_${drugId}`) ?? item.cost ?? 0;
            const revenue   = item.price * item.quantity;
            const cost      = unitCost * item.quantity;

            const existing = profitByDrug.get(drugId);
            if (existing) {
                existing.totalRevenue       += revenue;
                existing.totalCost          += cost;
                existing.totalQuantitySold  += item.quantity;
                existing.profitMargin = existing.totalRevenue > 0
                    ? Math.round(((existing.totalRevenue - existing.totalCost) / existing.totalRevenue) * 10000) / 100
                    : 0;
            } else {
                profitByDrug.set(drugId, {
                    drugId,
                    tradeName:         item.drug?.tradeName || 'Unknown',
                    barcode:           item.drug?.barcode   || '',
                    totalRevenue:      revenue,
                    totalCost:         cost,
                    totalQuantitySold: item.quantity,
                    profitMargin:      revenue > 0
                        ? Math.round(((revenue - cost) / revenue) * 10000) / 100
                        : 0,
                });
            }
        }

        const profitReport  = Array.from(profitByDrug.values()).sort((a, b) => b.profitMargin - a.profitMargin);
        const totalRevenue  = profitReport.reduce((s, p) => s + p.totalRevenue, 0);
        const totalCost     = profitReport.reduce((s, p) => s + p.totalCost,    0);
        const netProfit     = totalRevenue - totalCost;
        const overallMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0;

        // ── 2. Dead Stock ──────────────────────────────────────────────────────
        const deadStock = deadStockRows.map((row) => ({
            drugId:         row.drugId,
            tradeName:      row.tradeName || 'Unknown',
            barcode:        row.barcode   || '',
            branch:         row.branch    || '',
            currentStock:   Number(row.currentStock),
            estimatedValue: Number(row.estimatedValue),
        }));
        // Totals cover every dead item, not only the rows listed above.
        const deadStockCount      = Number(deadStockRows[0]?.totalCount ?? 0);
        const totalDeadStockValue = Number(deadStockRows[0]?.totalValue ?? 0);

        // ── 3. Near-Expiry Loss ────────────────────────────────────────────────
        const now = Date.now();
        const nearExpiryLoss = expiringBatches.map((batch: any) => ({
            drugId:         batch.inventory?.drugId,
            tradeName:      batch.inventory?.drug?.tradeName || 'Unknown',
            barcode:        batch.inventory?.drug?.barcode   || '',
            branch:         batch.inventory?.branch?.name    || '',
            batchNumber:    batch.batchNumber,
            quantity:       batch.quantity,
            expiryDate:     batch.expiryDate,
            isExpired:      batch.expiryDate < new Date(),
            daysRemaining:  Math.ceil((batch.expiryDate.getTime() - now) / (1000 * 60 * 60 * 24)),
            estimatedLoss:  batch.quantity * (batch.costPrice || batch.inventory?.cost || 0),
        }));
        const totalNearExpiryLoss = nearExpiryLoss.reduce((s: number, b: any) => s + b.estimatedLoss, 0);

        return NextResponse.json({
            period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
            summary: {
                totalRevenue:        Math.round(totalRevenue        * 100) / 100,
                totalCost:           Math.round(totalCost           * 100) / 100,
                netProfit:           Math.round(netProfit           * 100) / 100,
                overallMargin,
                deadStockCount,
                totalDeadStockValue: Math.round(totalDeadStockValue * 100) / 100,
                nearExpiryCount:     nearExpiryLoss.length,
                totalNearExpiryLoss: Math.round(totalNearExpiryLoss * 100) / 100,
            },
            profitByProduct: profitReport,
            deadStock,
            nearExpiryLoss,
        });
    } catch (error) {
        console.error("Profit analysis error:", error);
        return NextResponse.json({ message: "Failed to generate profit analysis" }, { status: 500 });
    }
}
