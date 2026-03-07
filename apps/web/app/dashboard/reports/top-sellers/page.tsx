import { prisma } from "@/app/lib/prisma";
import { TrendingUp, Award, Package, DollarSign } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function TopSellersPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const period = typeof searchParams.period === "string" ? parseInt(searchParams.period) : 30;
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - period);

    const saleWhere = branchId
        ? { sale: { createdAt: { gte: sinceDate }, branchId, ...tenantWhere } }
        : { sale: { createdAt: { gte: sinceDate }, ...tenantBranchWhere } };

    // 1. Group SaleItems by drugId, ordered by quantity
    const grouped = await prisma.saleItem.groupBy({
        by: ["drugId"],
        where: saleWhere,
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 30,
    });

    // 2. Get total quantities sold to calculate share %
    const totalQuantitySold = grouped.reduce((s: any, g: any) => s + (g._sum.quantity || 0), 0);

    // 3. Populate drug names and revenue
    const items = await Promise.all(
        grouped.map(async (g: any, idx: any) => {
            const drug = await prisma.globalDrug.findUnique({
                where: { id: g.drugId },
                select: { tradeName: true, barcode: true },
            });

            const saleItems = await prisma.saleItem.findMany({
                where: {
                    drugId: g.drugId,
                    ...saleWhere,
                },
                select: { quantity: true, price: true },
            });

            const totalRevenue = saleItems.reduce(
                (acc, si) => acc + si.quantity * si.price,
                0
            );

            const qty = g._sum.quantity || 0;
            const share = totalQuantitySold > 0 ? (qty / totalQuantitySold) * 100 : 0;

            return {
                rank: idx + 1,
                name: drug?.tradeName || "غير معروف",
                barcode: drug?.barcode || "",
                quantity: qty,
                revenue: totalRevenue,
                share,
            };
        })
    );

    const totalRevenue = items.reduce((s: any, i: any) => s + i.revenue, 0);
    const periods = [
        { label: "7 أيام", value: 7 },
        { label: "30 يوم", value: 30 },
        { label: "90 يوم", value: 90 },
        { label: "سنة", value: 365 },
    ];

    const buildPeriodUrl = (p: number) => {
        const params = new URLSearchParams();
        params.set("period", String(p));
        if (branchId) params.set("branch", branchId);
        return `/dashboard/reports/top-sellers?${params.toString()}`;
    };

    const extraParams = `period=${period}`;

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                    <TrendingUp className="w-8 h-8 text-success" />
                    📊 أكثر الأدوية مبيعاً
                </h1>
                <div className="flex gap-2">
                    {periods.map((p: any) => (
                        <a
                            key={p.value}
                            href={buildPeriodUrl(p.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${period === p.value
                                ? "bg-success text-success-foreground shadow-md"
                                : "bg-card border border-border text-muted-foreground hover:border-green-400"
                                }`}
                        >
                            {p.label}
                        </a>
                    ))}
                </div>
            </div>

            {/* Branch Filter */}
            <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/top-sellers" extraParams={extraParams} />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Package className="w-4 h-4" />
                        إجمالي الأصناف المباعة
                    </div>
                    <div className="text-2xl font-bold text-foreground">{items.length} صنف</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Award className="w-4 h-4" />
                        إجمالي العبوات المباعة
                    </div>
                    <div className="text-2xl font-bold text-primary">
                        {totalQuantitySold.toLocaleString()} عبوة
                    </div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="w-4 h-4" />
                        إجمالي الإيرادات
                    </div>
                    <div className="text-2xl font-bold text-success">
                        {totalRevenue.toLocaleString()} د.ع
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {items.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد مبيعات في هذه الفترة.</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold w-16">#</th>
                                <th className="px-4 py-3 text-right font-bold">اسم الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">الباركود</th>
                                <th className="px-4 py-3 text-right font-bold">الكمية المباعة</th>
                                <th className="px-4 py-3 text-right font-bold">الإيرادات</th>
                                <th className="px-4 py-3 text-right font-bold">الحصة السوقية</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((item: any) => (
                                <tr key={item.rank} className="hover:bg-muted transition-colors">
                                    <td className="px-4 py-3 text-center">
                                        {item.rank === 1 && <span className="text-2xl">🥇</span>}
                                        {item.rank === 2 && <span className="text-2xl">🥈</span>}
                                        {item.rank === 3 && <span className="text-2xl">🥉</span>}
                                        {item.rank > 3 && (
                                            <span className="font-bold text-muted-foreground">{item.rank}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-foreground">{item.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground font-mono text-sm">{item.barcode}</td>
                                    <td className="px-4 py-3 font-bold text-primary">
                                        {item.quantity.toLocaleString()} عبوة
                                    </td>
                                    <td className="px-4 py-3 font-bold text-success">
                                        {item.revenue.toLocaleString()} د.ع
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-muted rounded-full h-2 max-w-[100px]">
                                                <div
                                                    className="bg-success h-2 rounded-full"
                                                    style={{ width: `${Math.min(item.share, 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-sm font-bold text-muted-foreground">
                                                {item.share.toFixed(1)}%
                                            </span>
                                        </div>
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
