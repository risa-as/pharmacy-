export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from '@/app/lib/tenant-utils';

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
        const [saleItems, allInventory, soldIn90Days, expiringBatches] = await Promise.all([
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
            // Inventory — provides cost per drug (used as primary cost source, matching web profits page)
            prisma.inventory.findMany({
                where: branchFilter,
                include: {
                    drug:    { select: { id: true, tradeName: true, barcode: true } },
                    batches: { select: { quantity: true, costPrice: true } },
                    branch:  { select: { name: true } },
                },
            }),
            // Drugs sold in the last 90 days (for dead-stock detection)
            prisma.saleItem.findMany({
                where: {
                    sale: { createdAt: { gte: deadStockWindow }, ...branchFilter },
                },
                select: { drugId: true },
                distinct: ['drugId'],
            }),
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
        // instead of saleItem.cost (which defaults to 0 and is often unpopulated)
        const costMap = new Map<string, number>();
        for (const inv of allInventory) {
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
        const soldDrugIds = new Set(soldIn90Days.map((i: any) => i.drugId));
        const deadStock = allInventory
            .filter((inv: any) => {
                const stock = inv.batches.reduce((s: number, b: any) => s + b.quantity, 0);
                return stock > 0 && !soldDrugIds.has(inv.drugId);
            })
            .map((inv: any) => ({
                drugId:         inv.drugId,
                tradeName:      inv.drug?.tradeName || 'Unknown',
                barcode:        inv.drug?.barcode   || '',
                branch:         inv.branch?.name    || '',
                currentStock:   inv.batches.reduce((s: number, b: any) => s + b.quantity, 0),
                estimatedValue: inv.batches.reduce((s: number, b: any) => s + b.quantity * (b.costPrice || inv.cost || 0), 0),
            }));
        const totalDeadStockValue = deadStock.reduce((s: number, d: any) => s + d.estimatedValue, 0);

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
                deadStockCount:      deadStock.length,
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
