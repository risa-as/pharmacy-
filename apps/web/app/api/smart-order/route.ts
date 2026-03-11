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

        const whereClause: any = {
            ...tenantBranchWhere,
            minStock: { gt: 0 }, // Only items with minStock configured — skip unconfigured stock
            ...(branchId ? { branchId } : {}),
        };

        // Run inventory + pending purchases in parallel
        const [inventoryItems, pendingPurchases] = await Promise.all([
            // Only fetch items that COULD be low-stock (have minStock configured)
            prisma.inventory.findMany({
                where: whereClause,
                select: {
                    id: true,
                    drugId: true,
                    branchId: true,
                    minStock: true,
                    maxStock: true,
                    drug: { select: { tradeName: true, scientificName: true, barcode: true } },
                    branch: { select: { name: true } },
                    batches: { select: { quantity: true } },
                },
            }),
            prisma.purchase.findMany({
                where: { status: 'PENDING', ...tenantBranchWhere, ...(branchId ? { branchId } : {}) },
                select: { items: { select: { drugId: true } } },
            }),
        ]);

        const pendingDrugIds = new Set<string>(
            pendingPurchases.flatMap((p: any) => p.items.map((i: any) => i.drugId))
        );

        // Pre-compute which drugs actually need reorder (stock < minStock, no pending order)
        const lowStockItems = inventoryItems
            .map((item: any) => ({
                ...item,
                currentQuantity: item.batches.reduce((s: number, b: any) => s + b.quantity, 0),
            }))
            .filter((item: any) =>
                !pendingDrugIds.has(item.drugId) &&
                item.currentQuantity < item.minStock
            );

        if (lowStockItems.length === 0) return NextResponse.json([]);

        // Only fetch sales velocity for the drugs that actually need reorder
        const neededDrugIds = lowStockItems.map((i: any) => i.drugId);
        const velocityStart = new Date();
        velocityStart.setDate(velocityStart.getDate() - VELOCITY_WINDOW_DAYS);

        const recentSaleItems = await prisma.saleItem.findMany({
            where: {
                drugId: { in: neededDrugIds }, // ← only drugs we care about
                sale: { createdAt: { gte: velocityStart } },
            },
            select: { drugId: true, quantity: true },
        });

        // Calculate total sold per drug in the window
        const soldByDrug = new Map<string, number>();
        for (const item of recentSaleItems) {
            soldByDrug.set(item.drugId, (soldByDrug.get(item.drugId) || 0) + item.quantity);
        }

        // Enrich the already-filtered low-stock items with sales velocity data
        const needsReorder = lowStockItems
            .map((item: any) => {
                const totalSold = soldByDrug.get(item.drugId) || 0;
                const averageDailySales = totalSold / VELOCITY_WINDOW_DAYS;
                const suggestedReorderQuantity = averageDailySales > 0
                    ? Math.ceil(averageDailySales * (LEAD_TIME_DAYS + SAFETY_STOCK_DAYS))
                    : Math.max(0, item.maxStock - item.currentQuantity);
                return {
                    ...item,
                    averageDailySales: Math.round(averageDailySales * 100) / 100,
                    suggestedReorderQuantity: Math.max(1, suggestedReorderQuantity),
                    totalSoldLast30Days: totalSold,
                };
            })
            .sort((a: any, b: any) => a.currentQuantity - b.currentQuantity);

        return NextResponse.json(needsReorder);
    } catch (error) {
        console.error("Smart Order API Error:", error);
        return NextResponse.json({ message: "Failed to fetch smart orders" }, { status: 500 });
    }
}
