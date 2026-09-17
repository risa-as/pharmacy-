export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

/** Stock of an inventory row = sum of its batches (same basis as GET /api/inventory). */
const STOCK_SQL = Prisma.sql`COALESCE((SELECT SUM(b.quantity) FROM "Batch" b WHERE b."inventoryId" = i.id), 0)`;

/**
 * Items in stock but at or below the reorder level — the same rule the mobile
 * inventory tab «نواقص» uses, so both screens always show one number.
 * Out-of-stock items are counted separately (`outOfStock`), never here.
 *
 * Counted in SQL: loading every inventory row with its batches to count them
 * took 25–45 s on a branch with ~3,000 items and timed out the mobile app.
 */
async function countLowStock(tenantBranchWhere: Record<string, any>, branchId: string | null): Promise<number> {
    const conditions = [...scopeConditions(tenantBranchWhere, branchId), Prisma.sql`i."minStock" > 0`];
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "Inventory" i
        WHERE ${Prisma.join(conditions, ' AND ')}
          AND ${STOCK_SQL} > 0 AND ${STOCK_SQL} <= i."minStock"
    `;
    return row?.count ?? 0;
}

/** Items with no stock left — the inventory tab «نافد». */
async function countOutOfStock(tenantBranchWhere: Record<string, any>, branchId: string | null): Promise<number> {
    const conditions = scopeConditions(tenantBranchWhere, branchId);
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM "Inventory" i
        WHERE ${Prisma.join(conditions, ' AND ')} AND ${STOCK_SQL} <= 0
    `;
    return row?.count ?? 0;
}

/** Scope clauses shared by the inventory counts. */
function scopeConditions(tenantBranchWhere: Record<string, any>, branchId: string | null): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (typeof tenantBranchWhere.branchId === 'string') {
        conditions.push(Prisma.sql`i."branchId" = ${tenantBranchWhere.branchId}`);
    }
    const orgId = tenantBranchWhere.branch?.organizationId;
    if (typeof orgId === 'string') {
        conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "Branch" br WHERE br.id = i."branchId" AND br."organizationId" = ${orgId})`);
    }
    if (branchId) conditions.push(Prisma.sql`i."branchId" = ${branchId}`);
    return conditions;
}

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
        const now = new Date();
        const [
            salesTodayAgg,
            salesCountToday,
            inventoryCount,
            lowStockCount,
            outOfStockCount,
            expiringCount,
            expiredCount,
            debtsCount,
            debtsTotalAgg,
            creditCountToday,
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
            // 4. Low stock inventory items (minStock > 0), counted in the database
            countLowStock(tenantBranchWhere, branchId),
            // 5. Items with no stock left — the inventory tab «نافد»
            countOutOfStock(tenantBranchWhere, branchId),
            // 6. Items with a batch expiring within 90 days (still valid)
            prisma.inventory.count({
                where: {
                    ...branchFilter,
                    batches: { some: { expiryDate: { gt: now, lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) }, quantity: { gt: 0 } } },
                },
            }),
            // 7. Items holding expired stock. Counted per item, not per batch, so
            //    it matches the inventory list the card opens.
            prisma.inventory.count({
                where: {
                    ...branchFilter,
                    batches: { some: { expiryDate: { lt: now }, quantity: { gt: 0 } } },
                },
            }),
            // 7. Patients with outstanding balance (debts) — count
            prisma.patient.count({ where: { ...tenantBranchWhere, balance: { gt: 0 } } }),
            // 8. Total outstanding receivables (debts) — amount
            prisma.patient.aggregate({
                _sum: { balance: true },
                where: { ...tenantBranchWhere, balance: { gt: 0 } },
            }),
            // 9. Credit (deferred) sales count today — for the cash/credit split
            prisma.sale.count({
                where: { createdAt: { gte: todayStart }, ...branchFilter, payment: { method: 'CREDIT' } },
            }),
        ]);

        const salesToday = salesTodayAgg._sum.total ?? 0;

        return NextResponse.json({
            salesToday,
            salesCount: salesCountToday,
            inventory: inventoryCount,
            lowStock: lowStockCount,
            outOfStock: outOfStockCount,
            expiring: expiringCount,
            expiredCount,
            debtsCount,
            debtsTotal: debtsTotalAgg._sum.balance ?? 0,
            creditCount: creditCountToday,
            cashCount: Math.max(0, salesCountToday - creditCountToday),
        });
    } catch (error) {
        console.error('API Stats Error:', error);
        return NextResponse.json(
            { message: 'Error fetching stats' },
            { status: 500 }
        );
    }
}
