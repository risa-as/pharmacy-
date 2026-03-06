
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const period = searchParams.get('period') || 'daily';
        const branchId = searchParams.get('branchId');

        const startDate = new Date();
        if (period === 'monthly') {
            startDate.setDate(1); // Start of month
            startDate.setHours(0, 0, 0, 0);
        } else if (period === 'weekly') {
            startDate.setDate(startDate.getDate() - 6); // Last 7 days
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

        // Revenue + transaction count
        const [totalSales, salesCount] = await Promise.all([
            prisma.sale.aggregate({
                _sum: { total: true },
                where: whereClause,
            }),
            prisma.sale.count({ where: whereClause }),
        ]);

        // Expenses
        const expenseWhere: any = {
            date: { gte: startDate },
            ...tenantBranchWhere,
        };

        if (branchId) {
            expenseWhere.branchId = branchId;
        }

        const totalExpenses = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: expenseWhere
        }).catch(() => {
            // Fallback if 'date' doesn't exist, try createdAt
            const fallbackWhere: any = { createdAt: { gte: startDate } };
            if (branchId) fallbackWhere.branchId = branchId;

            return prisma.expense.aggregate({
                _sum: { amount: true },
                where: fallbackWhere
            })
        });

        // Chart Data (Last 7 days dynamic)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const chartWhere: any = {
            createdAt: { gte: sevenDaysAgo },
            ...tenantBranchWhere,
        };
        if (branchId) chartWhere.branchId = branchId;

        const recentSales = await prisma.sale.findMany({
            where: chartWhere,
            select: { createdAt: true, total: true },
            orderBy: { createdAt: 'asc' },
        });

        const chartData = recentSales.reduce((acc: any, sale) => {
            const date = sale.createdAt.toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + sale.total;
            return acc;
        }, {});

        // Fill in missing days for chart
        const filledChart = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            filledChart.push({
                date: dateStr,
                amount: chartData[dateStr] || 0
            });
        }

        const revenue = totalSales._sum.total || 0;
        const expenses = totalExpenses._sum.amount || 0;

        return NextResponse.json({
            revenue,
            expenses,
            profit: revenue - expenses,
            transactions: salesCount,
            chart: filledChart,
        });
    } catch (error) {
        console.error('Reports API Error:', error);
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}
