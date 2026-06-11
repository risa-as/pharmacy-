export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

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

        // Previous period of equal length (immediately before startDate) — for growth.
        const periodLengthMs = endDate.getTime() - startDate.getTime();
        const prevStartDate = new Date(startDate.getTime() - periodLengthMs);
        const prevEndDate = new Date(startDate.getTime() - 1);

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantWhere } = tenantCtx;

        // Fetch all branches
        const branches = await prisma.branch.findMany({
            where: tenantWhere,
            select: { id: true, name: true }
        });

        const comparison = await Promise.all(branches.map(async (branch: any) => {
            const branchFilter = { branchId: branch.id };
            const dateFilter = { gte: startDate, lte: endDate };

            const [salesAgg, cogsAgg, expAgg, returnsAgg, saleCount, inventoryCount, prevSalesAgg, batches, topItems] = await Promise.all([
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
                prisma.inventory.count({ where: branchFilter }),
                // Previous-period revenue (growth)
                prisma.sale.aggregate({
                    _sum: { total: true },
                    where: { ...branchFilter, createdAt: { gte: prevStartDate, lte: prevEndDate } }
                }),
                // Inventory financial value (current snapshot, in-stock batches)
                prisma.batch.findMany({
                    where: { quantity: { gt: 0 }, inventory: branchFilter },
                    select: { quantity: true, costPrice: true }
                }),
                // Best-selling item in the period (by quantity)
                prisma.saleItem.groupBy({
                    by: ['drugId'],
                    where: { sale: { ...branchFilter, createdAt: dateFilter } },
                    _sum: { quantity: true },
                    orderBy: { _sum: { quantity: 'desc' } },
                    take: 1,
                }),
            ]);

            const revenue = salesAgg._sum.total || 0;
            const cogs = cogsAgg._sum.cost || 0;
            const expenses = expAgg._sum.amount || 0;
            const returns = returnsAgg._sum.total || 0;
            const netProfit = revenue - cogs - expenses - returns;
            const margin = revenue > 0 ? (netProfit / revenue * 100) : 0;

            // Growth vs previous equal-length period
            const prevRevenue = prevSalesAgg._sum.total || 0;
            const revenueGrowth = prevRevenue > 0
                ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100)
                : (revenue > 0 ? 100 : 0);

            // Inventory value (cost basis)
            const inventoryValue = batches.reduce((sum: number, b: any) => sum + b.quantity * b.costPrice, 0);

            // Resolve best-seller drug name
            let topItem: { name: string; quantity: number } | null = null;
            if (topItems.length > 0 && topItems[0].drugId) {
                const drug = await prisma.globalDrug.findUnique({
                    where: { id: topItems[0].drugId },
                    select: { tradeName: true },
                });
                topItem = {
                    name: drug?.tradeName || 'غير معروف',
                    quantity: topItems[0]._sum.quantity || 0,
                };
            }

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
                revenueGrowth,
                inventoryValue: Math.round(inventoryValue),
                topItem,
            };
        }));

        // Sort by revenue descending
        comparison.sort((a: any, b: any) => b.revenue - a.revenue);

        return NextResponse.json({ comparison, period, startDate, endDate });
    } catch (error: any) {
        console.error('Branch Comparison Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
