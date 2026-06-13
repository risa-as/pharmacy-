export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { User, TrendingUp, DollarSign, BarChart3, Users, Calculator, ArrowRight, Crown, ChevronLeft } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

export default async function EmployeesReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    // 1. Fetch Users with their Sales (filtered by branch)
    const userWhereClause = { ...tenantBranchWhere, ...(branchId ? { branchId } : {}) };
    const salesWhereClause = { ...tenantBranchWhere, ...(branchId ? { branchId } : {}) };

    const users = await prisma.user.findMany({
        where: userWhereClause,
        include: {
            sales: { where: salesWhereClause },
        },
    });

    // 2. Calculate total revenue across all employees
    const totalRevenueAll = users.reduce(
        (sum: any, u: any) => sum + u.sales.reduce((s: any, sale: any) => s + sale.total, 0), 0
    );

    // 3. Calculate Stats per user
    const stats = users
        .map((user: any) => {
            const totalSales = user.sales.reduce((sum: any, s: any) => sum + s.total, 0);
            const salesCount = user.sales.length;
            const averageSale = salesCount > 0 ? totalSales / salesCount : 0;
            const revenueShare = totalRevenueAll > 0 ? (totalSales / totalRevenueAll) * 100 : 0;

            return {
                id: user.id,
                name: user.name || "غير معروف",
                role: user.role,
                totalSales,
                salesCount,
                averageSale,
                revenueShare,
            };
        })
        .sort((a: any, b: any) => b.totalSales - a.totalSales);

    // 4. Team averages
    const teamAvgSale = stats.length > 0
        ? stats.reduce((s: any, st: any) => s + st.averageSale, 0) / stats.length
        : 0;

    const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
    const totalOps = stats.reduce((s: any, st: any) => s + st.salesCount, 0);

    const statCards = [
        { label: "عدد الموظفين", value: String(stats.length), icon: Users, tone: "text-primary", bg: "bg-primary/10" },
        { label: "إجمالي الإيرادات (د.ع)", value: fmt(totalRevenueAll), icon: DollarSign, tone: "text-success", bg: "bg-success/10" },
        { label: "إجمالي العمليات", value: String(totalOps), icon: BarChart3, tone: "text-info", bg: "bg-info/10" },
        { label: "متوسط الفاتورة (الفريق)", value: fmt(teamAvgSale), icon: Calculator, tone: "text-warning", bg: "bg-warning/10" },
    ];

    const rankBadge = (index: number) =>
        index === 0 ? { label: "الأفضل", cls: "bg-warning/15 text-warning" }
            : index === 1 ? { label: "الثاني", cls: "bg-muted-foreground/15 text-muted-foreground" }
                : { label: "الثالث", cls: "bg-info/15 text-info" };

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard/reports" className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <User className="w-6 h-6 text-primary" />
                        أداء الموظفين
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">ترتيب الموظفين حسب المبيعات ونسبة المساهمة</p>
                </div>
            </div>

            {/* فلتر الفرع */}
            <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/employees" />

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${card.tone}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">{card.label}</p>
                                <p className={`text-2xl font-bold ${card.tone}`} dir="ltr">{card.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* بطاقات الموظفين */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.map((stat: any, index: any) => {
                    const aboveAvg = stat.averageSale > teamAvgSale;
                    return (
                        <Link
                            href={`/dashboard/reports/employees/${stat.id}`}
                            key={stat.id}
                            className="glass-card p-5 relative overflow-hidden group hover:border-primary/40 hover:shadow-md transition-all flex flex-col"
                        >
                            {/* شارة الترتيب */}
                            {index < 3 && (
                                <div className={`absolute top-0 left-0 px-3 py-1 rounded-br-xl text-xs font-bold flex items-center gap-1 ${rankBadge(index).cls}`}>
                                    {index === 0 && <Crown className="w-3.5 h-3.5" />}
                                    {rankBadge(index).label}
                                </div>
                            )}

                            <div className="flex items-center gap-3 mb-4 mt-1">
                                <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center shadow-sm shrink-0">
                                    <span className="text-lg font-bold text-primary-foreground">{stat.name.charAt(0)}</span>
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-foreground truncate">{stat.name}</h3>
                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded inline-block mt-0.5">
                                        {stat.role}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2 flex-1">
                                <div className="flex justify-between items-center p-2.5 bg-primary/5 rounded-lg">
                                    <span className="text-muted-foreground text-sm">إجمالي المبيعات</span>
                                    <span className="font-bold text-primary whitespace-nowrap" dir="ltr">{fmt(stat.totalSales)} د.ع</span>
                                </div>

                                <div className="flex justify-between items-center p-2.5 bg-info/5 rounded-lg">
                                    <span className="text-muted-foreground text-sm">نسبة المساهمة</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 bg-muted rounded-full h-2 overflow-hidden">
                                            <div className="bg-info h-2 rounded-full" style={{ width: `${Math.min(stat.revenueShare, 100)}%` }} />
                                        </div>
                                        <span className="font-bold text-info text-sm tabular-nums" dir="ltr">{stat.revenueShare.toFixed(1)}%</span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center p-2.5 bg-muted/50 rounded-lg">
                                    <span className="text-muted-foreground text-sm">عدد العمليات</span>
                                    <span className="font-bold text-foreground">{stat.salesCount}</span>
                                </div>

                                <div className="flex justify-between items-center p-2.5 bg-muted/50 rounded-lg">
                                    <span className="text-muted-foreground text-sm">متوسط الفاتورة</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-foreground whitespace-nowrap" dir="ltr">{fmt(stat.averageSale)} د.ع</span>
                                        {aboveAvg ? (
                                            <span className="text-xs text-success font-bold">↑</span>
                                        ) : stat.salesCount > 0 ? (
                                            <span className="text-xs text-destructive font-bold">↓</span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{stat.role}</span>
                                <span className="inline-flex items-center gap-1 text-sm font-bold text-primary group-hover:gap-2 transition-all">
                                    عرض التفاصيل <ChevronLeft className="w-4 h-4" />
                                </span>
                            </div>
                        </Link>
                    );
                })}

                {stats.length === 0 && (
                    <div className="col-span-full glass-card py-16 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Users className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-foreground font-medium">لا يوجد موظفين مسجلين</p>
                    </div>
                )}
            </div>
        </div>
    );
}
