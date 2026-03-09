export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(request: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const { searchParams } = request.nextUrl;
        const branchId = searchParams.get('branchId');

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. Sales Today (Total Revenue)
        const salesTodayAgg = await prisma.sale.aggregate({
            _sum: {
                total: true
            },
            where: {
                createdAt: {
                    gte: todayStart
                },
                ...tenantBranchWhere,
                ...(branchId && { branchId })
            }
        });
        const salesToday = salesTodayAgg._sum.total || 0;

        // 2. Total Inventory Items (Count of unique drugs in inventory)
        const inventoryCount = await prisma.inventory.count({
            where: {
                ...tenantBranchWhere,
                ...(branchId && { branchId })
            }
        });

        // 3. Low Stock Items
        // Note: Inventory model in schema seems to currently lack 'minStock'.
        // For now, we will return 0 or a placeholder to match the 'smart-order' issue.
        // Once schema is updated with minStock, we can uncomment the logic.
        /*
        const inventoryItems = await prisma.inventory.findMany({
            include: {
                batches: {
                    select: { quantity: true }
                }
            }
        });
        const lowStockCount = inventoryItems.filter((item: any) => {
            // @ts-ignore
            const min = item.minStock || 10; // Default threshold if missing
            const totalQuantity = item.batches.reduce((sum: any, batch: any) => sum + batch.quantity, 0);
            return totalQuantity <= min;
        }).length;
        */
        const lowStockCount = 0;

        // 4. Expiring Batches (Next 90 days to match Alerts tab)
        const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const expiringCount = await prisma.batch.count({
            where: {
                expiryDate: {
                    lte: ninetyDaysFromNow
                },
                quantity: { gt: 0 },
                inventory: {
                    ...tenantBranchWhere,
                    ...(branchId && { branchId })
                }
            }
        });

        return NextResponse.json({
            salesToday: salesToday,
            inventory: inventoryCount,
            lowStock: lowStockCount,
            expiring: expiringCount,
        });
    } catch (error) {
        console.error('API Stats Error:', error);
        return NextResponse.json(
            { message: 'Error fetching stats' },
            { status: 500 }
        );
    }
}
