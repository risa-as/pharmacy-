export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import {
    BarChart3, TrendingUp, TrendingDown, DollarSign,
    ShoppingCart, Package, AlertTriangle, Activity, Minus
} from "lucide-react";
import DailySalesTrendChart from "@/app/ui/dashboard/reports/daily-sales-trend-chart";
import MonthlyRevenueChart from "@/app/ui/dashboard/reports/monthly-revenue-chart";
import WeekdaySalesChart from "@/app/ui/dashboard/reports/weekday-sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";

function GrowthBadge({ value }: { value: number }) {
    if (value === 0) return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="w-3 h-3" /> 0%</span>;
    const positive = value > 0;
    return (
        <span className={`flex items-center gap-0.5 text-xs font-bold ${positive ? 'text-success' : 'text-destructive'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? '+' : ''}{value}%
        </span>
    );
}

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams?: { branch?: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, tenantWhere, organizationId, user } = tenantCtx;

    // المدير فقط (الأدمن) يمكنه الوصول لهذه الصفحة
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
        redirect('/dashboard');
    }

    const selectedBranchId = searchParams?.branch;
    const branchWhere = selectedBranchId
        ? { ...tenantBranchWhere, branchId: selectedBranchId }
        : tenantBranchWhere;

    let resolvedOrgId = organizationId;
    if (!resolvedOrgId && user.branchId) {
        const branch = await prisma.branch.findUnique({
            where: { id: user.branchId },
            select: { organizationId: true }
        });
        resolvedOrgId = branch?.organizationId ?? undefined;
    }

    if (resolvedOrgId) {
        const upgrade = await requireFeature(resolvedOrgId, 'advancedReports');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [
        thisMonthAgg,
        lastMonthAgg,
        thisMonthItems,
        lastMonthItems,
        last30DaysSales,
        last6MonthsSales,
        inventoryBatches,
        recentlySoldDrugIds,
    ] = await Promise.all([
        prisma.sale.aggregate({
            where: { createdAt: { gte: thisMonthStart }, ...branchWhere },
            _sum: { total: true },
            _count: true,
            _avg: { total: true },
        }),
        prisma.sale.aggregate({
            where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, ...branchWhere },
            _sum: { total: true },
            _count: true,
        }),
        prisma.saleItem.findMany({
            where: { sale: { createdAt: { gte: thisMonthStart }, ...branchWhere } },
            select: { price: true, cost: true, quantity: true },
        }),
        prisma.saleItem.findMany({
            where: { sale: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, ...branchWhere } },
            select: { price: true, cost: true, quantity: true },
        }),
        prisma.sale.findMany({
            where: { createdAt: { gte: thirtyDaysAgo }, ...branchWhere },
            select: { total: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.sale.findMany({
            where: { createdAt: { gte: sixMonthsAgo }, ...branchWhere },
            select: { total: true, createdAt: true },
        }),
        prisma.batch.findMany({
            where: { quantity: { gt: 0 }, inventory: branchWhere },
            select: { quantity: true, costPrice: true, expiryDate: true, inventoryId: true },
        }),
        prisma.saleItem.findMany({
            where: { sale: { createdAt: { gte: ninetyDaysAgo }, ...branchWhere } },
            select: { drugId: true },
            distinct: ['drugId'],
        }).then(rows => new Set(rows.map(r => r.drugId))),
    ]);

    // ── KPIs ────────────────────────────────────────────────────────────────
    const thisMonthRevenue = thisMonthAgg._sum.total ?? 0;
    const lastMonthRevenue = lastMonthAgg._sum.total ?? 0;
    const revenueGrowth = lastMonthRevenue > 0
        ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const thisMonthProfit = thisMonthItems.reduce((s, i) => s + (i.price - i.cost) * i.quantity, 0);
    const lastMonthProfit = lastMonthItems.reduce((s, i) => s + (i.price - i.cost) * i.quantity, 0);
    const profitGrowth = lastMonthProfit > 0
        ? Math.round(((thisMonthProfit - lastMonthProfit) / lastMonthProfit) * 100) : 0;
    const profitMarginPct = thisMonthRevenue > 0
        ? Math.round((thisMonthProfit / thisMonthRevenue) * 100) : 0;

    const avgInvoice = Math.round(thisMonthAgg._avg.total ?? 0);
    const lastMonthAvgRaw = lastMonthAgg._count > 0 ? (lastMonthRevenue / lastMonthAgg._count) : 0;
    const avgGrowth = lastMonthAvgRaw > 0
        ? Math.round(((avgInvoice - lastMonthAvgRaw) / lastMonthAvgRaw) * 100) : 0;

    const thisMonthCount = thisMonthAgg._count;
    const lastMonthCount = lastMonthAgg._count;
    const countGrowth = lastMonthCount > 0
        ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100) : 0;

    // ── Daily trend (last 30 days) ───────────────────────────────────────────
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
        const d = new Date(thirtyDaysAgo);
        d.setDate(d.getDate() + i);
        dailyMap.set(d.toISOString().split('T')[0], 0);
    }
    last30DaysSales.forEach(sale => {
        const day = new Date(sale.createdAt).toISOString().split('T')[0];
        if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + sale.total);
    });
    const dailyTrend = Array.from(dailyMap.entries()).map(([date, revenue]) => ({
        date: date.slice(5),
        revenue: Math.round(revenue),
    }));

    // ── Monthly revenue (last 6 months) ─────────────────────────────────────
    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const monthlyKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthlyKeys.push(`${d.getFullYear()}-${d.getMonth()}`);
    }
    const monthlyMap = new Map<string, number>(monthlyKeys.map(k => [k, 0]));
    last6MonthsSales.forEach(sale => {
        const d = new Date(sale.createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthlyMap.has(key)) monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + sale.total);
    });
    const monthlyRevenue = monthlyKeys.map(key => {
        const [, month] = key.split('-').map(Number);
        return { month: monthNames[month], revenue: Math.round(monthlyMap.get(key) ?? 0) };
    });
    const currentMonthIndex = 5; // last item is current month

    // ── Weekday performance ──────────────────────────────────────────────────
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayData = Array.from({ length: 7 }, (_, i) => ({ day: dayNames[i], total: 0, count: 0 }));
    last6MonthsSales.forEach(sale => {
        const dow = new Date(sale.createdAt).getDay();
        dayData[dow].total += sale.total;
        dayData[dow].count += 1;
    });
    const weekdayPerformance = dayData.map(d => ({
        day: d.day,
        avg: d.count > 0 ? Math.round(d.total / d.count) : 0,
    }));

    // ── Inventory financial health ───────────────────────────────────────────
    // Need drugId per batch: fetch via inventory
    const inventoryIdDrugMap = await prisma.inventory.findMany({
        where: branchWhere,
        select: { id: true, drugId: true },
    }).then(rows => new Map(rows.map(r => [r.id, r.drugId])));

    let totalInventoryValue = 0;
    let deadStockValue = 0;
    let expiringValue = 0;

    inventoryBatches.forEach(batch => {
        const batchValue = batch.quantity * batch.costPrice;
        totalInventoryValue += batchValue;

        if (batch.expiryDate && new Date(batch.expiryDate) > now && new Date(batch.expiryDate) <= ninetyDaysLater) {
            expiringValue += batchValue;
        }

        const drugId = inventoryIdDrugMap.get(batch.inventoryId);
        if (drugId && !recentlySoldDrugIds.has(drugId)) {
            deadStockValue += batchValue;
        }
    });

    const healthyStockValue = Math.max(0, totalInventoryValue - deadStockValue - expiringValue);
    const healthyPercent = totalInventoryValue > 0
        ? Math.round((healthyStockValue / totalInventoryValue) * 100) : 100;

    const busyDayName = weekdayPerformance.reduce((max, d) => d.avg > max.avg ? d : max, weekdayPerformance[0])?.day ?? '—';

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
                    <BarChart3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">لوحة التحليل المتقدم</h1>
                    <p className="text-sm text-muted-foreground">مؤشرات الأداء المالي والتشغيلي — الباقة الاحترافية</p>
                </div>
            </div>

            {/* ── Branch Filter ──────────────────────────────────────────────── */}
            <BranchFilter
                currentBranch={selectedBranchId}
                baseUrl="/dashboard/reports/analytics"
            />

            {/* ── KPI Cards ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Revenue */}
                <div className="glass-card p-4 space-y-2" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">إيرادات هذا الشهر</span>
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <DollarSign className="w-4 h-4 text-primary" />
                        </div>
                    </div>
                    <div className="text-xl font-bold text-foreground" dir="ltr">
                        {Math.round(thisMonthRevenue).toLocaleString('en-US')}
                        <span className="text-xs font-normal text-muted-foreground mr-1">د.ع</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GrowthBadge value={revenueGrowth} />
                        <span>vs الشهر السابق</span>
                    </div>
                </div>

                {/* Profit */}
                <div className="glass-card p-4 space-y-2" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">صافي الربح الإجمالي</span>
                        <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-success" />
                        </div>
                    </div>
                    <div className="text-xl font-bold text-foreground" dir="ltr">
                        {Math.round(thisMonthProfit).toLocaleString('en-US')}
                        <span className="text-xs font-normal text-muted-foreground mr-1">د.ع</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <GrowthBadge value={profitGrowth} />
                        <span className="text-xs text-muted-foreground">هامش {profitMarginPct}%</span>
                    </div>
                </div>

                {/* Avg Invoice */}
                <div className="glass-card p-4 space-y-2" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">متوسط قيمة الفاتورة</span>
                        <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-info" />
                        </div>
                    </div>
                    <div className="text-xl font-bold text-foreground" dir="ltr">
                        {avgInvoice.toLocaleString('en-US')}
                        <span className="text-xs font-normal text-muted-foreground mr-1">د.ع</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GrowthBadge value={avgGrowth} />
                        <span>vs الشهر السابق</span>
                    </div>
                </div>

                {/* Sales Count */}
                <div className="glass-card p-4 space-y-2" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">عدد المبيعات هذا الشهر</span>
                        <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                            <ShoppingCart className="w-4 h-4 text-warning" />
                        </div>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                        {thisMonthCount.toLocaleString('en-US')}
                        <span className="text-xs font-normal text-muted-foreground mr-1">فاتورة</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GrowthBadge value={countGrowth} />
                        <span>vs الشهر السابق</span>
                    </div>
                </div>
            </div>

            {/* ── Daily Revenue Trend ─────────────────────────────────────────── */}
            <div className="glass-card p-5" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="font-bold text-foreground">اتجاه الإيرادات اليومي</h2>
                        <p className="text-xs text-muted-foreground">آخر 30 يوماً</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-bold">30 يوم</span>
                </div>
                <DailySalesTrendChart data={dailyTrend} />
            </div>

            {/* ── Monthly + Weekday ───────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="glass-card p-5" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                    <div className="mb-4">
                        <h2 className="font-bold text-foreground">مقارنة الإيرادات الشهرية</h2>
                        <p className="text-xs text-muted-foreground">آخر 6 أشهر — الشهر الحالي مميّز</p>
                    </div>
                    <MonthlyRevenueChart data={monthlyRevenue} currentMonthIndex={currentMonthIndex} />
                </div>

                <div className="glass-card p-5" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="font-bold text-foreground">أداء أيام الأسبوع</h2>
                            <p className="text-xs text-muted-foreground">متوسط الإيرادات — آخر 6 أشهر</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success font-bold">
                            أنشط: {busyDayName}
                        </span>
                    </div>
                    <WeekdaySalesChart data={weekdayPerformance} />
                </div>
            </div>

            {/* ── Financial Inventory Health ──────────────────────────────────── */}
            <div className="glass-card p-5" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}>
                <div className="flex items-center gap-2 mb-5">
                    <Package className="w-5 h-5 text-primary" />
                    <div>
                        <h2 className="font-bold text-foreground">صحة المخزون المالية</h2>
                        <p className="text-xs text-muted-foreground">تقييم مالي للمخزون الحالي</p>
                    </div>
                </div>

                {/* Health Bar */}
                <div className="mb-5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted-foreground">المخزون الصحي</span>
                        <span className="text-xs font-bold text-foreground">{healthyPercent}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{
                                width: `${healthyPercent}%`,
                                background: healthyPercent >= 70 ? 'hsl(var(--success))' : healthyPercent >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'
                            }}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-success" />
                            <span className="text-xs font-bold text-muted-foreground">قيمة المخزون الكلية</span>
                        </div>
                        <div className="text-lg font-bold text-foreground" dir="ltr">
                            {Math.round(totalInventoryValue).toLocaleString('en-US')}
                            <span className="text-xs font-normal text-muted-foreground mr-1">د.ع</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">بسعر التكلفة</p>
                    </div>

                    <div className="rounded-xl border border-orange-200 bg-warning/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                            <span className="text-xs font-bold text-warning">ينتهي خلال 90 يوم</span>
                        </div>
                        <div className="text-lg font-bold text-foreground" dir="ltr">
                            {Math.round(expiringValue).toLocaleString('en-US')}
                            <span className="text-xs font-normal text-muted-foreground mr-1">د.ع</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalInventoryValue > 0 ? Math.round((expiringValue / totalInventoryValue) * 100) : 0}% من الكل
                        </p>
                    </div>

                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-destructive" />
                            <span className="text-xs font-bold text-destructive">مخزون راكد (+90 يوم)</span>
                        </div>
                        <div className="text-lg font-bold text-foreground" dir="ltr">
                            {Math.round(deadStockValue).toLocaleString('en-US')}
                            <span className="text-xs font-normal text-muted-foreground mr-1">د.ع</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalInventoryValue > 0 ? Math.round((deadStockValue / totalInventoryValue) * 100) : 0}% من الكل — مال مجمّد
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
