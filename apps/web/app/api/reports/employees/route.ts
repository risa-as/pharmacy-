export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const period = searchParams.get('period') || 'monthly';
        const branchId = searchParams.get('branchId');

        const startDate = new Date();
        if (period === 'monthly') {
            startDate.setDate(1); // Start of month
            startDate.setHours(0, 0, 0, 0);
        } else if (period === 'weekly') {
            startDate.setDate(startDate.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
        } else {
            // daily
            startDate.setHours(0, 0, 0, 0);
        }

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const whereClause: any = {
            createdAt: { gte: startDate },
            ...tenantBranchWhere,
        };

        if (branchId) {
            whereClause.branchId = branchId;
        }

        // 1. Fetch Sales by User
        const salesByUser = await prisma.sale.groupBy({
            by: ['userId'],
            where: whereClause,
            _sum: {
                total: true,
            },
            _count: {
                id: true,
            },
        });

        // 2. Fetch Shifts by User
        const shiftsByUser = await prisma.shift.groupBy({
            by: ['userId'],
            where: {
                startTime: { gte: startDate },
                ...(branchId && { branchId }),
                ...tenantBranchWhere,
                status: 'CLOSED' // Only count closed shifts for duration
            },
            _sum: {
                duration: true
            }
        });

        // 3. Get User Details
        const userIds = Array.from(new Set([
            ...salesByUser.map((s: any) => s.userId).filter(Boolean),
            ...shiftsByUser.map((s: any) => s.userId).filter(Boolean)
        ])) as string[];

        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, role: true }
        });

        // 4. Combine Data
        const report = users.map((user: any) => {
            const saleStats = salesByUser.find((s: any) => s.userId === user.id);
            const shiftStats = shiftsByUser.find((s: any) => s.userId === user.id);

            const totalSales = saleStats?._sum.total || 0;
            const transactionCount = saleStats?._count.id || 0;
            const totalHours = shiftStats?._sum.duration || 0;

            // Performance Metric: Sales per Hour
            const salesPerHour = totalHours > 0 ? (totalSales / totalHours) : 0;

            return {
                id: user.id,
                name: user.name,
                role: user.role,
                totalSales,
                transactionCount,
                averageBasket: transactionCount > 0 ? totalSales / transactionCount : 0,
                totalHours,
                salesPerHour
            };
        });

        return NextResponse.json(report);
    } catch (error) {
        console.error('Employee Report Error:', error);
        return NextResponse.json({ error: 'Failed to fetch employee stats' }, { status: 500 });
    }
}
