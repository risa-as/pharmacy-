import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET: Compare branches on sales, expenses, profit, inventory
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const period = searchParams.get('period') || 'monthly';
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        // Date range
        const now = new Date();
        let startDate: Date;
        let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        if (period === 'custom' && from && to) {
            startDate = new Date(from);
            endDate = new Date(to);
            endDate.setHours(23, 59, 59, 999);
        } else if (period === 'weekly') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
        } else if (period === 'daily') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // Fetch all branches
        const branches = await prisma.branch.findMany({
            select: { id: true, name: true }
        });

        const comparison = await Promise.all(branches.map(async (branch) => {
            const branchFilter = { branchId: branch.id };
            const dateFilter = { gte: startDate, lte: endDate };

            const [salesAgg, cogsAgg, expAgg, returnsAgg, saleCount, inventoryCount] = await Promise.all([
                prisma.sale.aggregate({
                    _sum: { total: true },
                    where: { ...branchFilter, createdAt: dateFilter }
                }),
                prisma.saleItem.aggregate({
                    _sum: { cost: true },
                    where: { sale: { ...branchFilter, createdAt: dateFilter } }
                }),
                prisma.expense.aggregate({
                    _sum: { amount: true },
                    where: { ...branchFilter, date: dateFilter }
                }),
                prisma.saleReturn.aggregate({
                    _sum: { total: true },
                    where: { ...branchFilter, createdAt: dateFilter }
                }),
                prisma.sale.count({
                    where: { ...branchFilter, createdAt: dateFilter }
                }),
                prisma.inventory.count({ where: branchFilter })
            ]);

            const revenue = salesAgg._sum.total || 0;
            const cogs = cogsAgg._sum.cost || 0;
            const expenses = expAgg._sum.amount || 0;
            const returns = returnsAgg._sum.total || 0;
            const netProfit = revenue - cogs - expenses - returns;
            const margin = revenue > 0 ? (netProfit / revenue * 100) : 0;

            return {
                branchId: branch.id,
                branchName: branch.name,
                revenue: Math.round(revenue),
                cogs: Math.round(cogs),
                expenses: Math.round(expenses),
                returns: Math.round(returns),
                netProfit: Math.round(netProfit),
                profitMargin: Math.round(margin * 100) / 100,
                salesCount: saleCount,
                inventoryCount,
            };
        }));

        // Sort by revenue descending
        comparison.sort((a, b) => b.revenue - a.revenue);

        return NextResponse.json({ comparison, period, startDate, endDate });
    } catch (error: any) {
        console.error('Branch Comparison Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
