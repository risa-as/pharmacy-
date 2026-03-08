export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { TrendingUp, Calendar, Download, ArrowRight, DollarSign } from "lucide-react";
import Link from "next/link";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";

export default async function SalesReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null; // Handle generically for server component
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;
    const branchWhere = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };

    // Get sales for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sales = await prisma.sale.findMany({
        where: {
            createdAt: { gte: sevenDaysAgo },
            ...branchWhere,
        },
        include: {
            items: true,
            branch: true,
        },
        orderBy: { createdAt: "asc" },
    });

    // Group sales by day
    const salesByDay = new Map<string, number>();
    const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = dayNames[date.getDay()];
        salesByDay.set(dayName, 0);
    }

    sales.forEach((sale: any) => {
        const dayName = dayNames[new Date(sale.createdAt).getDay()];
        const current = salesByDay.get(dayName) || 0;
        salesByDay.set(dayName, current + sale.total);
    });

    const chartData = Array.from(salesByDay.entries()).map(([day, amount]: any) => ({
        day,
        amount,
    }));

    // Calculate stats
    const totalSales = sales.reduce((acc: any, s: any) => acc + s.total, 0);
    const averageSale = sales.length > 0 ? totalSales / sales.length : 0;
    const topBranches = new Map<string, number>();
    sales.forEach((sale: any) => {
        const branchName = sale.branch.name;
        const current = topBranches.get(branchName) || 0;
        topBranches.set(branchName, current + sale.total);
    });

    return (
        <div className="glass-card w-full p-6" dir="rtl" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/reports" className="p-2 bg-muted hover:bg-muted rounded-lg transition-colors">
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </Link>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                        <TrendingUp className="w-7 h-7 text-primary" />
                        تقرير المبيعات
                    </h1>
                </div>
                <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90">
                    <Download className="h-4 w-4" />
                    تصدير PDF
                </button>
            </div>

            {/* Branch Filter */}
            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/sales" />
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{sales.length}</div>
                    <div className="text-sm text-muted-foreground">عدد المبيعات</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">{totalSales.toFixed(2)}</div>
                    <div className="text-sm text-success">إجمالي المبيعات</div>
                </div>
                <div className="bg-primary/10 rounded-xl border border-primary p-4">
                    <div className="text-3xl font-bold text-primary">{averageSale.toFixed(2)}</div>
                    <div className="text-sm text-primary">متوسط الفاتورة</div>
                </div>
                <div className="bg-info/10 rounded-xl border border-info/20 p-4">
                    <div className="text-3xl font-bold text-info">{topBranches.size}</div>
                    <div className="text-sm text-info">الفروع النشطة</div>
                </div>
            </div>

            {/* مخطط المبيعات */}
            <div className="grid gap-6 lg:grid-cols-2 mb-8">
                <SalesChart data={chartData} title="المبيعات - آخر 7 أيام" />

                {/* أفضل الفروع */}
                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                    <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-success" />
                        المبيعات حسب الفرع
                    </h3>
                    <div className="space-y-3">
                        {Array.from(topBranches.entries())
                            .sort((a: any, b: any) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([branch, amount]: any, index: any) => (
                                <div key={branch} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${index === 0 ? "bg-warning/20 text-warning" :
                                            index === 1 ? "bg-muted text-foreground" :
                                                "bg-primary/10 text-primary"
                                            }`}>
                                            {index + 1}
                                        </span>
                                        <span className="font-medium text-foreground">{branch}</span>
                                    </div>
                                    <span className="font-bold text-success">{amount.toFixed(2)}</span>
                                </div>
                            ))}
                        {topBranches.size === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                لا توجد مبيعات
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* جدول المبيعات الأخيرة */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h3 className="font-bold text-foreground">آخر المبيعات</h3>
                </div>
                {sales.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        لا توجد مبيعات
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">عدد الأصناف</th>
                                <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                                <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sales.slice(-10).reverse().map((sale: any) => (
                                <tr key={sale.id} className="hover:bg-muted">
                                    <td className="px-4 py-3 text-muted-foreground">{sale.branch.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{sale.items.length}</td>
                                    <td className="px-4 py-3 font-bold text-success">{sale.total.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
                                        {new Date(sale.createdAt).toLocaleDateString("ar-IQ")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
