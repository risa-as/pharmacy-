export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

const LEAD_TIME_DAYS = 14; // Average lead time for orders in Iraq
const SAFETY_STOCK_DAYS = 7; // Safety buffer
const VELOCITY_WINDOW_DAYS = 30; // Days to look back for sales data

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');

        const whereClause: any = { ...tenantBranchWhere };
        if (branchId) {
            whereClause.branchId = branchId;
        }

        // Fetch all inventory items with their batches and drug details
        const inventoryItems = await prisma.inventory.findMany({
            where: whereClause,
            include: {
                drug: {
                    select: {
                        tradeName: true,
                        scientificName: true,
                        barcode: true
                    }
                },
                branch: {
                    select: { name: true }
                },
                batches: {
                    select: { quantity: true }
                }
            }
        });

        // Fetch pending purchases to exclude items already ordered
        const pendingPurchases = await prisma.purchase.findMany({
            where: { status: 'PENDING', ...tenantBranchWhere },
            include: { items: true }
        });

        const pendingDrugIds = new Set<string>();
        pendingPurchases.forEach(p => {
            p.items.forEach(i => pendingDrugIds.add(i.drugId));
        });

        // Fetch sales data for the last VELOCITY_WINDOW_DAYS to calculate sales velocity
        const velocityStart = new Date();
        velocityStart.setDate(velocityStart.getDate() - VELOCITY_WINDOW_DAYS);

        const recentSaleItems = await prisma.saleItem.findMany({
            where: {
                sale: {
                    createdAt: { gte: velocityStart },
                    ...(branchId ? {
                        items: {
                            some: {
                                drug: {
                                    inventories: {
                                        some: { branchId }
                                    }
                                }
                            }
                        }
                    } : {})
                }
            },
            select: {
                drugId: true,
                quantity: true
            }
        });

        // Calculate total sold per drug in the window
        const soldByDrug = new Map<string, number>();
        for (const item of recentSaleItems) {
            soldByDrug.set(item.drugId, (soldByDrug.get(item.drugId) || 0) + item.quantity);
        }

        const enrichedItems = inventoryItems.map(item => {
            const totalQuantity = item.batches.reduce((sum, batch) => sum + batch.quantity, 0);
            const totalSold = soldByDrug.get(item.drugId) || 0;
            const averageDailySales = totalSold / VELOCITY_WINDOW_DAYS;
            const daysUntilStockout = averageDailySales > 0
                ? Math.round(totalQuantity / averageDailySales)
                : totalQuantity > 0 ? 999 : 0;
            const suggestedReorderQuantity = averageDailySales > 0
                ? Math.ceil(averageDailySales * (LEAD_TIME_DAYS + SAFETY_STOCK_DAYS))
                : item.maxStock - totalQuantity;

            return {
                ...item,
                currentQuantity: totalQuantity,
                averageDailySales: Math.round(averageDailySales * 100) / 100,
                daysUntilStockout,
                suggestedReorderQuantity: Math.max(0, suggestedReorderQuantity),
                totalSoldLast30Days: totalSold
            };
        });

        // Filter: low stock OR selling fast (will run out within lead time + safety)
        const needsReorder = enrichedItems
            .filter(item =>
                !pendingDrugIds.has(item.drugId) &&
                (item.currentQuantity <= item.minStock || item.daysUntilStockout <= (LEAD_TIME_DAYS + SAFETY_STOCK_DAYS))
            )
            .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);

        return NextResponse.json(needsReorder);
    } catch (error) {
        console.error("Smart Order API Error:", error);
        return NextResponse.json({ message: "Failed to fetch smart orders" }, { status: 500 });
    }
}
