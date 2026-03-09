export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId') || session.user.branchId;
        const period = searchParams.get('period') || 'daily'; // daily, weekly, monthly, custom
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        // Calculate date range
        const now = new Date();
        let startDate: Date;
        let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        if (period === 'custom' && from && to) {
            startDate = new Date(from);
            endDate = new Date(to);
            endDate.setHours(23, 59, 59, 999);
        } else if (period === 'monthly') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'weekly') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
        } else {
            // daily
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const branchFilter = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };

        // 1. Total Sales Revenue
        const salesAgg = await prisma.sale.aggregate({
            _sum: { total: true, discount: true },
            _count: true,
            where: {
                ...branchFilter,
                createdAt: { gte: startDate, lte: endDate }
            }
        });

        // 2. Cost of Goods Sold (COGS) from SaleItems
        const cogsAgg = await prisma.saleItem.aggregate({
            _sum: { cost: true },
            where: {
                sale: {
                    ...branchFilter,
                    createdAt: { gte: startDate, lte: endDate }
                }
            }
        });

        // 3. Total Expenses
        const expensesAgg = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                ...branchFilter,
                date: { gte: startDate, lte: endDate }
            }
        });

        // 4. Total Returns (Refunds)
        const returnsAgg = await prisma.saleReturn.aggregate({
            _sum: { total: true },
            _count: true,
            where: {
                ...branchFilter,
                createdAt: { gte: startDate, lte: endDate }
            }
        });

        // 5. Supplier Payments
        const supplierPaymentsAgg = await prisma.supplierPayment.aggregate({
            _sum: { amount: true },
            where: {
                ...branchFilter,
                date: { gte: startDate, lte: endDate }
            }
        });

        const totalRevenue = salesAgg._sum.total || 0;
        const totalDiscount = salesAgg._sum.discount || 0;
        const totalCOGS = cogsAgg._sum.cost || 0;
        const totalExpenses = expensesAgg._sum.amount || 0;
        const totalReturns = returnsAgg._sum.total || 0;
        const totalSupplierPayments = supplierPaymentsAgg._sum.amount || 0;

        const grossProfit = totalRevenue - totalCOGS;
        const netProfit = grossProfit - totalExpenses - totalReturns;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0;

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
            const dateKey = sale.createdAt.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { revenue: 0, cogs: 0, expenses: 0, returns: 0 };
            }
            dailyData[dateKey].revenue += sale.total;
            dailyData[dateKey].cogs += sale.items.reduce((sum: any, item: any) => sum + (item.cost * item.quantity), 0);
        }

        // Add expenses to daily breakdown
        const expenses = await prisma.expense.findMany({
            where: {
                ...branchFilter,
                date: { gte: startDate, lte: endDate }
            },
            select: { date: true, amount: true }
        });

        for (const exp of expenses) {
            const dateKey = exp.date.toISOString().split('T')[0];
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
            const dateKey = ret.createdAt.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { revenue: 0, cogs: 0, expenses: 0, returns: 0 };
            }
            dailyData[dateKey].returns += ret.total;
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
            where: {
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
