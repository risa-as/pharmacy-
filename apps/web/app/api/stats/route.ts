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

        // Iraq timezone (UTC+3): compute today's midnight in UTC
        const IRAQ_MS = 3 * 60 * 60 * 1000;
        const iraqNow = new Date(Date.now() + IRAQ_MS);
        const todayStart = new Date(
            Date.UTC(iraqNow.getUTCFullYear(), iraqNow.getUTCMonth(), iraqNow.getUTCDate())
            - IRAQ_MS
        );

        const branchFilter = { ...tenantBranchWhere, ...(branchId && { branchId }) };

        // Run all queries in parallel for performance
        const [
            salesTodayAgg,
            salesCountToday,
            inventoryCount,
            inventoriesForStock,
            expiringCount,
            debtsCount,
        ] = await Promise.all([
            // 1. Sales revenue today
            prisma.sale.aggregate({
                _sum: { total: true },
                where: { createdAt: { gte: todayStart }, ...branchFilter },
            }),
            // 2. Sales count today
            prisma.sale.count({
                where: { createdAt: { gte: todayStart }, ...branchFilter },
            }),
            // 3. Total inventory items
            prisma.inventory.count({ where: branchFilter }),
            // 4. Low stock inventory items (minStock > 0)
            prisma.inventory.findMany({
                where: { ...branchFilter, minStock: { gt: 0 } },
                include: { batches: { select: { quantity: true }, where: { quantity: { gt: 0 } } } },
            }),
            // 5. Expiring batches within 90 days
            prisma.batch.count({
                where: {
                    expiryDate: { lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
                    quantity: { gt: 0 },
                    inventory: branchFilter,
                },
            }),
            // 6. Patients with outstanding balance (debts)
            prisma.patient.count({ where: { ...tenantBranchWhere, balance: { not: 0 } } }),
        ]);

        const salesToday = salesTodayAgg._sum.total ?? 0;
        const lowStockCount = inventoriesForStock.filter((inv: any) => {
            const total = inv.batches.reduce((s: number, b: any) => s + b.quantity, 0);
            return total < inv.minStock;
        }).length;

        return NextResponse.json({
            salesToday,
            salesCount: salesCountToday,
            inventory: inventoryCount,
            lowStock: lowStockCount,
            expiring: expiringCount,
            debtsCount,
        });
    } catch (error) {
        console.error('API Stats Error:', error);
        return NextResponse.json(
            { message: 'Error fetching stats' },
            { status: 500 }
        );
    }
}
