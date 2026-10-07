import { operatingExpenseWhere } from '@/app/lib/expense-categories';
import { returnedCost, saleMargin } from '@/app/lib/profit-math';
import { HandCoins } from "@/app/ui/debts/debt-icon";
export const dynamic = 'force-dynamic';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import {
    Store, Pill, Package, AlertTriangle, Users, Bell,
    BarChart3, TrendingUp, ShoppingCart, Clock,
    Stethoscope, ClipboardList, Undo2, Building2, Crown,
    Receipt, Banknote, Truck, UserX, CalendarX,
    ChevronLeft, FileText, PackageOpen, Key, Smartphone,
    Activity, ArrowUpRight, Layers
} from "lucide-react";
import Link from "next/link";
import { getAlertStats } from "@/app/lib/alerts";
import StatCard from "@/app/ui/dashboard/stat-card";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import PerformanceTabs, { type PerformancePeriod } from "@/app/ui/dashboard/performance-tabs";
import SalesProfitChart from "@/app/ui/dashboard/sales-profit-chart";
import MySalesTabs, { type MySalesPeriod } from "@/app/ui/dashboard/my-sales-tabs";
import { chartChange } from "@/app/lib/chart-change";
import { getTopSellers } from "@/app/lib/top-sellers";
import { getSubscriptionState } from "@/app/lib/subscription-state";
import { buildSalesByLocalDateQuery, type DailySalesRow } from "@/app/lib/report-sales-aggregates";

/* ─────────────────────────────────────────────
   Data helpers
───────────────────────────────────────────── */

async function getSuperAdminData() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
        orgCount,
        activeOrgs,
        suspendedOrgs,
        activeLicenses,
        activeMobileSessions,
        platformRevenue,
        planDistribution,
        recentOrgs,
    ] = await Promise.all([
        prisma.organization.count(),
        prisma.organization.count({ where: { isSuspended: false } }),
        prisma.organization.count({ where: { isSuspended: true } }),
        prisma.deviceLicense.count({ where: { isActive: true } }),
        prisma.mobileSession.count({ where: { isActive: true } }),
        prisma.paymentTransaction.aggregate({
            _sum: { amount: true },
            where: { status: 'COMPLETED' },
        }),
        prisma.organization.groupBy({
            by: ['planId'],
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
        }),
        prisma.organization.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, isSuspended: true, createdAt: true, plan: { select: { name: true } } },
        }),
    ]);

    // Resolve plan names for distribution
    const planIds = planDistribution.map((p: any) => p.planId).filter(Boolean);
    const plans = await prisma.subscriptionPlan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true },
    });
    const planMap = Object.fromEntries(plans.map((p: any) => [p.id, p.name]));
    const distribution = planDistribution.map((p: any) => ({
        name: p.planId ? (planMap[p.planId] || 'غير معروف') : 'بدون باقة',
        count: p._count.id,
    }));

    return {
        orgCount, activeOrgs, suspendedOrgs,
        activeLicenses, activeMobileSessions,
        platformRevenue: platformRevenue._sum.amount || 0,
        distribution,
        recentOrgs,
    };
}

async function getAdminData(organizationId: string, branchId?: string) {
    const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
    const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
    const now = new Date();
    const todayStart = new Date(Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate()) - IRAQ_OFFSET);
    const monthStart = new Date(Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), 1) - IRAQ_OFFSET);
    const in90Days = new Date(todayStart.getTime() + 90 * 24 * 60 * 60 * 1000);

    const orgBranchWhere = { branch: { organizationId } };
    const orgWhere = { organizationId };

    const [
        // Entity counts
        branchCount, userCount, drugCount, inventoryCount, patientCount, supplierCount,
        // Today financials
        todaySales, todayPurchases, todayExpenses, todayReturns,
        // Month financials
        monthSales, monthPurchases, monthExpenses, monthReturns,
        // Alerts & stock
        expiringCount, debtors,
        // Lists
        recentSales, topDrugs, alerts,
        // Supplier outstanding
        purchaseOutstanding,
        // Subscription state
        orgInfo,
    ] = await Promise.all([
        prisma.branch.count({ where: orgWhere }),
        prisma.user.count({ where: orgBranchWhere }),
        prisma.globalDrug.count({ where: { OR: [{ organizationId: null, warehouseId: null }, { organizationId }] } }),
        prisma.inventory.count({ where: orgBranchWhere }),
        prisma.patient.count({ where: { branch: { organizationId } } }),
        prisma.supplier.count({ where: { organizationId } }),

        prisma.sale.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: todayStart }, ...orgBranchWhere },
        }),
        prisma.purchase.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: todayStart }, ...orgBranchWhere },
        }),
        prisma.expense.aggregate({
            _sum: { amount: true },
            where: { ...operatingExpenseWhere, date: { gte: todayStart }, ...orgBranchWhere },
        }),
        prisma.saleReturn.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: todayStart }, ...orgBranchWhere },
        }),

        prisma.sale.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: monthStart }, ...orgBranchWhere },
        }),
        prisma.purchase.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: monthStart }, ...orgBranchWhere },
        }),
        prisma.expense.aggregate({
            _sum: { amount: true },
            where: { ...operatingExpenseWhere, date: { gte: monthStart }, ...orgBranchWhere },
        }),
        prisma.saleReturn.aggregate({
            _sum: { total: true },
            where: { createdAt: { gte: monthStart }, ...orgBranchWhere },
        }),

        prisma.batch.count({
            where: {
                quantity: { gt: 0 },
                expiryDate: { gte: now, lte: in90Days },
                inventory: orgBranchWhere,
            },
        }),
        prisma.patient.aggregate({
            _count: true, _sum: { balance: true },
            where: { balance: { gt: 0 }, branch: { organizationId } },
        }),

        prisma.sale.findMany({
            take: 6,
            orderBy: { createdAt: 'desc' },
            where: orgBranchWhere,
            include: {
                user: { select: { name: true } },
                branch: { select: { name: true } },
                _count: { select: { items: true } },
            },
        }),
        // Net of returns, ties ordered by name (see app/lib/top-sellers.ts).
        getTopSellers({ saleScope: orgBranchWhere, since: monthStart, limit: 5 }),
        getAlertStats(undefined, organizationId),

        prisma.purchase.aggregate({
            _sum: { total: true, paidAmount: true },
            where: { status: { not: 'CANCELLED' }, ...orgBranchWhere },
        }),
        prisma.organization.findUnique({
            where: { id: organizationId },
            select: { subscriptionEndsAt: true, isSuspended: true },
        }),
    ]);


    // 7-day sales chart
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const weeklySalesRows = await prisma.$queryRaw<DailySalesRow[]>(
        buildSalesByLocalDateQuery({
            tenantBranchWhere: orgBranchWhere,
            start: sevenDaysAgo,
            timeZone: 'Asia/Baghdad',
        }),
    );
    const weeklySalesByDate = new Map(weeklySalesRows.map((row) => [row.date, row.total]));
    const dayMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - (6 - i));
        const label = d.toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Baghdad' });
        const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
        dayMap[label] = weeklySalesByDate.get(dateKey) ?? 0;
    }
    const weeklySalesChart = Object.entries(dayMap).map(([day, amount]: any) => ({ day, amount }));

    // 7-day NET profit chart: gross profit (price - cost) × qty − returns − expenses, per day
    const dayKey = (date: Date | string) =>
        new Date(date).toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Baghdad' });

    const [rawWeeklyItems, rawWeeklyReturns, rawWeeklyExpenses] = await Promise.all([
        prisma.sale.findMany({
            where: { createdAt: { gte: sevenDaysAgo }, ...orgBranchWhere },
            select: { total: true, createdAt: true, items: { select: { cost: true, quantity: true } } },
        }),
        prisma.saleReturn.findMany({
            where: { createdAt: { gte: sevenDaysAgo }, ...orgBranchWhere },
            select: { total: true, createdAt: true, items: { select: { drugId: true, quantity: true } }, sale: { select: { items: { select: { drugId: true, quantity: true, cost: true } } } } },
        }),
        prisma.expense.findMany({
            where: { ...operatingExpenseWhere, date: { gte: sevenDaysAgo }, ...orgBranchWhere },
            select: { amount: true, date: true },
        }),
    ]);

    const netDayMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
        const dt = new Date(todayStart);
        dt.setDate(dt.getDate() - (6 - i));
        netDayMap[dayKey(dt)] = 0;
    }
    for (const item of rawWeeklyItems) {
        const label = dayKey(item.createdAt);
        if (label in netDayMap) netDayMap[label] += saleMargin(item);
    }
    for (const r of rawWeeklyReturns) {
        const label = dayKey(r.createdAt);
        if (label in netDayMap) netDayMap[label] -= r.total - returnedCost(r.items, r.sale.items);
    }
    for (const e of rawWeeklyExpenses) {
        const label = dayKey(e.date);
        if (label in netDayMap) netDayMap[label] -= e.amount;
    }
    const weeklyProfitChart = Object.entries(netDayMap).map(([day, amount]: any) => ({ day, amount: Math.round(amount) }));

    // Comparison baselines for the performance tabs: the previous period up to the same
    // elapsed time (so a morning is not compared with all of yesterday).
    const DAY = 24 * 60 * 60 * 1000;
    const sinceToday = now.getTime() - todayStart.getTime();
    const prevWeekStart = new Date(sevenDaysAgo.getTime() - 7 * DAY);
    const prevMonthStart = new Date(Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth() - 1, 1) - IRAQ_OFFSET);
    const prevMonthCut = new Date(Math.min(monthStart.getTime(), prevMonthStart.getTime() + (now.getTime() - monthStart.getTime())));
    const [weekPurchases, yesterdaySoFar, prevWeekSales, prevMonthSoFar] = await Promise.all([
        prisma.purchase.aggregate({ _sum: { total: true }, _count: true, where: { createdAt: { gte: sevenDaysAgo }, ...orgBranchWhere } }),
        prisma.sale.aggregate({ _sum: { total: true }, where: { createdAt: { gte: new Date(todayStart.getTime() - DAY), lt: new Date(todayStart.getTime() - DAY + sinceToday) }, ...orgBranchWhere } }),
        prisma.sale.aggregate({ _sum: { total: true }, where: { createdAt: { gte: prevWeekStart, lt: new Date(prevWeekStart.getTime() + (now.getTime() - sevenDaysAgo.getTime())) }, ...orgBranchWhere } }),
        prisma.sale.aggregate({ _sum: { total: true }, where: { createdAt: { gte: prevMonthStart, lt: prevMonthCut }, ...orgBranchWhere } }),
    ]);
    // Same net formula as the month: sales − cost − (returns − returned cost) − expenses.
    const todayNetProfit = netDayMap[dayKey(todayStart)] ?? 0;
    const weekNetProfit = Object.values(netDayMap).reduce((sum, v) => sum + v, 0);
    const weekRevenue = rawWeeklyItems.reduce((sum, s) => sum + s.total, 0);
    const weekExpenses = rawWeeklyExpenses.reduce((sum, e) => sum + e.amount, 0);

    const todayRevenue = todaySales._sum.total || 0;
    const todayExpenseAmt = todayExpenses._sum.amount || 0;
    const todayReturnsAmt = todayReturns._sum.total || 0;
    const todayNet = todayRevenue - todayExpenseAmt - todayReturnsAmt;

    const monthRevenue = monthSales._sum.total || 0;
    const monthExpenseAmt = monthExpenses._sum.amount || 0;
    const monthReturnsAmt = monthReturns._sum.total || 0;
    const [monthCostItems, monthReturnItems] = await Promise.all([
        prisma.saleItem.findMany({ where: { sale: { ...orgBranchWhere, createdAt: { gte: monthStart } } }, select: { cost: true, quantity: true } }),
        prisma.saleReturn.findMany({ where: { ...orgBranchWhere, createdAt: { gte: monthStart } }, select: {
            items: { select: { drugId: true, quantity: true } }, sale: { select: { items: { select: { drugId: true, quantity: true, cost: true } } } },
        } }),
    ]);
    const monthCost = monthCostItems.reduce((sum, item) => sum + item.cost * item.quantity, 0);
    const reversedCost = monthReturnItems.reduce((sum, item) => sum + returnedCost(item.items, item.sale.items), 0);
    const monthNet = monthRevenue - monthExpenseAmt - monthReturnsAmt - monthCost + reversedCost;

    const supplierOwed = (purchaseOutstanding._sum.total || 0) - (purchaseOutstanding._sum.paidAmount || 0);

    const subscriptionInfo = getSubscriptionState({
        subscriptionEndsAt: orgInfo?.subscriptionEndsAt ?? null,
        isSuspended: orgInfo?.isSuspended ?? false,
    });

    return {
        // Counts
        branchCount, userCount, drugCount, inventoryCount, patientCount, supplierCount,
        // Today
        today: {
            revenue: todayRevenue,
            salesCount: todaySales._count,
            purchases: todayPurchases._sum.total || 0,
            purchasesCount: todayPurchases._count,
            expenses: todayExpenseAmt,
            returns: todayReturnsAmt,
            returnsCount: todayReturns._count,
            net: todayNet,
        },
        // Month
        month: {
            revenue: monthRevenue,
            salesCount: monthSales._count,
            purchases: monthPurchases._sum.total || 0,
            purchasesCount: monthPurchases._count,
            expenses: monthExpenseAmt,
            returns: monthReturnsAmt,
            net: monthNet,
        },
        periods: [
            {
                key: 'today', label: 'اليوم', compareLabel: 'عن نفس الوقت أمس',
                revenue: todayRevenue, salesCount: todaySales._count,
                purchases: todayPurchases._sum.total || 0, purchasesCount: todayPurchases._count,
                expenses: todayExpenseAmt, net: Math.round(todayNetProfit),
                change: chartChange(yesterdaySoFar._sum.total || 0, todayRevenue),
            },
            {
                key: 'week', label: 'آخر 7 أيام', compareLabel: 'عن الأيام السبعة السابقة',
                revenue: weekRevenue, salesCount: rawWeeklyItems.length,
                purchases: weekPurchases._sum.total || 0, purchasesCount: weekPurchases._count,
                expenses: weekExpenses, net: Math.round(weekNetProfit),
                change: chartChange(prevWeekSales._sum.total || 0, weekRevenue),
            },
            {
                key: 'month', label: 'هذا الشهر', compareLabel: 'عن نفس الفترة من الشهر الماضي',
                revenue: monthRevenue, salesCount: monthSales._count,
                purchases: monthPurchases._sum.total || 0, purchasesCount: monthPurchases._count,
                expenses: monthExpenseAmt, net: Math.round(monthNet),
                change: chartChange(prevMonthSoFar._sum.total || 0, monthRevenue),
            },
        ] satisfies PerformancePeriod[],
        // Alerts & debts
        alerts,
        expiringCount,
        debtorCount: debtors._count,
        debtorBalance: debtors._sum.balance || 0,
        supplierOwed,
        subscriptionInfo,
        // Lists
        recentSales,
        topDrugs,
        weeklySalesChart,
        weeklyProfitChart,
    };
}

async function getEmployeeData(branchId?: string, userId?: string) {
    const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
    const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
    const now = new Date();
    const todayStart = new Date(Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate()) - IRAQ_OFFSET);
    const in30Days = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const branchWhere = branchId ? { branchId } : {};

    // ملخص الوردية يعرض فقط مبيعات ومرتجعات هذا الموظف تحديداً
    const myShiftSaleWhere = {
        createdAt: { gte: todayStart },
        ...branchWhere,
        ...(userId ? { userId } : {}),
    };
    const myShiftReturnWhere = {
        createdAt: { gte: todayStart },
        ...branchWhere,
        ...(userId ? { sale: { userId } } : {}),
    };

    const [drugCount, inventoryCount, todaySales, todayReturns, expiringCount, alerts] = await Promise.all([
        prisma.globalDrug.count({ where: { warehouseId: null } }),
        prisma.inventory.count({ where: branchWhere }),
        prisma.sale.aggregate({
            _sum: { total: true }, _count: true,
            where: myShiftSaleWhere,
        }),
        prisma.saleReturn.aggregate({
            _sum: { total: true }, _count: true,
            where: myShiftReturnWhere,
        }),
        prisma.batch.count({
            where: {
                quantity: { gt: 0 },
                expiryDate: { gte: now, lte: in30Days },
                inventory: branchWhere,
            },
        }),
        getAlertStats(branchId, undefined),
    ]);

    // The same employee's sales for the last 7 days and this month, each compared with the
    // previous period up to the same elapsed time (a morning is not compared with all of yesterday).
    const DAY = 24 * 60 * 60 * 1000;
    const weekStart = new Date(todayStart.getTime() - 6 * DAY);
    const monthStart = new Date(Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), 1) - IRAQ_OFFSET);
    const prevMonthStart = new Date(Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth() - 1, 1) - IRAQ_OFFSET);
    const mySales = { ...branchWhere, ...(userId ? { userId } : {}) };
    const myReturns = { ...branchWhere, ...(userId ? { sale: { userId } } : {}) };
    const salesBetween = (gte: Date, lt?: Date) => prisma.sale.aggregate({
        _sum: { total: true }, _count: true,
        where: { ...mySales, createdAt: lt ? { gte, lt } : { gte } },
    });
    const returnsSince = (gte: Date) => prisma.saleReturn.aggregate({
        _sum: { total: true }, _count: true,
        where: { ...myReturns, createdAt: { gte } },
    });
    const sameElapsed = (prevStart: Date, start: Date) =>
        new Date(Math.min(start.getTime(), prevStart.getTime() + (now.getTime() - start.getTime())));
    const yesterdayStart = new Date(todayStart.getTime() - DAY);
    const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY);
    const [weekSales, weekReturns, monthSales, monthReturns, yesterdaySoFar, prevWeekSoFar, prevMonthSoFar] = await Promise.all([
        salesBetween(weekStart), returnsSince(weekStart),
        salesBetween(monthStart), returnsSince(monthStart),
        salesBetween(yesterdayStart, sameElapsed(yesterdayStart, todayStart)),
        salesBetween(prevWeekStart, sameElapsed(prevWeekStart, weekStart)),
        salesBetween(prevMonthStart, sameElapsed(prevMonthStart, monthStart)),
    ]);
    const period = (
        key: MySalesPeriod['key'], label: string, compareLabel: string,
        sales: { _sum: { total: number | null }; _count: number },
        returns: { _sum: { total: number | null }; _count: number },
        previous: { _sum: { total: number | null } },
    ): MySalesPeriod => {
        const revenue = sales._sum.total || 0;
        const returned = returns._sum.total || 0;
        return {
            key, label, compareLabel, revenue, salesCount: sales._count,
            returns: returned, returnsCount: returns._count, net: revenue - returned,
            change: chartChange(previous._sum.total || 0, revenue),
        };
    };

    return {
        drugCount, inventoryCount,
        periods: [
            period('today', 'اليوم', 'عن نفس الوقت أمس', todaySales, todayReturns, yesterdaySoFar),
            period('week', 'آخر 7 أيام', 'عن الأيام السبعة السابقة', weekSales, weekReturns, prevWeekSoFar),
            period('month', 'هذا الشهر', 'عن نفس الفترة من الشهر الماضي', monthSales, monthReturns, prevMonthSoFar),
        ],
        today: {
            revenue: todaySales._sum.total || 0,
            salesCount: todaySales._count,
            returns: todayReturns._sum.total || 0,
            returnsCount: todayReturns._count,
            net: (todaySales._sum.total || 0) - (todayReturns._sum.total || 0),
        },
        expiringCount,
        alerts,
    };
}

/* ─────────────────────────────────────────────
   Formatting
───────────────────────────────────────────── */
const roleLabels: Record<string, string> = {
    ADMIN: 'مدير النظام',
    PHARMACIST: 'صيدلي',
    CASHIER: 'كاشير',
};

function fmt(v: number) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
}

/** «2:41 م» in Baghdad time, whatever the server clock is. */
function saleTime(date: Date | string) {
    return new Date(date).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Baghdad' });
}

function greetingNow() {
    const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Baghdad' }).format(new Date()));
    return hour >= 5 && hour < 12 ? 'صباح الخير' : 'مساء الخير';
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default async function Page({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
    const params = await searchParams;
    const session = await auth();
    const role = session?.user?.role || 'CASHIER';
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const organizationId = ((session?.user as any)?.organizationId as string) || undefined;
    const branchId = (session?.user?.branchId as string) || undefined;
    const userId = (session?.user?.id as string) || undefined;
    const dateLabel = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Baghdad' });

    /* ══════════════════════════════
       SUPER_ADMIN DASHBOARD
    ══════════════════════════════ */
    if (isSuperAdmin) {
        const d = await getSuperAdminData();

        return (
            <main dir="rtl" className="space-y-6">
                {/* Header: greeting + the main platform actions */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {greetingNow()}، {session?.user?.name || 'بك'}
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {dateLabel} · <span className="font-medium text-primary">مدير المنصة</span>
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href="/dashboard/admin/plans" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                            <PackageOpen className="h-4 w-4 text-amber-500" /> الباقات
                        </Link>
                        <Link href="/dashboard/admin/tenants" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">
                            <Building2 className="h-4 w-4" /> إدارة المؤسسات
                        </Link>
                    </div>
                </div>

                {/* ── أرقام المنصة ── */}
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="المؤسسات" value={fmt(d.orgCount)} unit="مؤسسة" icon={Building2} tone="primary" bar
                        href="/dashboard/admin/tenants"
                        footer={
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success tabular-nums">{fmt(d.activeOrgs)} نشطة</span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${d.suspendedOrgs > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{fmt(d.suspendedOrgs)} موقوفة</span>
                            </div>
                        }
                    />
                    <StatCard
                        label="التراخيص النشطة" value={fmt(d.activeLicenses)} unit="رخصة" icon={Key} tone="success" bar
                        href="/dashboard/admin/licenses"
                        footer={<span className="text-xs text-muted-foreground">أجهزة كاشير مفعّلة</span>}
                    />
                    <StatCard
                        label="جلسات الموبايل" value={fmt(d.activeMobileSessions)} unit="جلسة" icon={Smartphone} tone="info" bar
                        footer={<span className="text-xs text-muted-foreground">مستخدمو التطبيق المتصلون الآن</span>}
                    />
                    <StatCard
                        label="إيرادات المنصة" value={fmt(d.platformRevenue)} unit="د.ع" icon={TrendingUp} tone="warning" bar
                        href="/dashboard/admin/tenants"
                        footer={<span className="text-xs text-muted-foreground">إجمالي المدفوعات المكتملة</span>}
                    />
                </section>

                {/* ── المؤسسات الموقوفة تحتاج انتباهاً ── */}
                {d.suspendedOrgs > 0 && (
                    <Link href="/dashboard/admin/tenants" className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm transition-colors hover:bg-destructive/10">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                            <AlertTriangle className="h-4 w-4" />
                        </span>
                        <span className="flex-1">
                            <span className="font-bold text-foreground">{fmt(d.suspendedOrgs)} مؤسسة موقوفة</span>
                            <span className="ms-2 text-muted-foreground">راجع حالة اشتراكها من إدارة المؤسسات</span>
                        </span>
                        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                )}

                {/* ── آخر المؤسسات + توزيع الباقات ── */}
                <section className="grid gap-4 lg:grid-cols-3">
                    <div className="min-w-0 rounded-xl border border-border bg-card lg:col-span-2">
                        <div className="flex items-center justify-between px-5 pb-3 pt-4">
                            <h2 className="text-sm font-bold text-foreground">آخر المؤسسات المسجلة</h2>
                            <Link href="/dashboard/admin/tenants" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                عرض الكل <ChevronLeft className="h-3 w-3" />
                            </Link>
                        </div>
                        {d.recentOrgs.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[28rem] text-sm">
                                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                                        <tr>
                                            <th className="px-5 py-2 text-start font-semibold">المؤسسة</th>
                                            <th className="py-2 text-start font-semibold">الباقة</th>
                                            <th className="py-2 text-start font-semibold">الحالة</th>
                                            <th className="px-5 py-2 text-end font-semibold">تاريخ التسجيل</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {d.recentOrgs.map((org: any) => (
                                            <tr key={org.id} className="transition-colors hover:bg-muted/40">
                                                <td className="px-5 py-2.5 font-medium text-foreground">{org.name}</td>
                                                <td className="py-2.5 text-muted-foreground">{org.plan?.name || 'بدون باقة'}</td>
                                                <td className="py-2.5">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${org.isSuspended ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${org.isSuspended ? 'bg-destructive' : 'bg-success'}`} />
                                                        {org.isSuspended ? 'موقوفة' : 'نشطة'}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-5 py-2.5 text-end text-muted-foreground tabular-nums">
                                                    {new Date(org.createdAt).toLocaleDateString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad' })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد مؤسسات مسجلة</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-foreground">توزيع الباقات</h2>
                            <span className="text-xs text-muted-foreground">{fmt(d.distribution.length)} باقة مستخدمة</span>
                        </div>
                        {d.distribution.length > 0 ? (
                            <div className="space-y-3.5 text-sm">
                                {d.distribution.map((plan: any) => {
                                    const pct = d.orgCount > 0 ? Math.round((plan.count / d.orgCount) * 100) : 0;
                                    return (
                                        <div key={plan.name}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium text-foreground">{plan.name}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmt(plan.count)} · {pct}٪</span>
                                            </div>
                                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد اشتراكات بعد</p>
                        )}
                    </div>
                </section>

                {/* ── وصول سريع ── */}
                <section>
                    <h2 className="mb-3 text-sm font-bold text-foreground">وصول سريع</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { href: '/dashboard/admin/tenants', icon: Building2, label: 'إدارة المؤسسات', desc: 'عرض وإدارة المؤسسات', color: 'bg-blue-500/10 text-blue-500' },
                            { href: '/dashboard/admin/plans', icon: PackageOpen, label: 'إدارة الباقات', desc: 'تعديل الباقات وحدودها', color: 'bg-amber-500/10 text-amber-500' },
                            { href: '/dashboard/admin/licenses', icon: Key, label: 'التراخيص', desc: 'تراخيص الأجهزة النشطة', color: 'bg-green-500/10 text-green-600' },
                            { href: '/dashboard/settings', icon: Crown, label: 'إعدادات المنصة', desc: 'أدوات التحكم العالمية', color: 'bg-purple-500/10 text-purple-500' },
                        ].map((link) => {
                            const Icon = link.icon;
                            return (
                                <Link key={link.href} href={link.href}
                                    className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${link.color}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{link.label}</h3>
                                        <p className="truncate text-xs text-muted-foreground">{link.desc}</p>
                                    </div>
                                    <ChevronLeft className="ms-auto h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                                </Link>
                            );
                        })}
                    </div>
                </section>
            </main>
        );
    }

    /* ══════════════════════════════
       ADMIN DASHBOARD
    ══════════════════════════════ */
    const isAdmin = role === 'ADMIN';

    if (isAdmin && organizationId) {
        const d = await getAdminData(organizationId, branchId);
        const greeting = greetingNow();

        return (
            <main dir="rtl" className="space-y-6">
                {params.denied && (
                    <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3 text-sm text-destructive">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <span className="font-medium">ليس لديك صلاحية للوصول إلى تلك الصفحة. تواصل مع المدير لتعديل صلاحياتك.</span>
                    </div>
                )}

                {/* Subscription expiry warning banner */}
                {d.subscriptionInfo.state === 'warning' && d.subscriptionInfo.daysUntilExpiry !== null && (
                    <Link href="/dashboard/settings/billing"
                        className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning hover:bg-warning/15 transition-colors">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div className="flex-1">
                            <span className="font-bold">تنبيه: اشتراكك ينتهي خلال {d.subscriptionInfo.daysUntilExpiry} {d.subscriptionInfo.daysUntilExpiry === 1 ? 'يوم' : 'أيام'}.</span>
                            <span className="mr-1 opacity-80">اضغط هنا لتجديد اشتراكك والحفاظ على الوصول الكامل.</span>
                        </div>
                        <ChevronLeft className="w-4 h-4 shrink-0" />
                    </Link>
                )}
                {d.subscriptionInfo.state === 'grace' && (
                    <Link href="/dashboard/settings/billing"
                        className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive hover:bg-destructive/15 transition-colors">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div className="flex-1">
                            <span className="font-bold">انتهى اشتراكك! أنت في فترة السماح.</span>
                            <span className="mr-1 opacity-80">جدد اشتراكك فوراً لتجنب إيقاف الحساب.</span>
                        </div>
                        <ChevronLeft className="w-4 h-4 shrink-0" />
                    </Link>
                )}
                {d.subscriptionInfo.state === 'suspended' && (
                    <div className="flex items-center gap-3 rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div className="flex-1">
                            <span className="font-bold">الحساب موقوف.</span>
                            <span className="mr-1 opacity-80">تواصل مع الدعم لإعادة تفعيل اشتراكك.</span>
                        </div>
                    </div>
                )}

                {/* Header: greeting + the two most used actions */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {greeting}، {session?.user?.name || 'بك'}
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {dateLabel} · <span className="font-medium text-primary">{roleLabels[role] || role}</span> · الفروع: {fmt(d.branchCount)}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href="/dashboard/reports/profit" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                            <TrendingUp className="h-4 w-4 text-success" /> تقرير الأرباح
                        </Link>
                        <Link href="/dashboard/pos-temp" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">
                            <ShoppingCart className="h-4 w-4" /> فتح نقطة البيع
                        </Link>
                    </div>
                </div>

                {/* ── يحتاج انتباهك ── */}
                {/* Alerts and expiring stock keep a clear warning signal when there is
                    something to act on: a coloured side bar, a tinted border and a pulsing dot. */}
                <section>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                            <span className={`h-2 w-2 rounded-full ${d.alerts.total > 0 || d.expiringCount > 0 ? 'bg-warning' : 'bg-success'}`} aria-hidden="true" />
                            يحتاج انتباهك
                        </h2>
                        <Link href="/dashboard/alerts" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                            كل التنبيهات <ChevronLeft className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            {
                                key: 'alerts', href: '/dashboard/alerts', icon: Bell, label: 'تنبيهات نشطة',
                                value: fmt(d.alerts.total), unit: null as string | null,
                                attention: d.alerts.total > 0, tone: 'warning' as const,
                                footer: d.alerts.total > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive tabular-nums">{fmt(d.alerts.expired)} منتهٍ</span>
                                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning tabular-nums">{fmt(d.alerts.lowStock)} نقص</span>
                                    </div>
                                ) : <span className="text-xs text-muted-foreground">لا توجد تنبيهات</span>,
                            },
                            {
                                key: 'expiring', href: '/dashboard/batches', icon: CalendarX, label: 'تنتهي خلال 90 يوماً',
                                value: fmt(d.expiringCount), unit: 'دفعة',
                                attention: d.expiringCount > 0, tone: 'destructive' as const,
                                footer: <span className="text-xs text-muted-foreground">{d.expiringCount > 0 ? 'دفعات بها كمية — راجعها قبل الانتهاء' : 'لا توجد دفعات قريبة الانتهاء'}</span>,
                            },
                            {
                                key: 'debtors', href: '/dashboard/debts', icon: UserX, label: 'مرضى مدينون',
                                value: fmt(d.debtorCount), unit: 'مريض',
                                attention: false, tone: 'orange' as const,
                                footer: <span className="text-xs text-muted-foreground">الإجمالي <span className="font-semibold text-foreground tabular-nums">{fmt(d.debtorBalance)}</span> د.ع</span>,
                            },
                            {
                                key: 'suppliers', href: '/dashboard/suppliers', icon: Truck, label: 'مستحق للموردين',
                                value: fmt(d.supplierOwed), unit: 'د.ع',
                                attention: false, tone: 'purple' as const,
                                footer: <span className="text-xs text-muted-foreground">{d.supplierOwed > 0 ? 'رصيد مفتوح لدى الموردين' : 'لا توجد مستحقات'}</span>,
                            },
                        ].map((c) => {
                            const Icon = c.icon;
                            const tones = {
                                warning: { bar: 'bg-warning', border: 'border-warning/40', chip: 'bg-warning/10 text-warning', dot: 'bg-warning' },
                                destructive: { bar: 'bg-destructive', border: 'border-destructive/40', chip: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
                                orange: { bar: '', border: '', chip: 'bg-orange-500/10 text-orange-500', dot: '' },
                                purple: { bar: '', border: '', chip: 'bg-purple-500/10 text-purple-500', dot: '' },
                            }[c.tone];
                            return (
                                <Link
                                    key={c.key}
                                    href={c.href}
                                    className={`group relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${c.attention ? tones.border : 'border-border'}`}
                                >
                                    {c.attention && <span className={`absolute inset-y-0 start-0 w-1 ${tones.bar}`} aria-hidden="true" />}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                                            <p className="mt-2 truncate text-2xl font-bold tabular-nums text-foreground">
                                                {c.value}
                                                {c.unit && <span className="ms-1 text-sm font-normal text-muted-foreground">{c.unit}</span>}
                                            </p>
                                        </div>
                                        <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.attention || !tones.bar ? tones.chip : 'bg-muted text-muted-foreground'}`}>
                                            <Icon className="h-5 w-5" />
                                            {c.attention && (
                                                <span className="absolute -top-1 -end-1 flex h-3 w-3" aria-label="يحتاج متابعة">
                                                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping ${tones.dot}`} />
                                                    <span className={`relative inline-flex h-3 w-3 rounded-full ring-2 ring-card ${tones.dot}`} />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-4 border-t border-border/60 pt-3">{c.footer}</div>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                {/* ── الأداء: اليوم / آخر 7 أيام / هذا الشهر ── */}
                <PerformanceTabs periods={d.periods} />

                {/* ── المخطط + الأكثر مبيعاً ── */}
                <section className="grid gap-4 lg:grid-cols-3">
                    <div className="min-w-0 lg:col-span-2">
                        <SalesProfitChart
                            data={d.weeklySalesChart.map((s: any, i: number) => ({ day: s.day, sales: s.amount, profit: d.weeklyProfitChart[i]?.amount ?? 0 }))}
                        />
                    </div>
                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-foreground">الأكثر مبيعاً هذا الشهر</h2>
                            <Link href="/dashboard/reports/top-sellers?period=month" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                التقرير <ChevronLeft className="h-3 w-3" />
                            </Link>
                        </div>
                        {d.topDrugs.length > 0 ? (
                            <div className="space-y-3.5 text-sm">
                                {d.topDrugs.map((drug: any) => {
                                    const top = d.topDrugs[0]?.quantity || 0;
                                    const qty = drug.quantity;
                                    const pct = top > 0 ? Math.max(4, Math.round((qty / top) * 100)) : 0;
                                    return (
                                        <div key={drug.drugId}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium text-foreground">{drug.name}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmt(qty)} وحدة</span>
                                            </div>
                                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مبيعات هذا الشهر</p>
                        )}
                    </div>
                </section>

                {/* ── آخر المبيعات + نظرة عامة واختصارات ── */}
                <section className="grid gap-4 lg:grid-cols-3">
                    <div className="min-w-0 rounded-xl border border-border bg-card lg:col-span-2">
                        <div className="flex items-center justify-between px-5 pb-3 pt-4">
                            <h2 className="text-sm font-bold text-foreground">آخر المبيعات</h2>
                            <Link href="/dashboard/sales" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                عرض الكل <ChevronLeft className="h-3 w-3" />
                            </Link>
                        </div>
                        {d.recentSales.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[28rem] text-sm">
                                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                                        <tr>
                                            <th className="px-5 py-2 text-start font-semibold">الوقت</th>
                                            <th className="py-2 text-start font-semibold">الفرع</th>
                                            <th className="py-2 text-start font-semibold">الموظف</th>
                                            <th className="py-2 text-start font-semibold">الأصناف</th>
                                            <th className="px-5 py-2 text-end font-semibold">المبلغ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {d.recentSales.map((sale: any) => (
                                            <tr key={sale.id} className="transition-colors hover:bg-muted/40">
                                                <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground tabular-nums">{saleTime(sale.createdAt)}</td>
                                                <td className="py-2.5 text-foreground">{sale.branch?.name || '—'}</td>
                                                <td className="py-2.5 text-foreground">{sale.user?.name || '—'}</td>
                                                <td className="py-2.5 text-muted-foreground tabular-nums">{sale._count.items}</td>
                                                <td className="whitespace-nowrap px-5 py-2.5 text-end font-bold text-foreground tabular-nums">
                                                    {fmt(sale.total)} <span className="text-xs font-normal text-muted-foreground">د.ع</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد مبيعات بعد</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5">
                        <h2 className="mb-3 text-sm font-bold text-foreground">نظرة عامة</h2>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            {[
                                { label: 'الفروع', value: d.branchCount, icon: Store, href: '/dashboard/branches', color: 'text-blue-500' },
                                { label: 'الأدوية', value: d.drugCount, icon: Pill, href: '/dashboard/drugs', color: 'text-green-600' },
                                { label: 'المخزون', value: d.inventoryCount, icon: Package, href: '/dashboard/inventory', color: 'text-cyan-600' },
                                { label: 'المستخدمون', value: d.userCount, icon: Users, href: '/dashboard/users', color: 'text-violet-500' },
                                { label: 'المرضى', value: d.patientCount, icon: Stethoscope, href: '/dashboard/patients', color: 'text-rose-500' },
                                { label: 'الموردون', value: d.supplierCount, icon: Truck, href: '/dashboard/suppliers', color: 'text-amber-600' },
                            ].map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Link key={item.label} href={item.href} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 transition-colors hover:bg-muted">
                                        <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                                        <span className="truncate text-muted-foreground">{item.label}</span>
                                        <span className="ms-auto font-bold text-foreground tabular-nums">{fmt(item.value)}</span>
                                    </Link>
                                );
                            })}
                        </div>
                        <h2 className="mb-3 mt-5 text-sm font-bold text-foreground">اختصارات</h2>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
                            {[
                                { label: 'شراء', icon: Receipt, href: '/dashboard/purchases', color: 'text-info' },
                                { label: 'مصروف', icon: Banknote, href: '/dashboard/expenses', color: 'text-warning' },
                                { label: 'الديون', icon: HandCoins, href: '/dashboard/debts', color: 'text-orange-500' },
                            ].map((s) => {
                                const Icon = s.icon;
                                return (
                                    <Link key={s.href} href={s.href} className="rounded-lg border border-border py-2.5 text-foreground transition-colors hover:bg-muted">
                                        <Icon className={`mx-auto mb-1 h-4 w-4 ${s.color}`} />
                                        {s.label}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </main>
        );
    }

    /* ══════════════════════════════
       EMPLOYEE DASHBOARD (PHARMACIST / CASHIER)
    ══════════════════════════════ */
    const d = await getEmployeeData(branchId, userId);

    return (
        <main dir="rtl" className="space-y-6">
            {params.denied && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3 text-sm text-destructive">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span className="font-medium">ليس لديك صلاحية للوصول إلى تلك الصفحة.</span>
                </div>
            )}

            {/* Header: greeting + the main action */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {greetingNow()}، {session?.user?.name || 'بك'}
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {dateLabel} · <span className="font-medium text-primary">{roleLabels[role] || role}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href="/dashboard/returns" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                        <Undo2 className="h-4 w-4 text-warning" /> مرتجع
                    </Link>
                    <Link href="/dashboard/pos-temp" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">
                        <ShoppingCart className="h-4 w-4" /> فتح نقطة البيع
                    </Link>
                </div>
            </div>

            {/* ── يحتاج انتباهك ── */}
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <span className={`h-2 w-2 rounded-full ${d.alerts.total > 0 || d.expiringCount > 0 ? 'bg-warning' : 'bg-success'}`} aria-hidden="true" />
                        يحتاج انتباهك
                    </h2>
                    <Link href="/dashboard/alerts" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        كل التنبيهات <ChevronLeft className="h-3 w-3" />
                    </Link>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="تنبيهات نشطة" value={fmt(d.alerts.total)} icon={Bell} tone="warning"
                        attention={d.alerts.total > 0} href="/dashboard/alerts"
                        footer={d.alerts.total > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive tabular-nums">{fmt(d.alerts.expired)} منتهٍ</span>
                                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning tabular-nums">{fmt(d.alerts.lowStock)} نقص</span>
                            </div>
                        ) : <span className="text-xs text-muted-foreground">لا توجد تنبيهات</span>}
                    />
                    <StatCard
                        label="تنتهي خلال 30 يوماً" value={fmt(d.expiringCount)} unit="دفعة" icon={CalendarX} tone="destructive"
                        attention={d.expiringCount > 0} href="/dashboard/batches"
                        footer={<span className="text-xs text-muted-foreground">{d.expiringCount > 0 ? 'قدّم بيعها أو راجعها قبل الانتهاء' : 'لا توجد دفعات قريبة الانتهاء'}</span>}
                    />
                    <StatCard
                        label="نقص المخزون" value={fmt(d.alerts.lowStock)} unit="صنف" icon={AlertTriangle} tone="warning"
                        attention={d.alerts.lowStock > 0} href="/dashboard/alerts"
                        footer={<span className="text-xs text-muted-foreground">{d.alerts.lowStock > 0 ? 'أقل من الحد الأدنى' : 'المخزون ضمن الحدود'}</span>}
                    />
                    <StatCard
                        label="منتهي الصلاحية" value={fmt(d.alerts.expired)} unit="صنف" icon={CalendarX} tone="destructive"
                        attention={d.alerts.expired > 0} href="/dashboard/alerts"
                        footer={<span className="text-xs text-muted-foreground">{d.alerts.expired > 0 ? 'أخرجه من الرفوف ولا تبعه' : 'لا يوجد منتهٍ'}</span>}
                    />
                </div>
            </section>

            {/* ── مبيعاتي: مبيعات ومرتجعات هذا الموظف فقط، اليوم / آخر 7 أيام / هذا الشهر ── */}
            <MySalesTabs periods={d.periods} />

            {/* ── الإجراءات السريعة + نظرة عامة ── */}
            <section className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
                    <h2 className="mb-3 text-sm font-bold text-foreground">الإجراءات السريعة</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {(role === 'PHARMACIST' ? [
                            { href: '/dashboard/pos-temp', icon: ShoppingCart, label: 'نقطة البيع', desc: 'إنشاء فاتورة بيع', color: 'bg-primary/10 text-primary' },
                            { href: '/dashboard/drugs', icon: Pill, label: 'قاعدة الأدوية', desc: `${fmt(d.drugCount)} دواء مسجل`, color: 'bg-info/10 text-info' },
                            { href: '/dashboard/patients', icon: Stethoscope, label: 'المرضى', desc: 'إدارة بيانات المرضى', color: 'bg-rose-500/10 text-rose-500' },
                            { href: '/dashboard/debts', icon: HandCoins, label: 'دفتر الديون', desc: 'الديون والسداد', color: 'bg-orange-500/10 text-orange-500' },
                            { href: '/dashboard/inventory/stocktakes', icon: ClipboardList, label: 'جرد المخزون', desc: `${fmt(d.inventoryCount)} صنف`, color: 'bg-cyan-500/10 text-cyan-600' },
                            { href: '/dashboard/returns', icon: Undo2, label: 'المرتجعات', desc: 'إرجاع فواتير', color: 'bg-warning/10 text-warning' },
                        ] : [
                            { href: '/dashboard/pos-temp', icon: ShoppingCart, label: 'نقطة البيع', desc: 'إنشاء فاتورة بيع', color: 'bg-primary/10 text-primary' },
                            { href: '/dashboard/returns', icon: Undo2, label: 'المرتجعات', desc: 'إرجاع فواتير', color: 'bg-warning/10 text-warning' },
                            { href: '/dashboard/debts', icon: HandCoins, label: 'دفتر الديون', desc: 'الديون والسداد', color: 'bg-orange-500/10 text-orange-500' },
                            { href: '/dashboard/patients', icon: Stethoscope, label: 'المرضى', desc: 'بحث عن مريض', color: 'bg-rose-500/10 text-rose-500' },
                        ]).map((action) => {
                            const Icon = action.icon;
                            return (
                                <Link key={action.href} href={action.href}
                                    className="group flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.color}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{action.label}</h3>
                                        <p className="truncate text-xs text-muted-foreground">{action.desc}</p>
                                    </div>
                                    <ChevronLeft className="ms-auto h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                                </Link>
                            );
                        })}
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <h2 className="mb-3 text-sm font-bold text-foreground">نظرة عامة</h2>
                    <div className="space-y-2 text-sm">
                        {[
                            { label: 'دواء مسجل', value: d.drugCount, icon: Pill, color: 'text-green-600' },
                            { label: 'صنف في المخزون', value: d.inventoryCount, icon: Package, color: 'text-cyan-600' },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.label} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
                                    <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                                    <span className="truncate text-muted-foreground">{item.label}</span>
                                    <span className="ms-auto font-bold text-foreground tabular-nums">{fmt(item.value)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
        </main>
    );
}
