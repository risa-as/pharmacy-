import { operatingExpenseWhere } from '@/app/lib/expense-categories';
import { returnedCost } from '@/app/lib/profit-math';
import { computeProfitSummary } from '@/app/lib/profit-summary';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { baghdadDate, dateStart, DAY } from '@/app/lib/smart-purchasing';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { guardFeature } from '@/app/lib/api-guards';

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canViewProfitReport) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
        const { tenantBranchWhere, organizationId } = tenantCtx;
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId') || tenantCtx.user.branchId;
        const period = searchParams.get('period') || 'daily';
        const today = baghdadDate();
        let startDate = dateStart(today);
        let endDate = new Date(startDate.getTime() + DAY - 1);
        try {
            if (period === 'custom') {
                startDate = dateStart(searchParams.get('from') || '');
                endDate = new Date(dateStart(searchParams.get('to') || '').getTime() + DAY - 1);
            } else if (period === 'monthly') startDate = dateStart(today.slice(0, 7) + '-01');
            else if (period === 'weekly') startDate = new Date(startDate.getTime() - 6 * DAY);
            if (startDate > endDate) throw new Error('date range');
        } catch { return NextResponse.json({ error: 'الفترة المحددة غير صالحة.' }, { status: 400 }); }

        // Feature gate: advancedReports (Pro+)
        if (organizationId) {
            const denied = await guardFeature('advancedReports', 'PROFESSIONAL');
            if (denied) return denied;
        }

        const branchFilter = branchId ? { AND: [tenantBranchWhere, { branchId }] } : tenantBranchWhere;

        // 1–4. Revenue, COGS, operating expenses, refunds and the returned goods'
        // cost reversal: one shared definition (also used by the AI assistant).
        const summary = await computeProfitSummary(branchFilter, startDate, endDate);

        // 5. Supplier Payments
        const supplierPaymentsAgg = await prisma.supplierPayment.aggregate({
            _sum: { amount: true },
            where: {
                ...branchFilter,
                date: { gte: startDate, lte: endDate }
            }
        });

        const totalRevenue = summary.revenue;
        const totalDiscount = summary.discount;
        const totalCOGS = summary.cogs;
        const totalExpenses = summary.expenses;
        const totalReturns = summary.returns;
        const totalSupplierPayments = supplierPaymentsAgg._sum.amount || 0;
        const salesAgg = { _count: summary.salesCount };
        const returnsAgg = { _count: summary.returnsCount };

        // Per-day cost reversal for the chart below.
        const returnedLines = await prisma.saleReturn.findMany({ where: { ...branchFilter, createdAt: { gte: startDate, lte: endDate } },
            select: { createdAt: true, items: { select: { drugId: true, quantity: true } }, sale: { select: { items: { select: { drugId: true, quantity: true, cost: true } } } } } });
        const grossProfit = summary.gross;
        const netProfit = summary.net;
        const profitMargin = summary.margin;


        // 6. Daily breakdown for chart
        const sales = await prisma.sale.findMany({
            where: {
                ...branchFilter,
                createdAt: { gte: startDate, lte: endDate }
            },
            select: {
                createdAt: true,
                total: true,
                items: {
                    select: { cost: true, quantity: true }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        const dailyData: Record<string, { revenue: number; cogs: number; expenses: number; returns: number }> = {};

        for (const sale of sales) {
            const dateKey = baghdadDate(sale.createdAt);
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { revenue: 0, cogs: 0, expenses: 0, returns: 0 };
            }
            dailyData[dateKey].revenue += sale.total;
            dailyData[dateKey].cogs += sale.items.reduce((sum: any, item: any) => sum + (item.cost * item.quantity), 0);
        }

        // Add expenses to daily breakdown
        const expenses = await prisma.expense.findMany({
            where: { ...operatingExpenseWhere,
                ...branchFilter,
                date: { gte: startDate, lte: endDate }
            },
            select: { date: true, amount: true }
        });

        for (const exp of expenses) {
            const dateKey = baghdadDate(exp.date);
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { revenue: 0, cogs: 0, expenses: 0, returns: 0 };
            }
            dailyData[dateKey].expenses += exp.amount;
        }

        // Add returns to daily breakdown
        const returns = await prisma.saleReturn.findMany({
            where: {
                ...branchFilter,
                createdAt: { gte: startDate, lte: endDate }
            },
            select: { createdAt: true, total: true }
        });

        for (const ret of returns) {
            const dateKey = baghdadDate(ret.createdAt);
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { revenue: 0, cogs: 0, expenses: 0, returns: 0 };
            }
            dailyData[dateKey].returns += ret.total;
        }

        for (const ret of returnedLines) {
            const key = baghdadDate(ret.createdAt);
            if (dailyData[key]) dailyData[key].cogs -= returnedCost(ret.items, ret.sale.items);
        }
        const chart = Object.entries(dailyData)
            .sort(([a]: any[], [b]: any[]) => a.localeCompare(b))
            .map(([date, data]: any) => ({
                date,
                revenue: Math.round(data.revenue),
                cogs: Math.round(data.cogs),
                expenses: Math.round(data.expenses),
                returns: Math.round(data.returns),
                netProfit: Math.round(data.revenue - data.cogs - data.expenses - data.returns)
            }));

        // 7. Expense breakdown by category
        const expensesByCategory = await prisma.expense.groupBy({
            by: ['category'],
            _sum: { amount: true },
            where: { ...operatingExpenseWhere,
                ...branchFilter,
                date: { gte: startDate, lte: endDate }
            }
        });

        return NextResponse.json({
            summary: {
                totalRevenue: Math.round(totalRevenue),
                totalDiscount: Math.round(totalDiscount),
                totalCOGS: Math.round(totalCOGS),
                grossProfit: Math.round(grossProfit),
                totalExpenses: Math.round(totalExpenses),
                totalReturns: Math.round(totalReturns),
                totalSupplierPayments: Math.round(totalSupplierPayments),
                netProfit: Math.round(netProfit),
                profitMargin: Math.round(profitMargin * 100) / 100,
                salesCount: salesAgg._count,
                returnsCount: returnsAgg._count,
            },
            chart,
            expensesByCategory: expensesByCategory.map((e: any) => ({
                category: e.category,
                amount: Math.round(e._sum.amount || 0)
            }))
        });

    } catch (error: any) {
        console.error('Profit Report Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
