export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { TrendingUp, Calendar, ArrowRight, DollarSign } from "lucide-react";
import Link from "next/link";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DateRangeFilter from "@/app/ui/reports/date-range-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";
import { ExportPDFButton, ExportExcelButton } from "@/app/ui/reports/export-buttons";

function parseDateParam(val: string | string[] | undefined) {
    return typeof val === "string" ? val : undefined;
}

function buildDateRange(from?: string, to?: string) {
    const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
    const nowIraq = new Date(Date.now() + IRAQ_OFFSET);
    let start: Date, end: Date;
    if (from && to) {
        const [fy, fm, fd] = from.split('-').map(Number);
        const [ty, tm, td] = to.split('-').map(Number);
        start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
        end   = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
    } else {
        const todayUtcIraq = Date.UTC(nowIraq.getUTCFullYear(), nowIraq.getUTCMonth(), nowIraq.getUTCDate());
        end   = new Date(todayUtcIraq + 24 * 60 * 60 * 1000 - 1 - IRAQ_OFFSET);
        start = new Date(todayUtcIraq - 6 * 24 * 60 * 60 * 1000 - IRAQ_OFFSET);
    }
    return { start, end };
}

function filterByTimeOfDay<T extends { createdAt: Date | string }>(items: T[], fromTime?: string, toTime?: string): T[] {
    if (!fromTime && !toTime) return items;
    const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const fromMin = fromTime ? toMinutes(fromTime) : 0;
    const toMin = toTime ? toMinutes(toTime) : 23 * 60 + 59;
    const crossesMidnight = fromMin > toMin;
    return items.filter(item => {
        const d = new Date(item.createdAt);
        const min = d.getHours() * 60 + d.getMinutes();
        // e.g. 21:00 → 09:00: match if min >= 1260 OR min <= 540
        return crossesMidnight ? (min >= fromMin || min <= toMin) : (min >= fromMin && min <= toMin);
    });
}

function getDaysBetween(start: Date, end: Date) {
    const days: string[] = [];
    const cur = new Date(start); cur.setHours(0, 0, 0, 0);
    const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
    while (cur <= endDay) { days.push(cur.toLocaleDateString("en-GB")); cur.setDate(cur.getDate() + 1); }
    return days;
}

export default async function SalesReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const branchId = parseDateParam(searchParams.branch);
    const fromParam = parseDateParam(searchParams.from);
    const toParam = parseDateParam(searchParams.to);
    const fromTimeParam = parseDateParam(searchParams.fromTime);
    const toTimeParam = parseDateParam(searchParams.toTime);

    const branchWhere = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };
    const { start, end } = buildDateRange(fromParam, toParam);

    const salesRaw = await prisma.sale.findMany({
        where: {
            createdAt: { gte: start, lte: end },
            ...branchWhere,
        },
        include: {
            items: true,
            branch: true,
        },
        orderBy: { createdAt: "asc" },
    });

    // Filter by time-of-day if specified (post-process — DB stores full days)
    const sales = filterByTimeOfDay(salesRaw, fromTimeParam, toTimeParam);

    // Chart — group by day
    const days = getDaysBetween(start, end);
    const salesByDay = new Map<string, number>(days.map(d => [d, 0]));
    sales.forEach((sale: any) => {
        const key = new Date(sale.createdAt).toLocaleDateString("en-GB");
        if (salesByDay.has(key)) salesByDay.set(key, (salesByDay.get(key) || 0) + sale.total);
    });
    const chartData = Array.from(salesByDay.entries()).map(([day, amount]) => ({ day, amount }));

    // Stats
    const totalSales = sales.reduce((acc: number, s: any) => acc + s.total, 0);
    const averageSale = sales.length > 0 ? totalSales / sales.length : 0;
    const topBranches = new Map<string, number>();
    sales.forEach((sale: any) => {
        const name = sale.branch?.name || "غير محدد";
        topBranches.set(name, (topBranches.get(name) || 0) + sale.total);
    });

    const extraParams: Record<string, string | undefined> = branchId ? { branch: branchId } : {};

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
                <div className="flex gap-2">
                    <ExportExcelButton
                        filename="sales-report"
                        headers={["الفرع", "عدد الأصناف", "المبلغ", "التاريخ"]}
                        data={sales.map((s: any) => [
                            s.branch?.name || "غير محدد",
                            s.items.length,
                            s.total.toFixed(2),
                            new Date(s.createdAt).toLocaleString("ar-IQ"),
                        ])}
                    />
                    <ExportPDFButton />
                </div>
            </div>

            {/* Filters */}
            <div className="space-y-3 mb-6">
                <DateRangeFilter
                    baseUrl="/dashboard/reports/sales"
                    currentFrom={fromParam}
                    currentTo={toParam}
                    currentFromTime={fromTimeParam}
                    currentToTime={toTimeParam}
                    extraParams={extraParams}
                    showTimeFilter
                />
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/sales" />
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{sales.length}</div>
                    <div className="text-sm text-muted-foreground">عدد المبيعات</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">{totalSales.toLocaleString()} د.ع</div>
                    <div className="text-sm text-success">إجمالي المبيعات</div>
                </div>
                <div className="bg-primary/10 rounded-xl border border-primary p-4">
                    <div className="text-3xl font-bold text-primary">{averageSale.toLocaleString(undefined, { maximumFractionDigits: 0 })} د.ع</div>
                    <div className="text-sm text-primary">متوسط الفاتورة</div>
                </div>
                <div className="bg-info/10 rounded-xl border border-info/20 p-4">
                    <div className="text-3xl font-bold text-info">{topBranches.size}</div>
                    <div className="text-sm text-info">الفروع النشطة</div>
                </div>
            </div>

            {/* مخطط المبيعات */}
            <div className="grid gap-6 lg:grid-cols-2 mb-8">
                <SalesChart data={chartData} title="المبيعات اليومية" />

                {/* أفضل الفروع */}
                <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                    <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-success" />
                        المبيعات حسب الفرع
                    </h3>
                    <div className="space-y-3">
                        {Array.from(topBranches.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([branch, amount], index) => (
                                <div key={branch} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${index === 0 ? "bg-warning/20 text-warning" : index === 1 ? "bg-muted text-foreground" : "bg-primary/10 text-primary"}`}>
                                            {index + 1}
                                        </span>
                                        <span className="font-medium text-foreground">{branch}</span>
                                    </div>
                                    <span className="font-bold text-success">{amount.toLocaleString()} د.ع</span>
                                </div>
                            ))}
                        {topBranches.size === 0 && (
                            <div className="text-center py-8 text-muted-foreground">لا توجد مبيعات</div>
                        )}
                    </div>
                </div>
            </div>

            {/* جدول المبيعات */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-bold text-foreground">آخر المبيعات</h3>
                </div>
                {sales.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">لا توجد مبيعات في هذه الفترة</div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">عدد الأصناف</th>
                                <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                                <th className="px-4 py-3 text-right font-bold">التاريخ والساعة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sales.slice().reverse().slice(0, 50).map((sale: any) => (
                                <tr key={sale.id} className="hover:bg-muted">
                                    <td className="px-4 py-3 text-muted-foreground">{sale.branch?.name || "غير محدد"}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{sale.items.length}</td>
                                    <td className="px-4 py-3 font-bold text-success">{sale.total.toLocaleString()} د.ع</td>
                                    <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
                                        <div>{new Date(sale.createdAt).toLocaleDateString("ar-IQ")}</div>
                                        <div className="text-xs opacity-70">{new Date(sale.createdAt).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}</div>
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
