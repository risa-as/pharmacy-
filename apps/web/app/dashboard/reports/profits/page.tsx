export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Receipt } from "lucide-react";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";

export default async function ProfitsReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null; // Handle generically for server component
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    // === 1. Last 30 Days Data (Primary View) ===
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const branchWhere = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };

    const sales = await prisma.sale.findMany({
        where: { createdAt: { gte: thirtyDaysAgo }, ...branchWhere },
        include: { items: true },
    });

    const expenses = await prisma.expense.findMany({
        where: { date: { gte: thirtyDaysAgo }, ...branchWhere },
    });

    // Cost Map (branchId_drugId -> cost)
    const costMap = new Map<string, number>();
    let totalInventoryValue = 0;

    const allInventory = await prisma.inventory.findMany({
        where: branchWhere,
        include: { batches: true },
    });

    allInventory.forEach((inv: any) => {
        costMap.set(`${inv.branchId}_${inv.drugId}`, inv.cost);
        const qty = inv.batches.reduce((s: any, b: any) => s + b.quantity, 0);
        totalInventoryValue += inv.cost * qty;
    });

    // Pending purchases
    const pendingPurchases = await prisma.purchase.findMany({
        where: { status: "PENDING", ...branchWhere },
    });
    const totalPendingPurchases = pendingPurchases.reduce((s: any, p: any) => s + p.total, 0);

    // Expense Breakdown
    const expensesByCategory: { [key: string]: number } = {};
    expenses.forEach((e: any) => {
        expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
    });

    // === Calculate Financials ===
    let totalRevenue = 0;
    let totalCOGS = 0;

    sales.forEach((sale: any) => {
        totalRevenue += sale.total;
        sale.items.forEach((item: any) => {
            const cost = costMap.get(`${sale.branchId}_${item.drugId}`) || 0;
            totalCOGS += cost * item.quantity;
        });
    });

    const totalExpenses = expenses.reduce((s: any, e: any) => s + e.amount, 0);
    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = grossProfit - totalExpenses;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // === Daily Profit Chart Data ===
    const profitByDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        profitByDay.set(d.toLocaleDateString("en-GB"), 0);
    }

    sales.forEach((sale: any) => {
        const key = new Date(sale.createdAt).toLocaleDateString("en-GB");
        if (profitByDay.has(key)) {
            let saleCost = 0;
            sale.items.forEach((item: any) => {
                saleCost += (costMap.get(`${sale.branchId}_${item.drugId}`) || 0) * item.quantity;
            });
            profitByDay.set(key, (profitByDay.get(key) || 0) + (sale.total - saleCost));
        }
    });

    const chartData = Array.from(profitByDay.entries()).map(([date, amount]: any) => ({
        day: date,
        amount,
    }));

    // === Monthly Breakdown (Last 6 months) ===
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlySales = await prisma.sale.findMany({
        where: { createdAt: { gte: sixMonthsAgo }, ...branchWhere },
        include: { items: true },
    });

    const monthlyExpenses = await prisma.expense.findMany({
        where: { date: { gte: sixMonthsAgo }, ...branchWhere },
    });

    const monthlyData: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = d.toLocaleDateString("ar-IQ", { month: "long", year: "numeric" });

        const mSales = monthlySales.filter(
            (s: any) => {
                const sd = new Date(s.createdAt);
                return `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, "0")}` === monthKey;
            }
        );
        const mExpenses = monthlyExpenses.filter(
            (e: any) => {
                const ed = new Date(e.date);
                return `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, "0")}` === monthKey;
            }
        );

        const rev = mSales.reduce((s: any, sale: any) => s + sale.total, 0);
        const exp = mExpenses.reduce((s: any, e: any) => s + e.amount, 0);

        monthlyData.push({
            month: monthLabel,
            revenue: rev,
            expenses: exp,
            profit: rev - exp,
        });
    }

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                    <TrendingUp className="w-8 h-8 text-primary" />
                    📈 تقرير الأرباح والخسائر
                </h1>
            </div>

            {/* Branch Filter */}
            <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/profits" />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="w-4 h-4" />
                        إجمالي الإيرادات
                    </div>
                    <div className="text-2xl font-bold text-primary">{totalRevenue.toLocaleString()} د.ع</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingUp className="w-4 h-4" />
                        إجمالي الربح
                    </div>
                    <div className={`text-2xl font-bold ${grossProfit >= 0 ? "text-success" : "text-destructive"}`}>
                        {grossProfit.toLocaleString()} د.ع
                    </div>
                    <div className="text-xs text-muted-foreground">هامش خام: {grossMargin.toFixed(1)}%</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Receipt className="w-4 h-4" />
                        إجمالي المصروفات
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
                    <h2 className="font-bold text-lg text-foreground">📋 قائمة الدخل (آخر 30 يوم)</h2>
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
                        <Calendar className="w-4 h-4" />
                        قيمة المخزون الحالي
                    </div>
                    <div className="text-xl font-bold text-foreground">{totalInventoryValue.toLocaleString()} د.ع</div>
                </div>
                <div className="bg-warning/10 p-5 rounded-xl border border-orange-200">
                    <div className="flex items-center gap-2 text-warning text-sm mb-1">
                        <Receipt className="w-4 h-4" />
                        مشتريات معلقة الدفع
                    </div>
                    <div className="text-xl font-bold text-warning">{totalPendingPurchases.toLocaleString()} د.ع</div>
                </div>
            </div>

            {/* Daily Profit Chart */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-l from-green-50 to-emerald-50 border-b">
                    <h2 className="font-bold text-lg text-foreground">📊 الربح اليومي (آخر 30 يوم)</h2>
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
                        {monthlyData.map((m: any) => (
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
                            .sort((a: any, b: any) => b[1] - a[1])
                            .map(([cat, amount]: any) => {
                                const percent = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                                return (
                                    <div key={cat} className="bg-muted p-4 rounded-xl">
                                        <div className="text-sm text-muted-foreground mb-1">{cat}</div>
                                        <div className="text-lg font-bold text-foreground">{amount.toLocaleString()} د.ع</div>
                                        <div className="mt-2 bg-muted rounded-full h-2">
                                            <div
                                                className="bg-warning h-2 rounded-full"
                                                style={{ width: `${percent}%` }}
                                            />
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
