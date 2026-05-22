export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Receipt } from "lucide-react";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DateRangeFilter from "@/app/ui/reports/date-range-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';

function parseDateParam(val: string | string[] | undefined) {
    return typeof val === "string" ? val : undefined;
}

function buildDateRange(from?: string, to?: string, fromTime?: string, toTime?: string) {
    const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
    const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
    let start: Date, end: Date, label: string;
    if (from && to) {
        const [fy, fm, fd] = from.split('-').map(Number);
        const [ty, tm, td] = to.split('-').map(Number);
        // Parse as Baghdad dates → convert to UTC (full days for DB; time-of-day filtered in JS)
        start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
        end   = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
        label = fromTime || toTime ? `${from} — ${to} (${fromTime || "00:00"} → ${toTime || "23:59"})` : `${from} — ${to}`;
    } else {
        const todayUtcIraq = Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate());
        end   = new Date(todayUtcIraq + 24 * 60 * 60 * 1000 - 1 - IRAQ_OFFSET);
        start = new Date(todayUtcIraq - 6 * 24 * 60 * 60 * 1000 - IRAQ_OFFSET);
        label = "آخر 7 أيام";
    }
    return { start, end, label };
}

function filterByTimeOfDay<T extends { createdAt: Date | string }>(items: T[], fromTime?: string, toTime?: string): T[] {
    if (!fromTime && !toTime) return items;
    const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const fromMin = fromTime ? toMinutes(fromTime) : 0;
    const toMin = toTime ? toMinutes(toTime) : 23 * 60 + 59;
    const crossesMidnight = fromMin > toMin;
    const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;
    return items.filter(item => {
        const d = new Date(item.createdAt);
        const iraqTime = new Date(d.getTime() + IRAQ_OFFSET_MS);
        const min = iraqTime.getUTCHours() * 60 + iraqTime.getUTCMinutes();
        return crossesMidnight ? (min >= fromMin || min <= toMin) : (min >= fromMin && min <= toMin);
    });
}

function getDaysBetween(start: Date, end: Date) {
    const days: string[] = [];
    const cur = new Date(start); cur.setHours(0, 0, 0, 0);
    const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
    while (cur <= endDay) { days.push(cur.toLocaleDateString("en-GB", { timeZone: "Asia/Baghdad" })); cur.setDate(cur.getDate() + 1); }
    return days;
}

export default async function ProfitsReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere, organizationId } = tenantCtx;

    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'advancedReports');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const branchId = parseDateParam(searchParams.branch);
    const fromParam = parseDateParam(searchParams.from);
    const toParam = parseDateParam(searchParams.to);
    const fromTimeParam = parseDateParam(searchParams.fromTime);
    const toTimeParam = parseDateParam(searchParams.toTime);
    const { start, end, label: periodLabel } = buildDateRange(fromParam, toParam, fromTimeParam, toTimeParam);

    const branchWhere = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // ── Run ALL queries in parallel ──────────────────────────────────────────
    const [salesRaw, expenses, inventoryRaw, pendingTotal, monthlySales, monthlyExpenses] = await Promise.all([
        // Period sales — only fields needed for COGS + revenue
        prisma.sale.findMany({
            where: { createdAt: { gte: start, lte: end }, ...branchWhere },
            select: {
                total: true,
                branchId: true,
                createdAt: true,
                items: { select: { drugId: true, quantity: true } },
            },
        }),
        // Period expenses — only needed fields
        prisma.expense.findMany({
            where: { date: { gte: start, lte: end }, ...branchWhere },
            select: { amount: true, category: true },
        }),
        // Inventory cost map + value — select only what's needed
        prisma.inventory.findMany({
            where: branchWhere,
            select: {
                branchId: true,
                drugId: true,
                cost: true,
                batches: { select: { quantity: true } },
            },
        }),
        // Pending purchases total — aggregate instead of findMany
        prisma.purchase.aggregate({
            where: { status: "PENDING", ...branchWhere },
            _sum: { total: true },
        }),
        // Last 6 months sales for monthly breakdown
        prisma.sale.findMany({
            where: { createdAt: { gte: sixMonthsAgo }, ...branchWhere },
            select: { total: true, createdAt: true },
        }),
        // Last 6 months expenses
        prisma.expense.findMany({
            where: { date: { gte: sixMonthsAgo }, ...branchWhere },
            select: { amount: true, date: true },
        }),
    ]);

    // Filter period sales by time-of-day if specified
    const sales = filterByTimeOfDay(salesRaw, fromTimeParam, toTimeParam);

    // ── Build cost map ───────────────────────────────────────────────────────
    const costMap = new Map<string, number>();
    let totalInventoryValue = 0;
    for (const inv of inventoryRaw) {
        costMap.set(`${inv.branchId}_${inv.drugId}`, inv.cost);
        const qty = inv.batches.reduce((s: number, b: any) => s + b.quantity, 0);
        totalInventoryValue += inv.cost * qty;
    }

    const totalPendingPurchases = pendingTotal._sum.total ?? 0;

    // ── Calculate Financials ─────────────────────────────────────────────────
    let totalRevenue = 0;
    let totalCOGS = 0;
    for (const sale of sales) {
        totalRevenue += sale.total;
        for (const item of sale.items) {
            totalCOGS += (costMap.get(`${sale.branchId}_${item.drugId}`) || 0) * item.quantity;
        }
    }

    const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);
    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = grossProfit - totalExpenses;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const expensesByCategory: Record<string, number> = {};
    for (const e of expenses) {
        expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
    }

    // ── Daily Profit Chart ───────────────────────────────────────────────────
    const days = getDaysBetween(start, end);
    const profitByDay = new Map<string, number>(days.map((d) => [d, 0]));
    for (const sale of sales) {
        const key = new Date(sale.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Baghdad" });
        if (profitByDay.has(key)) {
            let saleCost = 0;
            for (const item of sale.items) {
                saleCost += (costMap.get(`${sale.branchId}_${item.drugId}`) || 0) * item.quantity;
            }
            profitByDay.set(key, (profitByDay.get(key) || 0) + (sale.total - saleCost));
        }
    }
    const chartData = Array.from(profitByDay.entries()).map(([day, amount]) => ({ day, amount }));

    // ── Monthly Breakdown ────────────────────────────────────────────────────
    const monthlyData: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = d.toLocaleDateString("ar-IQ", { month: "long", year: "numeric", timeZone: "Asia/Baghdad" });

        const rev = monthlySales
            .filter((s: any) => {
                const sd = new Date(s.createdAt);
                return `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, "0")}` === monthKey;
            })
            .reduce((s: number, sale: any) => s + sale.total, 0);

        const exp = monthlyExpenses
            .filter((e: any) => {
                const ed = new Date(e.date);
                return `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, "0")}` === monthKey;
            })
            .reduce((s: number, e: any) => s + e.amount, 0);

        monthlyData.push({ month: monthLabel, revenue: rev, expenses: exp, profit: rev - exp });
    }

    const extraParams: Record<string, string | undefined> = branchId ? { branch: branchId } : {};

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                    <TrendingUp className="w-8 h-8 text-primary" />
                    📈 تقرير الأرباح والخسائر
                </h1>
            </div>

            {/* Filters */}
            <div className="space-y-3">
                <DateRangeFilter
                    baseUrl="/dashboard/reports/profits"
                    currentFrom={fromParam}
                    currentTo={toParam}
                    currentFromTime={fromTimeParam}
                    currentToTime={toTimeParam}
                    extraParams={extraParams}
                    showTimeFilter
                />
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/profits" />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="w-4 h-4" />إجمالي الإيرادات
                    </div>
                    <div className="text-2xl font-bold text-primary">{totalRevenue.toLocaleString()} د.ع</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingUp className="w-4 h-4" />إجمالي الربح
                    </div>
                    <div className={`text-2xl font-bold ${grossProfit >= 0 ? "text-success" : "text-destructive"}`}>
                        {grossProfit.toLocaleString()} د.ع
                    </div>
                    <div className="text-xs text-muted-foreground">هامش خام: {grossMargin.toFixed(1)}%</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Receipt className="w-4 h-4" />إجمالي المصروفات
                    </div>
                    <div className="text-2xl font-bold text-warning">{totalExpenses.toLocaleString()} د.ع</div>
                </div>
                <div className={`p-5 rounded-xl border shadow-sm ${netProfit >= 0 ? "bg-success/10 border-green-200" : "bg-destructive/10 border-red-200"}`}>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        {netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        صافي الربح
                    </div>
                    <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                        {netProfit.toLocaleString()} د.ع
                    </div>
                    <div className="text-xs text-muted-foreground">هامش صافي: {netMargin.toFixed(1)}%</div>
                </div>
            </div>

            {/* Income Statement */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-l from-blue-50 to-indigo-50 border-b">
                    <h2 className="font-bold text-lg text-foreground">📋 قائمة الدخل ({periodLabel})</h2>
                </div>
                <div className="p-6 space-y-3">
                    <div className="flex justify-between py-2">
                        <span className="font-bold">إيرادات المبيعات</span>
                        <span className="font-bold text-primary">{totalRevenue.toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex justify-between py-2 text-destructive">
                        <span>(-) تكلفة البضاعة المباعة (COGS)</span>
                        <span>{totalCOGS.toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex justify-between py-2 border-t border-dashed font-bold text-lg">
                        <span>= إجمالي الربح</span>
                        <span className={grossProfit >= 0 ? "text-success" : "text-destructive"}>
                            {grossProfit.toLocaleString()} د.ع
                        </span>
                    </div>
                    <div className="border-t pt-2 space-y-1">
                        {Object.entries(expensesByCategory).map(([cat, amount]: any) => (
                            <div key={cat} className="flex justify-between py-1 text-sm text-muted-foreground">
                                <span>(-) {cat}</span>
                                <span>{amount.toLocaleString()} د.ع</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between py-3 border-t-2 font-bold text-xl">
                        <span>= صافي الربح</span>
                        <span className={netProfit >= 0 ? "text-success" : "text-destructive"}>
                            {netProfit.toLocaleString()} د.ع
                        </span>
                    </div>
                </div>
            </div>

            {/* Balance Quick Look */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Calendar className="w-4 h-4" />قيمة المخزون الحالي
                    </div>
                    <div className="text-xl font-bold text-foreground">{totalInventoryValue.toLocaleString()} د.ع</div>
                </div>
                <div className="bg-warning/10 p-5 rounded-xl border border-orange-200">
                    <div className="flex items-center gap-2 text-warning text-sm mb-1">
                        <Receipt className="w-4 h-4" />مشتريات معلقة الدفع
                    </div>
                    <div className="text-xl font-bold text-warning">{totalPendingPurchases.toLocaleString()} د.ع</div>
                </div>
            </div>

            {/* Daily Profit Chart */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-l from-green-50 to-emerald-50 border-b">
                    <h2 className="font-bold text-lg text-foreground">📊 الربح اليومي ({periodLabel})</h2>
                </div>
                <div className="p-6">
                    <SalesChart data={chartData} />
                </div>
            </div>

            {/* Monthly Breakdown */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-l from-purple-50 to-indigo-50 border-b">
                    <h2 className="font-bold text-lg text-foreground">📅 التوزيع الشهري (آخر 6 أشهر)</h2>
                </div>
                <table className="w-full">
                    <thead className="bg-muted text-muted-foreground text-sm border-b">
                        <tr>
                            <th className="px-4 py-3 text-right font-bold">الشهر</th>
                            <th className="px-4 py-3 text-right font-bold">الإيرادات</th>
                            <th className="px-4 py-3 text-right font-bold">المصروفات</th>
                            <th className="px-4 py-3 text-right font-bold">صافي الربح</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {monthlyData.map((m) => (
                            <tr key={m.month} className="hover:bg-muted">
                                <td className="px-4 py-3 font-bold">{m.month}</td>
                                <td className="px-4 py-3 text-primary">{m.revenue.toLocaleString()} د.ع</td>
                                <td className="px-4 py-3 text-warning">{m.expenses.toLocaleString()} د.ع</td>
                                <td className={`px-4 py-3 font-bold ${m.profit >= 0 ? "text-success" : "text-destructive"}`}>
                                    {m.profit.toLocaleString()} د.ع
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Expense Distribution */}
            {Object.keys(expensesByCategory).length > 0 && (
                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                    <div className="px-6 py-4 bg-gradient-to-l from-orange-50 to-red-50 border-b">
                        <h2 className="font-bold text-lg text-foreground">📊 توزيع المصروفات</h2>
                    </div>
                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(expensesByCategory)
                            .sort((a, b) => (b[1] as number) - (a[1] as number))
                            .map(([cat, amount]: any) => {
                                const percent = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                                return (
                                    <div key={cat} className="bg-muted p-4 rounded-xl">
                                        <div className="text-sm text-muted-foreground mb-1">{cat}</div>
                                        <div className="text-lg font-bold text-foreground">{amount.toLocaleString()} د.ع</div>
                                        <div className="mt-2 bg-background rounded-full h-2">
                                            <div className="bg-warning h-2 rounded-full" style={{ width: `${percent}%` }} />
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">{percent.toFixed(1)}%</div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}
        </div>
    );
}
