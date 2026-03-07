import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { User, Award, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function EmployeesReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
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

    const rankEmojis = ["🥇", "🥈", "🥉"];

    return (
        <div className="glass-card space-y-6 w-full p-6" dir="rtl">
            <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                <User className="w-8 h-8 text-primary" />
                👥 تقرير أداء الموظفين
            </h1>

            {/* Branch Filter */}
            <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/employees" />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <User className="w-4 h-4" />
                        عدد الموظفين
                    </div>
                    <div className="text-3xl font-bold text-foreground">{stats.length}</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="w-4 h-4" />
                        إجمالي الإيرادات
                    </div>
                    <div className="text-2xl font-bold text-primary">{totalRevenueAll.toLocaleString()} د.ع</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <BarChart3 className="w-4 h-4" />
                        إجمالي العمليات
                    </div>
                    <div className="text-3xl font-bold text-info">
                        {stats.reduce((s: any, st: any) => s + st.salesCount, 0)}
                    </div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingUp className="w-4 h-4" />
                        متوسط الفاتورة (الفريق)
                    </div>
                    <div className="text-2xl font-bold text-success">{teamAvgSale.toLocaleString(undefined, { maximumFractionDigits: 0 })} د.ع</div>
                </div>
            </div>

            {/* Employee Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stats.map((stat: any, index: any) => {
                    const aboveAvg = stat.averageSale > teamAvgSale;
                    return (
                        <Link
                            href={`/dashboard/reports/employees/${stat.id}`}
                            key={stat.id}
                            className="block transition-transform hover:scale-[1.02]"
                        >
                            <div className="bg-card p-6 rounded-xl shadow-sm border relative overflow-hidden h-full">
                                {/* Rank Badge */}
                                {index < 3 && (
                                    <div className="absolute top-0 left-0 bg-warning text-warning-foreground px-3 py-1 rounded-br-xl font-bold flex items-center gap-1 shadow-sm">
                                        <span className="text-lg">{rankEmojis[index]}</span>
                                        {index === 0 && "الأفضل"}
                                        {index === 1 && "الثاني"}
                                        {index === 2 && "الثالث"}
                                    </div>
                                )}

                                <div className="flex items-center gap-4 mb-4 mt-1">
                                    <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center shadow-md">
                                        <span className="text-xl font-bold text-primary-foreground">{stat.name.charAt(0)}</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{stat.name}</h3>
                                        <div className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded inline-block">
                                            {stat.role}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {/* Revenue */}
                                    <div className="flex justify-between items-center p-2 bg-primary/10 rounded-lg">
                                        <span className="text-muted-foreground text-sm">إجمالي المبيعات</span>
                                        <span className="font-bold text-primary">{stat.totalSales.toLocaleString()} د.ع</span>
                                    </div>

                                    {/* Revenue Share */}
                                    <div className="flex justify-between items-center p-2 bg-info/10 rounded-lg">
                                        <span className="text-muted-foreground text-sm">نسبة المساهمة</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 bg-muted rounded-full h-2">
                                                <div
                                                    className="bg-info h-2 rounded-full"
                                                    style={{ width: `${Math.min(stat.revenueShare, 100)}%` }}
                                                />
                                            </div>
                                            <span className="font-bold text-info text-sm">{stat.revenueShare.toFixed(1)}%</span>
                                        </div>
                                    </div>

                                    {/* Sales Count */}
                                    <div className="flex justify-between items-center p-2 bg-muted rounded-lg">
                                        <span className="text-muted-foreground text-sm">عدد العمليات</span>
                                        <span className="font-bold">{stat.salesCount}</span>
                                    </div>

                                    {/* Average Sale */}
                                    <div className="flex justify-between items-center p-2 bg-muted rounded-lg">
                                        <span className="text-muted-foreground text-sm">متوسط الفاتورة</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">{stat.averageSale.toLocaleString(undefined, { maximumFractionDigits: 0 })} د.ع</span>
                                            {aboveAvg ? (
                                                <span className="text-xs text-success font-bold">↑ فوق المتوسط</span>
                                            ) : stat.salesCount > 0 ? (
                                                <span className="text-xs text-destructive font-bold">↓ تحت المتوسط</span>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-border flex justify-end">
                                        <span className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2">
                                            عرض التفاصيل <TrendingUp className="w-4 h-4" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    );
                })}

                {stats.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground">
                        لا يوجد موظفين مسجلين في النظام
                    </div>
                )}
            </div>
        </div>
    );
}
