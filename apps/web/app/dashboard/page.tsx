export const dynamic = 'force-dynamic';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import {
    Store, Pill, Package, AlertTriangle, Users, Bell,
    BarChart3, TrendingUp, ShoppingCart, Clock,
    Stethoscope, BookOpen, ClipboardList, Undo2, Building2, Crown,
    Receipt, Banknote, Truck, UserX, CalendarX,
    ChevronLeft, FileText, PackageOpen, Key, Smartphone,
    Activity, ArrowUpRight, Layers
} from "lucide-react";
import Link from "next/link";
import { getAlertStats } from "@/app/lib/alerts";
import { GlassKpiCard } from "@/app/ui/dashboard/kpi-card";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { getSubscriptionState } from "@/app/lib/subscription-state";

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
        prisma.globalDrug.count({ where: { OR: [{ organizationId: null }, { organizationId }] } }),
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
            where: { date: { gte: todayStart }, ...orgBranchWhere },
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
            where: { date: { gte: monthStart }, ...orgBranchWhere },
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
        prisma.saleItem.groupBy({
            by: ['drugId'],
            _sum: { quantity: true },
            where: { sale: { createdAt: { gte: monthStart }, ...orgBranchWhere } },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5,
        }),
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

    const topDrugIds = topDrugs.map((d: any) => d.drugId);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: topDrugIds } },
        select: { id: true, tradeName: true },
    });
    const topDrugsWithNames = topDrugs.map((d: any) => ({
        ...d,
        name: drugs.find((dr: any) => dr.id === d.drugId)?.tradeName || 'غير معروف',
    }));

    // 7-day sales chart
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const rawWeeklySales = await prisma.sale.findMany({
        where: { createdAt: { gte: sevenDaysAgo }, ...orgBranchWhere },
        select: { total: true, createdAt: true },
    });
    const dayMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - (6 - i));
        dayMap[d.toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Baghdad' })] = 0;
    }
    for (const s of rawWeeklySales) {
        const label = new Date(s.createdAt).toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Baghdad' });
        if (label in dayMap) dayMap[label] += s.total || 0;
    }
    const weeklySalesChart = Object.entries(dayMap).map(([day, amount]: any) => ({ day, amount }));

    const todayRevenue = todaySales._sum.total || 0;
    const todayExpenseAmt = todayExpenses._sum.amount || 0;
    const todayReturnsAmt = todayReturns._sum.total || 0;
    const todayNet = todayRevenue - todayExpenseAmt - todayReturnsAmt;

    const monthRevenue = monthSales._sum.total || 0;
    const monthExpenseAmt = monthExpenses._sum.amount || 0;
    const monthReturnsAmt = monthReturns._sum.total || 0;
    const monthNet = monthRevenue - monthExpenseAmt - monthReturnsAmt;

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
        // Alerts & debts
        alerts,
        expiringCount,
        debtorCount: debtors._count,
        debtorBalance: debtors._sum.balance || 0,
        supplierOwed,
        subscriptionInfo,
        // Lists
        recentSales,
        topDrugs: topDrugsWithNames,
        weeklySalesChart,
    };
}

async function getEmployeeData(branchId?: string) {
    const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
    const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
    const now = new Date();
    const todayStart = new Date(Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate()) - IRAQ_OFFSET);
    const in30Days = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const branchWhere = branchId ? { branchId } : {};

    const [drugCount, inventoryCount, todaySales, todayReturns, expiringCount, alerts] = await Promise.all([
        prisma.globalDrug.count(),
        prisma.inventory.count({ where: branchWhere }),
        prisma.sale.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: todayStart }, ...branchWhere },
        }),
        prisma.saleReturn.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: todayStart }, ...branchWhere },
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

    return {
        drugCount, inventoryCount,
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
    const dateLabel = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Baghdad' });

    /* ══════════════════════════════
       SUPER_ADMIN DASHBOARD
    ══════════════════════════════ */
    if (isSuperAdmin) {
        const d = await getSuperAdminData();

        return (
            <main dir="rtl" className="space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-primary to-info">
                            لوحة تحكم المنصة
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            مرحباً {session?.user?.name || 'بك'} ·{' '}
                            <span className="text-primary font-medium">مدير المنصة</span>
                        </p>
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">{dateLabel}</div>
                </div>

                {/* Platform KPIs */}
                <div className="relative rounded-2xl overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-info/10 to-success/10 pointer-events-none" />
                    <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4">
                        <GlassKpiCard
                            title="إجمالي المؤسسات"
                            value={d.orgCount}
                            icon={<Building2 className="w-5 h-5" />}
                            sub={`${d.activeOrgs} نشطة · ${d.suspendedOrgs} موقوفة`}
                            href="/dashboard/admin/tenants"
                        />
                        <GlassKpiCard
                            title="التراخيص النشطة"
                            value={d.activeLicenses}
                            icon={<Key className="w-5 h-5" />}
                            sub="رخصة جهاز كاشير نشطة"
                            href="/dashboard/admin/licenses"
                        />
                        <GlassKpiCard
                            title="جلسات الموبايل"
                            value={d.activeMobileSessions}
                            icon={<Smartphone className="w-5 h-5" />}
                            sub="مستخدم موبايل متصل الآن"
                        />
                        <GlassKpiCard
                            title="إيرادات المنصة"
                            value={`${fmt(d.platformRevenue)} د.ع`}
                            icon={<TrendingUp className="w-5 h-5" />}
                            sub="إجمالي المدفوعات المكتملة"
                            href="/dashboard/admin/tenants"
                        />
                    </div>
                </div>

                {/* Status cards */}
                <div className="grid sm:grid-cols-3 gap-4">
                    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                            <Activity className="w-5 h-5 text-success" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold tabular-nums text-foreground">{d.activeOrgs}</div>
                            <div className="text-xs text-muted-foreground">مؤسسات نشطة</div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold tabular-nums text-foreground">{d.suspendedOrgs}</div>
                            <div className="text-xs text-muted-foreground">مؤسسات موقوفة</div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <PackageOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold tabular-nums text-foreground">{d.distribution.length}</div>
                            <div className="text-xs text-muted-foreground">باقات مستخدمة</div>
                        </div>
                    </div>
                </div>

                {/* Plan distribution */}
                {d.distribution.length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-5">
                        <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-primary" /> توزيع المؤسسات على الباقات
                        </h2>
                        <div className="space-y-3">
                            {d.distribution.map((plan: any) => {
                                const pct = d.orgCount > 0 ? Math.round((plan.count / d.orgCount) * 100) : 0;
                                return (
                                    <div key={plan.name} className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-medium text-foreground">{plan.name}</span>
                                            <span className="text-muted-foreground">{plan.count} مؤسسة ({pct}٪)</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-l from-primary to-info transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Recent organizations */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-foreground flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary" /> آخر المؤسسات المسجلة
                        </h2>
                        <Link href="/dashboard/admin/tenants" className="text-xs text-primary hover:underline flex items-center gap-1">
                            عرض الكل <ChevronLeft className="w-3 h-3" />
                        </Link>
                    </div>
                    {d.recentOrgs.length > 0 ? (
                        <div className="space-y-2">
                            {d.recentOrgs.map((org: any) => (
                                <div key={org.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${org.isSuspended ? 'bg-destructive' : 'bg-success'}`} />
                                        <span className="font-medium text-foreground">{org.name}</span>
                                        {org.plan && (
                                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{org.plan.name}</span>
                                        )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(org.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">لا توجد مؤسسات مسجلة</p>
                    )}
                </div>

                {/* Quick Admin Links */}
                <div>
                    <h2 className="text-base font-bold text-foreground mb-3">وصول سريع</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { href: '/dashboard/admin/tenants', icon: Building2, label: 'إدارة المؤسسات', desc: 'عرض وإدارة المؤسسات', color: 'bg-blue-500/10 text-blue-500' },
                            { href: '/dashboard/admin/plans', icon: PackageOpen, label: 'إدارة الباقات', desc: 'تعديل الباقات وحدودها', color: 'bg-amber-500/10 text-amber-500' },
                            { href: '/dashboard/admin/licenses', icon: Key, label: 'التراخيص', desc: 'تراخيص الأجهزة النشطة', color: 'bg-green-500/10 text-green-500' },
                            { href: '/dashboard/settings', icon: Crown, label: 'إعدادات المنصة', desc: 'أدوات التحكم العالمية', color: 'bg-purple-500/10 text-purple-500' },
                        ].map((link: any) => {
                            const Icon = link.icon;
                            return (
                                <Link key={link.href} href={link.href}
                                    className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:bg-accent hover:shadow-sm transition-all group">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${link.color}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-foreground text-sm group-hover:text-primary transition-colors">{link.label}</h3>
                                        <p className="text-xs text-muted-foreground truncate">{link.desc}</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </main>
        );
    }

    /* ══════════════════════════════
       ADMIN DASHBOARD
    ══════════════════════════════ */
    const isAdmin = role === 'ADMIN';

    if (isAdmin && organizationId) {
        const d = await getAdminData(organizationId, branchId);

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

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-primary to-info">
                            لوحة التحكم
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            مرحباً {session?.user?.name || 'بك'} ·{' '}
                            <span className="text-primary font-medium">{roleLabels[role] || role}</span>
                        </p>
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">{dateLabel}</div>
                </div>

                {/* ── اليوم - KPI ── */}
                <div>
                    <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> ملخص اليوم
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <GlassKpiCard
                                title="مبيعات اليوم"
                                value={`${fmt(d.today.revenue)} د.ع`}
                                icon={<ShoppingCart className="w-5 h-5" />}
                                sub={`${d.today.salesCount} فاتورة`}
                                href="/dashboard/sales"
                            />
                            <GlassKpiCard
                                title="مشتريات اليوم"
                                value={`${fmt(d.today.purchases)} د.ع`}
                                icon={<Receipt className="w-5 h-5" />}
                                sub={`${d.today.purchasesCount} فاتورة شراء`}
                                href="/dashboard/purchases"
                            />
                            <GlassKpiCard
                                title="مصروفات اليوم"
                                value={`${fmt(d.today.expenses)} د.ع`}
                                icon={<Banknote className="w-5 h-5" />}
                                sub="مصروفات تشغيلية"
                                href="/dashboard/expenses"
                            />
                            <GlassKpiCard
                                title="صافي اليوم"
                                value={`${fmt(d.today.net)} د.ع`}
                                icon={<TrendingUp className="w-5 h-5" />}
                                sub="بعد المصروفات والمرتجعات"
                                href="/dashboard/reports/profit"
                            />
                        </div>
                </div>

                {/* ── هذا الشهر ── */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h2 className="font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
                        <BarChart3 className="w-4 h-4 text-primary" /> ملخص الشهر الحالي
                    </h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'إجمالي المبيعات', value: d.month.revenue, sub: `${d.month.salesCount} فاتورة`, icon: ShoppingCart, color: 'text-primary bg-primary/10', href: '/dashboard/reports/sales' },
                            { label: 'إجمالي المشتريات', value: d.month.purchases, sub: `${d.month.purchasesCount} فاتورة`, icon: Receipt, color: 'text-info bg-info/10', href: '/dashboard/purchases' },
                            { label: 'إجمالي المصروفات', value: d.month.expenses, sub: 'هذا الشهر', icon: Banknote, color: 'text-warning bg-warning/10', href: '/dashboard/expenses' },
                            { label: 'صافي الربح', value: d.month.net, sub: 'بعد الخصومات', icon: TrendingUp, color: d.month.net >= 0 ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10', href: '/dashboard/reports/profit' },
                        ].map((item: any) => {
                            const Icon = item.icon;
                            return (
                                <Link key={item.label} href={item.href}
                                    className="flex flex-col gap-2 p-3 rounded-xl bg-muted/40 hover:bg-accent transition-colors group">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold tabular-nums text-foreground">{fmt(item.value)} <span className="text-xs font-normal text-muted-foreground">د.ع</span></div>
                                        <div className="text-xs text-muted-foreground">{item.label}</div>
                                        <div className="text-xs text-muted-foreground opacity-70">{item.sub}</div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* ── التنبيهات والديون ── */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Alerts */}
                    <Link href="/dashboard/alerts"
                        className={`rounded-xl border p-4 flex items-center gap-3 hover:shadow-md transition-all ${d.alerts.total > 0 ? 'border-warning/40 bg-warning/5' : 'border-border bg-card'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.alerts.total > 0 ? 'bg-warning/10' : 'bg-muted'}`}>
                            <Bell className={`w-5 h-5 ${d.alerts.total > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                            <div className="text-xl font-bold tabular-nums text-foreground">{d.alerts.total}</div>
                            <div className="text-xs text-muted-foreground">تنبيه نشط</div>
                            <div className="text-xs text-muted-foreground opacity-70">{d.alerts.expired} منتهٍ · {d.alerts.lowStock} نقص</div>
                        </div>
                    </Link>

                    {/* Expiring */}
                    <Link href="/dashboard/batches"
                        className={`rounded-xl border p-4 flex items-center gap-3 hover:shadow-md transition-all ${d.expiringCount > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.expiringCount > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                            <CalendarX className={`w-5 h-5 ${d.expiringCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                            <div className="text-xl font-bold tabular-nums text-foreground">{d.expiringCount}</div>
                            <div className="text-xs text-muted-foreground">تنتهي خلال 90 يوم</div>
                            <div className="text-xs text-muted-foreground opacity-70">دفعة بها كمية</div>
                        </div>
                    </Link>

                    {/* Debtors */}
                    <Link href="/dashboard/debts"
                        className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:shadow-md transition-all">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                            <UserX className="w-5 h-5 text-orange-500" />
                        </div>
                        <div>
                            <div className="text-xl font-bold tabular-nums text-foreground">{d.debtorCount}</div>
                            <div className="text-xs text-muted-foreground">مريض مدين</div>
                            <div className="text-xs text-muted-foreground opacity-70">{fmt(d.debtorBalance)} د.ع إجمالاً</div>
                        </div>
                    </Link>

                    {/* Supplier outstanding */}
                    <Link href="/dashboard/suppliers"
                        className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:shadow-md transition-all">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                            <Truck className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                            <div className="text-xl font-bold tabular-nums text-foreground">{fmt(d.supplierOwed)}</div>
                            <div className="text-xs text-muted-foreground">مستحق للموردين</div>
                            <div className="text-xs text-muted-foreground opacity-70">د.ع</div>
                        </div>
                    </Link>
                </div>

                {/* ── العدادات ── */}
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                        { label: 'الفروع', value: d.branchCount, icon: Store, href: '/dashboard/branches', color: 'text-blue-500 bg-blue-500/10' },
                        { label: 'الأدوية', value: d.drugCount, icon: Pill, href: '/dashboard/drugs', color: 'text-green-500 bg-green-500/10' },
                        { label: 'المخزون', value: d.inventoryCount, icon: Package, href: '/dashboard/inventory', color: 'text-cyan-500 bg-cyan-500/10' },
                        { label: 'المستخدمين', value: d.userCount, icon: Users, href: '/dashboard/users', color: 'text-violet-500 bg-violet-500/10' },
                        { label: 'المرضى', value: d.patientCount, icon: Stethoscope, href: '/dashboard/patients', color: 'text-rose-500 bg-rose-500/10' },
                        { label: 'الموردين', value: d.supplierCount, icon: Truck, href: '/dashboard/suppliers', color: 'text-amber-500 bg-amber-500/10' },
                    ].map((card: any) => {
                        const Icon = card.icon;
                        return (
                            <Link key={card.label} href={card.href}
                                className="bg-card border border-border rounded-xl p-3 flex flex-col items-center gap-2 hover:shadow-sm hover:scale-[1.02] transition-all text-center">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.color}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div className="text-xl font-bold tabular-nums text-foreground">{card.value}</div>
                                <div className="text-xs text-muted-foreground">{card.label}</div>
                            </Link>
                        );
                    })}
                </div>

                {/* ── مخطط المبيعات 7 أيام ── */}
                <SalesChart data={d.weeklySalesChart} title="مبيعات آخر 7 أيام" />

                {/* ── آخر المبيعات + الأكثر مبيعاً ── */}
                <div className="grid lg:grid-cols-2 gap-6">
                    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-bold text-foreground flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" /> آخر المبيعات
                            </h2>
                            <Link href="/dashboard/sales" className="text-xs text-primary hover:underline flex items-center gap-1">
                                عرض الكل <ChevronLeft className="w-3 h-3" />
                            </Link>
                        </div>
                        {d.recentSales.length > 0 ? (
                            <div className="space-y-2">
                                {d.recentSales.map((sale: any) => (
                                    <div key={sale.id} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg text-sm">
                                        <div>
                                            <span className="font-bold text-foreground">{fmt(sale.total)} <span className="text-xs font-normal text-muted-foreground">د.ع</span></span>
                                            <span className="text-muted-foreground text-xs mr-2">({sale._count.items} صنف)</span>
                                        </div>
                                        <div className="text-left text-xs text-muted-foreground space-y-0.5">
                                            <div>{sale.user?.name || '—'}</div>
                                            <div className="opacity-70">{sale.branch?.name}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm text-center py-6">لا توجد مبيعات اليوم</p>
                        )}
                    </div>

                    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-bold text-foreground flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-success" /> الأكثر مبيعاً هذا الشهر
                            </h2>
                            <Link href="/dashboard/reports/sales" className="text-xs text-primary hover:underline flex items-center gap-1">
                                تقرير كامل <ChevronLeft className="w-3 h-3" />
                            </Link>
                        </div>
                        {d.topDrugs.length > 0 ? (
                            <div className="space-y-2">
                                {d.topDrugs.map((drug: any, i: number) => (
                                    <div key={drug.drugId} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg text-sm">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-warning/20 text-warning' : i === 1 ? 'bg-muted-foreground/20 text-muted-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                {i + 1}
                                            </span>
                                            <span className="font-medium text-foreground truncate">{drug.name}</span>
                                        </div>
                                        <span className="text-primary font-bold shrink-0">{drug._sum.quantity} وحدة</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm text-center py-6">لا توجد بيانات</p>
                        )}
                    </div>
                </div>

                {/* ── وصول سريع ── */}
                <div>
                    <h2 className="text-base font-bold text-foreground mb-3">وصول سريع</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { href: '/dashboard/sales', icon: ShoppingCart, label: 'نقطة البيع', desc: 'إنشاء فاتورة بيع جديدة', color: 'bg-primary/10 text-primary' },
                            { href: '/dashboard/purchases', icon: Receipt, label: 'المشتريات', desc: 'تسجيل فاتورة شراء', color: 'bg-info/10 text-info' },
                            { href: '/dashboard/inventory', icon: Package, label: 'المخزون', desc: 'إدارة الأصناف والكميات', color: 'bg-cyan-500/10 text-cyan-500' },
                            { href: '/dashboard/reports/profit', icon: TrendingUp, label: 'تقرير الأرباح', desc: 'صافي الربح والخسارة', color: 'bg-success/10 text-success' },
                            { href: '/dashboard/patients', icon: Stethoscope, label: 'المرضى', desc: 'إدارة بيانات المرضى', color: 'bg-rose-500/10 text-rose-500' },
                            { href: '/dashboard/suppliers', icon: Truck, label: 'الموردين', desc: 'إدارة الموردين والمدفوعات', color: 'bg-purple-500/10 text-purple-500' },
                            { href: '/dashboard/expenses', icon: Banknote, label: 'المصروفات', desc: 'تسجيل المصروفات التشغيلية', color: 'bg-warning/10 text-warning' },
                            { href: '/dashboard/reports', icon: BarChart3, label: 'التقارير', desc: 'جميع التقارير والتحليلات', color: 'bg-amber-500/10 text-amber-500' },
                            { href: '/dashboard/debts', icon: BookOpen, label: 'دفتر الديون', desc: 'متابعة ديون المرضى', color: 'bg-orange-500/10 text-orange-500' },
                            { href: '/dashboard/alerts', icon: Bell, label: 'التنبيهات', desc: 'انتهاء الصلاحية ونقص المخزون', color: 'bg-destructive/10 text-destructive' },
                            { href: '/dashboard/reports/branch-comparison', icon: Store, label: 'مقارنة الفروع', desc: 'مقارنة أداء الفروع', color: 'bg-teal-500/10 text-teal-500' },
                            { href: '/dashboard/users', icon: Users, label: 'المستخدمين', desc: 'إدارة الموظفين والصلاحيات', color: 'bg-violet-500/10 text-violet-500' },
                        ].map((link: any) => {
                            const Icon = link.icon;
                            return (
                                <Link key={link.href} href={link.href}
                                    className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:bg-accent hover:shadow-sm transition-all group">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${link.color}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-foreground text-sm group-hover:text-primary transition-colors">{link.label}</h3>
                                        <p className="text-xs text-muted-foreground truncate">{link.desc}</p>
                                    </div>
                                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 mr-auto shrink-0 group-hover:text-primary/60 transition-colors" />
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </main>
        );
    }

    /* ══════════════════════════════
       EMPLOYEE DASHBOARD (PHARMACIST / CASHIER)
    ══════════════════════════════ */
    const d = await getEmployeeData(branchId);

    return (
        <main dir="rtl" className="space-y-6">
            {params.denied && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3 text-sm text-destructive">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span className="font-medium">ليس لديك صلاحية للوصول إلى تلك الصفحة.</span>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-primary to-info">
                        لوحة التحكم
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        مرحباً {session?.user?.name || 'بك'} ·{' '}
                        <span className="text-primary font-medium">{roleLabels[role] || role}</span>
                    </p>
                </div>
                <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">{dateLabel}</div>
            </div>

            {/* Today Summary */}
            <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" /> ملخص الوردية
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                    <div className="bg-muted rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <ShoppingCart className="w-4 h-4 text-primary" />
                            <span className="text-xs text-muted-foreground">مبيعات اليوم</span>
                        </div>
                        <div className="text-2xl font-bold text-foreground tabular-nums">{fmt(d.today.revenue)} <span className="text-sm font-normal text-muted-foreground">د.ع</span></div>
                        <p className="text-xs text-muted-foreground mt-1">{d.today.salesCount} فاتورة</p>
                    </div>
                    <div className="bg-muted rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Undo2 className="w-4 h-4 text-warning" />
                            <span className="text-xs text-muted-foreground">المرتجعات</span>
                        </div>
                        <div className="text-2xl font-bold text-foreground tabular-nums">{fmt(d.today.returns)} <span className="text-sm font-normal text-muted-foreground">د.ع</span></div>
                        <p className="text-xs text-muted-foreground mt-1">{d.today.returnsCount} مرتجع</p>
                    </div>
                    <div className="bg-muted rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <TrendingUp className="w-4 h-4 text-success" />
                            <span className="text-xs text-muted-foreground">الصافي</span>
                        </div>
                        <div className="text-2xl font-bold text-foreground tabular-nums">{fmt(d.today.net)} <span className="text-sm font-normal text-muted-foreground">د.ع</span></div>
                        <p className="text-xs text-muted-foreground mt-1">بعد المرتجعات</p>
                    </div>
                </div>
            </div>

            {/* Alerts */}
            {(d.alerts.total > 0 || d.expiringCount > 0) && (
                <div className="grid sm:grid-cols-2 gap-3">
                    {d.alerts.total > 0 && (
                        <Link href="/dashboard/alerts"
                            className="flex items-center gap-3 bg-warning/5 border border-warning/30 rounded-xl p-4 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center shrink-0">
                                <Bell className="w-5 h-5 text-warning" />
                            </div>
                            <div>
                                <div className="font-bold text-foreground">لديك {d.alerts.total} تنبيه</div>
                                <div className="text-xs text-muted-foreground">
                                    {d.alerts.expired > 0 && <span className="text-destructive font-medium">{d.alerts.expired} منتهي الصلاحية</span>}
                                    {d.alerts.expired > 0 && d.alerts.lowStock > 0 && ' · '}
                                    {d.alerts.lowStock > 0 && <span className="text-warning font-medium">{d.alerts.lowStock} نقص مخزون</span>}
                                </div>
                            </div>
                        </Link>
                    )}
                    {d.expiringCount > 0 && (
                        <Link href="/dashboard/batches"
                            className="flex items-center gap-3 bg-destructive/5 border border-destructive/30 rounded-xl p-4 hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center shrink-0">
                                <CalendarX className="w-5 h-5 text-destructive" />
                            </div>
                            <div>
                                <div className="font-bold text-foreground">{d.expiringCount} دفعة تنتهي قريباً</div>
                                <div className="text-xs text-muted-foreground">خلال 30 يوماً القادمة</div>
                            </div>
                        </Link>
                    )}
                </div>
            )}

            {/* Quick Actions */}
            <div>
                <h2 className="text-sm font-bold text-muted-foreground mb-3">الإجراءات السريعة</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {(role === 'PHARMACIST' ? [
                        { href: '/dashboard/sales', icon: ShoppingCart, label: 'نقطة البيع', desc: 'إنشاء فاتورة بيع', gradient: 'from-primary to-primary/80' },
                        { href: '/dashboard/drugs', icon: Pill, label: 'قاعدة الأدوية', desc: `${d.drugCount} دواء مسجل`, gradient: 'from-info to-info/80' },
                        { href: '/dashboard/patients', icon: Stethoscope, label: 'المرضى', desc: 'إدارة بيانات المرضى', gradient: 'from-success to-success/80' },
                        { href: '/dashboard/debts', icon: BookOpen, label: 'دفتر الديون', desc: 'الديون والسداد', gradient: 'from-warning to-warning/80' },
                        { href: '/dashboard/inventory/stocktakes', icon: ClipboardList, label: 'جرد المخزون', desc: `${d.inventoryCount} صنف`, gradient: 'from-cyan-500 to-cyan-500/80' },
                        { href: '/dashboard/returns', icon: Undo2, label: 'المرتجعات', desc: 'إرجاع فواتير', gradient: 'from-rose-500 to-rose-500/80' },
                    ] : [
                        { href: '/dashboard/sales', icon: ShoppingCart, label: 'نقطة البيع', desc: 'إنشاء فاتورة بيع', gradient: 'from-primary to-primary/80' },
                        { href: '/dashboard/returns', icon: Undo2, label: 'المرتجعات', desc: 'إرجاع فواتير', gradient: 'from-info to-info/80' },
                        { href: '/dashboard/debts', icon: BookOpen, label: 'دفتر الديون', desc: 'الديون والسداد', gradient: 'from-success to-success/80' },
                        { href: '/dashboard/patients', icon: Stethoscope, label: 'المرضى', desc: 'بحث عن مريض', gradient: 'from-warning to-warning/80' },
                    ]).map((action: any) => {
                        const Icon = action.icon;
                        return (
                            <Link key={action.href} href={action.href}
                                className={`bg-gradient-to-br ${action.gradient} text-primary-foreground rounded-2xl p-5 shadow-lg hover:scale-[1.02] transition-transform`}>
                                <Icon className="w-7 h-7 mb-3 opacity-80" />
                                <h3 className="font-bold text-lg leading-tight">{action.label}</h3>
                                <p className="text-sm opacity-75 mt-1">{action.desc}</p>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Info cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                        <Pill className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold tabular-nums text-foreground">{d.drugCount}</div>
                        <div className="text-xs text-muted-foreground">دواء مسجل</div>
                    </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-info/10 rounded-xl flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-info" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold tabular-nums text-foreground">{d.inventoryCount}</div>
                        <div className="text-xs text-muted-foreground">صنف في المخزون</div>
                    </div>
                </div>
                <div className={`border rounded-xl p-4 flex items-center gap-3 ${d.alerts.lowStock > 0 ? 'border-warning/30 bg-warning/5' : 'border-border bg-card'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.alerts.lowStock > 0 ? 'bg-warning/10' : 'bg-muted'}`}>
                        <AlertTriangle className={`w-5 h-5 ${d.alerts.lowStock > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                        <div className="text-2xl font-bold tabular-nums text-foreground">{d.alerts.lowStock}</div>
                        <div className="text-xs text-muted-foreground">نقص مخزون</div>
                    </div>
                </div>
                <div className={`border rounded-xl p-4 flex items-center gap-3 ${d.alerts.expired > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.alerts.expired > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                        <CalendarX className={`w-5 h-5 ${d.alerts.expired > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                        <div className="text-2xl font-bold tabular-nums text-foreground">{d.alerts.expired}</div>
                        <div className="text-xs text-muted-foreground">منتهي الصلاحية</div>
                    </div>
                </div>
            </div>
        </main>
    );
}
