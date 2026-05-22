export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

const IRAQ_MS = 3 * 60 * 60 * 1000; // UTC+3

function toIraqDateStr(d: Date): string {
    return new Date(d.getTime() + IRAQ_MS).toISOString().split('T')[0];
}

function periodStart(period: string): Date {
    const iraqNow = new Date(Date.now() + IRAQ_MS);
    const y = iraqNow.getUTCFullYear();
    const mo = iraqNow.getUTCMonth();
    const dy = iraqNow.getUTCDate();

    let iraqMidnight: Date;
    if (period === 'monthly') {
        iraqMidnight = new Date(Date.UTC(y, mo, 1)); // 1st of month midnight Iraq
    } else if (period === 'weekly') {
        iraqMidnight = new Date(Date.UTC(y, mo, dy - 6)); // 6 days ago midnight Iraq
    } else {
        iraqMidnight = new Date(Date.UTC(y, mo, dy)); // today midnight Iraq
    }
    return new Date(iraqMidnight.getTime() - IRAQ_MS); // convert back to UTC
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const period = searchParams.get('period') || 'daily';
        const branchId = searchParams.get('branchId');

        const startDate = periodStart(period);

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const baseWhere: any = { createdAt: { gte: startDate }, ...tenantBranchWhere };
        if (branchId) baseWhere.branchId = branchId;

        const expenseWhere: any = { date: { gte: startDate }, ...tenantBranchWhere };
        if (branchId) expenseWhere.branchId = branchId;

        const [totalSales, salesCount, totalExpenses, saleSeries] = await Promise.all([
            prisma.sale.aggregate({ _sum: { total: true }, where: baseWhere }),
            prisma.sale.count({ where: baseWhere }),
            prisma.expense.aggregate({ _sum: { amount: true }, where: expenseWhere }).catch(() => {
                const fw: any = { createdAt: { gte: startDate }, ...tenantBranchWhere };
                if (branchId) fw.branchId = branchId;
                return prisma.expense.aggregate({ _sum: { amount: true }, where: fw });
            }),
            prisma.sale.findMany({
                where: baseWhere,
                select: { createdAt: true, total: true },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        // ── Build chart ────────────────────────────────────────────────────────
        type ChartPoint = { date: string; label: string; amount: number };
        const chart: ChartPoint[] = [];

        if (period === 'daily') {
            // Hourly breakdown in Iraq timezone
            const hourly = new Array(24).fill(0);
            for (const s of saleSeries) {
                const h = (s.createdAt.getUTCHours() + 3) % 24;
                hourly[h] += s.total;
            }
            for (let h = 7; h <= 22; h++) {
                const suffix = h < 12 ? 'ص' : 'م';
                const display = h <= 12 ? h : h - 12;
                chart.push({ date: `${String(h).padStart(2, '0')}:00`, label: `${display}${suffix}`, amount: hourly[h] });
            }
        } else {
            // Daily breakdown grouped by Iraq date
            const byDate: Record<string, number> = {};
            for (const s of saleSeries) {
                const d = toIraqDateStr(s.createdAt);
                byDate[d] = (byDate[d] || 0) + s.total;
            }

            // Fill every day from startDate to today
            const iraqNow = new Date(Date.now() + IRAQ_MS);
            const todayIraq = new Date(Date.UTC(iraqNow.getUTCFullYear(), iraqNow.getUTCMonth(), iraqNow.getUTCDate()));
            const startIraq = new Date(startDate.getTime() + IRAQ_MS);
            const cur = new Date(Date.UTC(startIraq.getUTCFullYear(), startIraq.getUTCMonth(), startIraq.getUTCDate()));

            while (cur <= todayIraq) {
                const d = cur.toISOString().split('T')[0];
                chart.push({ date: d, label: '', amount: byDate[d] || 0 });
                cur.setUTCDate(cur.getUTCDate() + 1);
            }
        }

        const revenue = totalSales._sum.total || 0;
        const expenses = totalExpenses._sum.amount || 0;

        return NextResponse.json({ revenue, expenses, profit: revenue - expenses, transactions: salesCount, chart });
    } catch (error) {
        console.error('Reports API Error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
