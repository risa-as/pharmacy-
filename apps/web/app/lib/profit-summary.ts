import { operatingExpenseWhere } from '@/app/lib/expense-categories';
import { returnedCost } from '@/app/lib/profit-math';
import { prisma } from '@/app/lib/prisma';

/**
 * One definition of the period profit, shared by the profit report and the AI
 * assistant so both always give the same numbers for the same scope.
 * net = (revenue − COGS) − operating expenses − refunds + COGS of returned goods
 * (the refund removes revenue already counted; the returned goods' cost is
 * reversed because that stock was not consumed).
 */
export async function computeProfitSummary(scope: Record<string, unknown>, from: Date, to: Date) {
    const inPeriod = { ...scope, createdAt: { gte: from, lte: to } };
    const [salesAgg, saleItems, expensesAgg, returnsAgg, returnedLines] = await Promise.all([
        prisma.sale.aggregate({ _sum: { total: true, discount: true }, _count: true, where: inPeriod }),
        prisma.saleItem.findMany({ where: { sale: inPeriod }, select: { cost: true, quantity: true } }),
        // Intersected, never spread: stock purchases must never count as operating expenses.
        prisma.expense.aggregate({ _sum: { amount: true }, where: { AND: [operatingExpenseWhere, scope, { date: { gte: from, lte: to } }] } }),
        prisma.saleReturn.aggregate({ _sum: { total: true }, _count: true, where: inPeriod }),
        prisma.saleReturn.findMany({
            where: inPeriod,
            select: { items: { select: { drugId: true, quantity: true } }, sale: { select: { items: { select: { drugId: true, quantity: true, cost: true } } } } },
        }),
    ]);
    const revenue = salesAgg._sum.total ?? 0;
    const cogs = saleItems.reduce((s, i) => s + i.cost * i.quantity, 0);
    const expenses = expensesAgg._sum.amount ?? 0;
    const returns = returnsAgg._sum.total ?? 0;
    const costReversal = returnedLines.reduce((s, r) => s + returnedCost(r.items, r.sale.items), 0);
    const gross = revenue - cogs;
    const net = gross - expenses - returns + costReversal;
    return {
        revenue, discount: salesAgg._sum.discount ?? 0, cogs, expenses, returns, costReversal, gross, net,
        margin: revenue > 0 ? (net / revenue) * 100 : 0,
        salesCount: salesAgg._count, returnsCount: returnsAgg._count,
    };
}
