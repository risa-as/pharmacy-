export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { User, DollarSign, Calendar, TrendingUp, ShoppingBag, Calculator, ArrowRight, Building2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

// Keep this component clean, chart will be client-side if needed, 
// or simpler: just use server generated data for chart
// For Recharts we need client component. 
// Let's create a Client Component for the Chart.
import EmployeeSalesChart from "./chart";
import RecentSalesTable from "@/app/ui/dashboard/reports/recent-sales-table";


export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const employee = await prisma.user.findFirst({
        where: { id: params.id, ...tenantBranchWhere },
        include: {
            branch: true,
            _count: {
                select: { sales: true }
            }
        }
    });

    if (!employee) return notFound();

    // Fetch Last 30 Days Sales
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sales = await prisma.sale.findMany({
        where: {
            ...tenantBranchWhere,
            userId: params.id,
            createdAt: { gte: thirtyDaysAgo }
        },
        orderBy: { createdAt: 'desc' },
        include: {
            items: {
                include: {
                    drug: true
                }
            },
            user: true
        }
    });

    // Stats
    const totalSales = sales.reduce((acc: any, sale: any) => acc + sale.total, 0);
    const saleCount = sales.length;
    const averageSale = saleCount > 0 ? totalSales / saleCount : 0;

    // Prepare Chart Data
    // Group by Date
    const dailyData = sales.reduce((acc: any, sale: any) => {
        const date = format(sale.createdAt, 'yyyy-MM-dd');
        acc[date] = (acc[date] || 0) + sale.total;
        return acc;
    }, {});

    const chartData = Object.keys(dailyData).map((date: any) => ({
        date,
        total: dailyData[date]
    })).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Recent Activity (Top 20)
    const recentActivity = sales.slice(0, 20);

    const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

    const statCards = [
        { label: "إجمالي المبيعات (د.ع)", value: fmt(totalSales), icon: DollarSign, tone: "text-success", bg: "bg-success/10" },
        { label: "عدد المعاملات", value: String(saleCount), icon: ShoppingBag, tone: "text-primary", bg: "bg-primary/10" },
        { label: "متوسط قيمة السلة (د.ع)", value: fmt(averageSale), icon: Calculator, tone: "text-info", bg: "bg-info/10" },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard/reports/employees" className="p-2 rounded-lg border border-border hover:bg-muted transition-colors shrink-0">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div className="glass-card flex items-center gap-4 p-4 flex-1">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/70 rounded-full flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-sm shrink-0">
                        {employee.name?.charAt(0) || 'U'}
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-foreground truncate">{employee.name}</h1>
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {employee.role}
                            </span>
                            <span className="flex items-center gap-1">
                                <Building2 className="w-4 h-4" />
                                {employee.branch?.name || 'غير محدد'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* بطاقات الإحصائيات (آخر 30 يوم) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

            {/* المخطط */}
            <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-foreground flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        أداء المبيعات اليومي
                    </h3>
                    <span className="text-xs text-muted-foreground">آخر 30 يوماً</span>
                </div>
                <div className="h-[300px] w-full">
                    <EmployeeSalesChart data={chartData} />
                </div>
            </div>

            {/* آخر العمليات */}
            <div className="glass-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-bold text-foreground">آخر العمليات</h3>
                    <span className="mr-auto text-xs text-muted-foreground">أحدث {recentActivity.length}</span>
                </div>
                {recentActivity.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <ShoppingBag className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-foreground font-medium">لا توجد عمليات خلال آخر 30 يوماً</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <RecentSalesTable sales={recentActivity} />
                    </div>
                )}
            </div>
        </div>
    );
}

