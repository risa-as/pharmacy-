import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import {
    Store, Pill, Package, AlertTriangle, Users, Bell,
    BarChart3, TrendingUp, DollarSign, ShoppingCart, Clock,
    Stethoscope, BookOpen, ClipboardList, Undo2, Building2, Crown
} from "lucide-react";
import Link from "next/link";
import { getAlertStats } from "@/app/lib/alerts";
import { GlassKpiCard } from "@/app/ui/dashboard/kpi-card";
import SalesChart from "@/app/ui/dashboard/sales-chart";

async function getDashboardData(isAdmin: boolean, organizationId?: string, branchId?: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const inventoryWhere = isAdmin ? { branch: { organizationId } } : { branchId };

    // Basic data everyone can see
    const [drugCount, inventoryCount, alerts] = await Promise.all([
        prisma.globalDrug.count(),
        prisma.inventory.count({ where: inventoryWhere }),
        getAlertStats(isAdmin ? undefined : branchId, isAdmin ? organizationId : undefined),
    ]);

    if (!isAdmin) {
        return {
            drugCount, inventoryCount, alerts, isAdmin: false as const,
            branchCount: 0, userCount: 0,
            today: { revenue: 0, salesCount: 0, expenses: 0, returns: 0, returnsCount: 0 },
            month: { revenue: 0, salesCount: 0, expenses: 0 },
            recentSales: [] as any[],
            topDrugs: [] as any[],
            weeklySalesChart: [] as { day: string; amount: number }[],
        };
    }

    // Admin-only financial data
    const orgWhere = { organizationId };
    const orgBranchWhere = { branch: { organizationId } };

    const [
        branchCount, userCount,
        todaySales, todayExpenses, monthSales, monthExpenses,
        recentSales, topDrugs, todayReturns,
    ] = await Promise.all([
        prisma.branch.count({ where: orgWhere }),
        prisma.user.count({ where: orgBranchWhere }),
        prisma.sale.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: todayStart }, ...orgBranchWhere }
        }),
        prisma.expense.aggregate({
            _sum: { amount: true },
            where: { date: { gte: todayStart }, ...orgBranchWhere }
        }),
        prisma.sale.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: monthStart }, ...orgBranchWhere }
        }),
        prisma.expense.aggregate({
            _sum: { amount: true },
            where: { date: { gte: monthStart }, ...orgBranchWhere }
        }),
        prisma.sale.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            where: orgBranchWhere,
            include: {
                user: { select: { name: true } },
                branch: { select: { name: true } },
                _count: { select: { items: true } }
            }
        }),
        prisma.saleItem.groupBy({
            by: ['drugId'],
            _sum: { quantity: true, cost: true },
            where: { sale: { createdAt: { gte: monthStart }, ...orgBranchWhere } },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5
        }),
        prisma.saleReturn.aggregate({
            _sum: { total: true }, _count: true,
            where: { createdAt: { gte: todayStart }, ...orgBranchWhere }
        }),
    ]);

    const topDrugIds = topDrugs.map((d: any) => d.drugId);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: topDrugIds } },
        select: { id: true, tradeName: true }
    });
    const topDrugsWithNames = topDrugs.map((d: any) => ({
        ...d,
        name: drugs.find((dr: any) => dr.id === d.drugId)?.tradeName || 'غير معروف'
    }));

    // 7-day sales chart data
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const rawWeeklySales = await prisma.sale.findMany({
        where: { createdAt: { gte: sevenDaysAgo }, ...orgBranchWhere },
        select: { total: true, createdAt: true },
    });
    // Build ordered day buckets
    const dayMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - (6 - i));
        const label = d.toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric' });
        dayMap[label] = 0;
    }
    for (const s of rawWeeklySales) {
        const label = new Date(s.createdAt).toLocaleDateString('ar-IQ', { weekday: 'short', day: 'numeric' });
        if (label in dayMap) dayMap[label] += s.total || 0;
    }
    const weeklySalesChart = Object.entries(dayMap).map(([day, amount]) => ({ day, amount }));

    return {
        drugCount, inventoryCount, alerts, isAdmin: true,
        branchCount, userCount,
        today: {
            revenue: todaySales._sum.total || 0,
            salesCount: todaySales._count,
            expenses: todayExpenses._sum.amount || 0,
            returns: todayReturns._sum.total || 0,
            returnsCount: todayReturns._count,
        },
        month: {
            revenue: monthSales._sum.total || 0,
            salesCount: monthSales._count,
            expenses: monthExpenses._sum.amount || 0,
        },
        recentSales,
        topDrugs: topDrugsWithNames,
        weeklySalesChart,
    };
}

const roleLabels: Record<string, string> = {
    ADMIN: 'مدير النظام',
    PHARMACIST: 'صيدلي',
    CASHIER: 'كاشير',
};

export default async function Page({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
    const params = await searchParams;
    const session = await auth();
    const role = session?.user?.role || 'CASHIER';
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const organizationId = ((session?.user as any)?.organizationId as string) || undefined;
    const branchId = (session?.user?.branchId as string) || undefined;

    if (isSuperAdmin) {
        const orgCount = await prisma.organization.count();
        const activeLicenses = await prisma.deviceLicense.count({ where: { isActive: true } });

        return (
            <main dir="rtl" className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-primary to-info">
                            لوحة تحكم المنصة
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            مرحباً {session?.user?.name || 'بك'} · <span className="text-primary font-medium">مدير المنصة (SUPER_ADMIN)</span>
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-foreground tabular-nums">{orgCount}</div>
                            <div className="text-xs text-muted-foreground">إجمالي المؤسسات</div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-info/10">
                            <Crown className="w-5 h-5 text-info" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-foreground tabular-nums">{activeLicenses}</div>
                            <div className="text-xs text-muted-foreground">التراخيص النشطة</div>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    const isAdmin = role === 'ADMIN';
    const data = await getDashboardData(isAdmin, organizationId, branchId);

    const fmt = (v: number) => new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 0 }).format(v);

    return (
        <main dir="rtl" className="space-y-6">
            {params.denied && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3 text-sm text-destructive">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                    <span className="font-medium">ليس لديك صلاحية للوصول إلى تلك الصفحة. تواصل مع المدير لتعديل صلاحياتك.</span>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-primary to-info">
                        لوحة التحكم
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        مرحباً {session?.user?.name || 'بك'} · <span className="text-primary font-medium">{roleLabels[role] || role}</span>
                    </p>
                </div>
                <div className="text-xs text-muted-foreground">{new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            {/* ═══════════ ADMIN DASHBOARD ═══════════ */}
            {isAdmin && data.isAdmin && (
                <>
                    {/* Today Summary — Glassmorphism KPI Cards */}
                    <div className="relative rounded-2xl overflow-hidden">
                        {/* Gradient backdrop that glass blurs against */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-info/10 to-success/10 pointer-events-none" />
                        <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4 p-4">
                            <GlassKpiCard
                                title="مبيعات اليوم"
                                value={`${fmt(data.today.revenue)} د.ع`}
                                icon={<ShoppingCart className="w-5 h-5" />}
                                sub={`${data.today.salesCount} فاتورة`}
                                href="/dashboard/sales"
                            />
                            <GlassKpiCard
                                title="صافي ربح اليوم"
                                value={`${fmt(data.today.revenue - data.today.expenses - data.today.returns)} د.ع`}
                                icon={<TrendingUp className="w-5 h-5" />}
                                sub="بعد المصروفات والمرتجعات"
                                href="/dashboard/reports/profit"
                            />
                            <GlassKpiCard
                                title="مبيعات الشهر"
                                value={`${fmt(data.month.revenue)} د.ع`}
                                icon={<BarChart3 className="w-5 h-5" />}
                                sub={`${data.month.salesCount} فاتورة`}
                                href="/dashboard/reports/sales"
                            />
                            <GlassKpiCard
                                title="التنبيهات"
                                value={data.alerts.total}
                                icon={<Bell className="w-5 h-5" />}
                                sub={`${data.alerts.expired} منتهي · ${data.alerts.lowStock} نقص`}
                                href="/dashboard/alerts"
                            />
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { label: "الفروع", value: data.branchCount, icon: Store, href: "/dashboard/branches" },
                            { label: "الأدوية", value: data.drugCount, icon: Pill, href: "/dashboard/drugs" },
                            { label: "المخزون", value: data.inventoryCount, icon: Package, href: "/dashboard/inventory" },
                            { label: "المستخدمين", value: data.userCount, icon: Users, href: "/dashboard/users" },
                        ].map((card) => {
                            const Icon = card.icon;
                            return (
                                <Link key={card.label} href={card.href}
                                    className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Icon className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-foreground tabular-nums">{card.value}</div>
                                        <div className="text-xs text-muted-foreground">{card.label}</div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Weekly Sales Chart */}
                    <SalesChart data={data.weeklySalesChart} title="مبيعات آخر 7 أيام" />

                    {/* Recent Sales + Top Drugs */}
                    <div className="grid lg:grid-cols-2 gap-6">
                        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
                            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" /> آخر المبيعات
                            </h2>
                            {data.recentSales.length > 0 ? (
                                <div className="space-y-2">
                                    {data.recentSales.map((sale: any) => (
                                        <div key={sale.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                                            <div>
                                                <span className="font-medium text-foreground">{fmt(sale.total)} د.ع</span>
                                                <span className="text-muted-foreground text-xs mr-2">({sale._count.items} صنف)</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {sale.user?.name || '—'} · {sale.branch?.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm text-center py-4">لا توجد مبيعات اليوم</p>
                            )}
                        </div>

                        <div className="bg-card border border-border rounded-xl shadow-sm p-5">
                            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-success" /> الأكثر مبيعاً (هذا الشهر)
                            </h2>
                            {data.topDrugs.length > 0 ? (
                                <div className="space-y-2">
                                    {data.topDrugs.map((drug: any, i: number) => (
                                        <div key={drug.drugId} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground'}`}>
                                                    {i + 1}
                                                </span>
                                                <span className="font-medium text-foreground">{drug.name}</span>
                                            </div>
                                            <span className="text-primary font-bold">{drug._sum.quantity} وحدة</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm text-center py-4">لا توجد بيانات</p>
                            )}
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h2 className="text-lg font-bold text-foreground mb-3">وصول سريع</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                { href: "/dashboard/reports/profit", icon: TrendingUp, label: "تقرير الأرباح", desc: "صافي الربح والخسارة" },
                                { href: "/dashboard/reports/branch-comparison", icon: Store, label: "مقارنة الفروع", desc: "مقارنة أداء كل الفروع" },
                                { href: "/dashboard/inventory/margin-warnings", icon: AlertTriangle, label: "تحذيرات الهامش", desc: "أدوية تحت الحد الأدنى" },
                                { href: "/dashboard/reports", icon: BarChart3, label: "التقارير", desc: "جميع التقارير" },
                            ].map((link) => {
                                const Icon = link.icon;
                                return (
                                    <Link key={link.href} href={link.href}
                                        className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:bg-accent hover:shadow-sm transition-all">
                                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                            <Icon className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-foreground text-sm">{link.label}</h3>
                                            <p className="text-xs text-muted-foreground">{link.desc}</p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════ EMPLOYEE DASHBOARD (PHARMACIST / CASHIER) ═══════════ */}
            {!isAdmin && (
                <>
                    {/* Quick Actions */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            ...(role === 'PHARMACIST' ? [
                                { href: "/dashboard/drugs", icon: Pill, label: "قاعدة الأدوية", desc: `${data.drugCount} دواء`, gradient: "from-primary to-primary/80" },
                                { href: "/dashboard/inventory/stocktakes", icon: ClipboardList, label: "جرد المخزون", desc: `${data.inventoryCount} صنف`, gradient: "from-info to-info/80" },
                                { href: "/dashboard/patients", icon: Stethoscope, label: "المرضى", desc: "إدارة بيانات المرضى", gradient: "from-success to-success/80" },
                                { href: "/dashboard/debts", icon: BookOpen, label: "دفتر الديون", desc: "الديون والسداد", gradient: "from-warning to-warning/80" },
                            ] : [
                                { href: "/dashboard/sales", icon: ShoppingCart, label: "المبيعات", desc: "نقطة البيع", gradient: "from-primary to-primary/80" },
                                { href: "/dashboard/debts", icon: BookOpen, label: "دفتر الديون", desc: "الديون والسداد", gradient: "from-success to-success/80" },
                                { href: "/dashboard/returns", icon: Undo2, label: "المرتجعات", desc: "إرجاع فواتير", gradient: "from-info to-info/80" },
                                { href: "/dashboard/patients", icon: Stethoscope, label: "المرضى", desc: "بحث عن مريض", gradient: "from-warning to-warning/80" },
                            ]),
                        ].map((action) => {
                            const Icon = action.icon;
                            return (
                                <Link key={action.href} href={action.href}
                                    className={`bg-gradient-to-br ${action.gradient} text-primary-foreground rounded-2xl p-5 shadow-lg hover:scale-[1.02] transition-transform`}>
                                    <Icon className="w-8 h-8 mb-3 opacity-80" />
                                    <h3 className="font-bold text-lg">{action.label}</h3>
                                    <p className="text-sm opacity-75 mt-1">{action.desc}</p>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Alerts Card */}
                    {data.alerts.total > 0 && (
                        <Link href="/dashboard/alerts"
                            className="block bg-card border border-warning/30 rounded-xl p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center">
                                    <Bell className="w-6 h-6 text-warning" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground">لديك {data.alerts.total} تنبيه</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {data.alerts.expired > 0 && <span className="text-destructive font-medium">{data.alerts.expired} منتهي الصلاحية</span>}
                                        {data.alerts.expired > 0 && data.alerts.lowStock > 0 && ' · '}
                                        {data.alerts.lowStock > 0 && <span className="text-warning font-medium">{data.alerts.lowStock} نقص مخزون</span>}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    )}

                    {/* Info Cards */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Pill className="w-4 h-4 text-primary" />
                                <span className="font-bold text-foreground">الأدوية المسجلة</span>
                            </div>
                            <div className="text-3xl font-bold text-foreground">{data.drugCount}</div>
                            <p className="text-xs text-muted-foreground mt-1">دواء في قاعدة البيانات</p>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Package className="w-4 h-4 text-info" />
                                <span className="font-bold text-foreground">أصناف المخزون</span>
                            </div>
                            <div className="text-3xl font-bold text-foreground">{data.inventoryCount}</div>
                            <p className="text-xs text-muted-foreground mt-1">صنف متوفر في المخزن</p>
                        </div>
                    </div>
                </>
            )}
        </main>
    );
}
