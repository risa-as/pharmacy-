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

        // Date range for profit calculations
        const dateFrom = fromDate ? new Date(fromDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        const dateTo = toDate ? new Date(toDate) : new Date();

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const branchFilter = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };

        // 1. Profit Margin per Product
        const saleItems = await prisma.saleItem.findMany({
            where: {
                sale: {
                    createdAt: { gte: dateFrom, lte: dateTo },
                    ...branchFilter
                }
            },
            include: {
                drug: {
                    select: {
                        id: true,
                        tradeName: true,
                        barcode: true
                    }
                }
            }
        });

        // Calculate profit per drug
        const profitByDrug = new Map<string, {
            drugId: string;
            tradeName: string;
            barcode: string;
            totalRevenue: number;
            totalCost: number;
            totalQuantitySold: number;
            profitMargin: number;
        }>();

        for (const item of saleItems) {
            const drugId = item.drugId;
            const costPrice = item.cost || 0;
            const revenue = item.price * item.quantity;
            const cost = costPrice * item.quantity;

            const existing = profitByDrug.get(drugId);
            if (existing) {
                existing.totalRevenue += revenue;
                existing.totalCost += cost;
                existing.totalQuantitySold += item.quantity;
                existing.profitMargin = existing.totalRevenue > 0
                    ? Math.round(((existing.totalRevenue - existing.totalCost) / existing.totalRevenue) * 10000) / 100
                    : 0;
            } else {
                const margin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0;
                profitByDrug.set(drugId, {
                    drugId,
                    tradeName: item.drug?.tradeName || 'Unknown',
                    barcode: item.drug?.barcode || '',
                    totalRevenue: revenue,
                    totalCost: cost,
                    totalQuantitySold: item.quantity,
                    profitMargin: margin,
                });
            }
        }

        const profitReport = Array.from(profitByDrug.values()).sort((a: any, b: any) => b.profitMargin - a.profitMargin);

        // Summary totals
        const totalRevenue = profitReport.reduce((sum, p) => sum + p.totalRevenue, 0);
        const totalCost = profitReport.reduce((sum, p) => sum + p.totalCost, 0);
        const netProfit = totalRevenue - totalCost;
        const overallMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0;

        // 2. Dead Stock — products with no sales in last 90 days
        const deadStockWindow = new Date();
        deadStockWindow.setDate(deadStockWindow.getDate() - 90);

        const allInventory = await prisma.inventory.findMany({
            where: branchFilter,
            include: {
                drug: { select: { id: true, tradeName: true, barcode: true } },
                batches: { select: { quantity: true, costPrice: true } },
                branch: { select: { name: true } }
            }
        });

        const soldDrugIds = new Set(
            (await prisma.saleItem.findMany({
                where: {
                    sale: {
                        createdAt: { gte: deadStockWindow },
                        ...branchFilter
                    }
                },
                select: { drugId: true },
                distinct: ['drugId']
            })).map((i: any) => i.drugId)
        );

        const deadStock = allInventory
            .filter((inv: any) => {
                const stock = inv.batches.reduce((s: number, b: any) => s + b.quantity, 0);
                return stock > 0 && !soldDrugIds.has(inv.drugId);
            })
            .map((inv: any) => ({
                drugId: inv.drugId,
                tradeName: inv.drug?.tradeName || 'Unknown',
                barcode: inv.drug?.barcode || '',
                branch: inv.branch?.name || '',
                currentStock: inv.batches.reduce((s: number, b: any) => s + b.quantity, 0),
                estimatedValue: inv.batches.reduce((sum: number, b: any) => sum + (b.quantity * (b.costPrice || inv.cost || 0)), 0),
            }));

        const totalDeadStockValue = deadStock.reduce((sum, d) => sum + d.estimatedValue, 0);

        // 3. Near-Expiry Loss — batches expiring within 90 days
        const nearExpiryWindow = new Date();
        nearExpiryWindow.setDate(nearExpiryWindow.getDate() + 90);

        const expiringBatches = await prisma.batch.findMany({
            where: {
                expiryDate: { lte: nearExpiryWindow },
                quantity: { gt: 0 },
                inventory: branchId ? { branchId } : undefined
            },
            include: {
                inventory: {
                    include: {
                        drug: { select: { tradeName: true, barcode: true } },
                        branch: { select: { name: true } }
                    }
                }
            },
            orderBy: { expiryDate: 'asc' }
        });

        const nearExpiryLoss = expiringBatches.map((batch: any) => ({
            drugId: batch.inventory?.drugId,
            tradeName: batch.inventory?.drug?.tradeName || 'Unknown',
            barcode: batch.inventory?.drug?.barcode || '',
            branch: batch.inventory?.branch?.name || '',
            batchNumber: batch.batchNumber,
            quantity: batch.quantity,
            expiryDate: batch.expiryDate,
            isExpired: batch.expiryDate < new Date(),
            daysRemaining: Math.ceil((batch.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            estimatedLoss: batch.quantity * (batch.costPrice || batch.inventory?.cost || 0),
        }));

        const totalNearExpiryLoss = nearExpiryLoss.reduce((sum, b) => sum + b.estimatedLoss, 0);

        return NextResponse.json({
            period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
            summary: {
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalCost: Math.round(totalCost * 100) / 100,
                netProfit: Math.round(netProfit * 100) / 100,
                overallMargin,
                deadStockCount: deadStock.length,
                totalDeadStockValue: Math.round(totalDeadStockValue * 100) / 100,
                nearExpiryCount: nearExpiryLoss.length,
                totalNearExpiryLoss: Math.round(totalNearExpiryLoss * 100) / 100,
            },
            profitByProduct: profitReport,
            deadStock,
            nearExpiryLoss
        });
    } catch (error) {
        console.error("Profit analysis error:", error);
        return NextResponse.json({ message: "Failed to generate profit analysis" }, { status: 500 });
    }
}
