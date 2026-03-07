import { prisma } from "@/app/lib/prisma";
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Package } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function MarginsReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const sortBy = typeof searchParams.sort === "string" ? searchParams.sort : "margin_asc";
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const inventory = await prisma.inventory.findMany({
        where: branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere },
        include: {
            drug: { select: { tradeName: true, barcode: true } },
            branch: { select: { name: true } },
            batches: { select: { quantity: true } },
        },
    });

    const items = inventory
        .map((inv: any) => {
            const stock = inv.batches.reduce((s: any, b: any) => s + b.quantity, 0);
            const marginPercent = inv.price > 0 ? ((inv.price - inv.cost) / inv.price) * 100 : 0;
            const profitPerUnit = inv.price - inv.cost;

            return {
                id: inv.id,
                name: inv.drug.tradeName,
                barcode: inv.drug.barcode,
                branch: inv.branch.name,
                price: inv.price,
                cost: inv.cost,
                marginPercent,
                profitPerUnit,
                stock,
                totalPotentialProfit: profitPerUnit * stock,
            };
        })
        .filter((i: any) => i.stock > 0);

    // Sort
    if (sortBy === "margin_asc") items.sort((a: any, b: any) => a.marginPercent - b.marginPercent);
    else if (sortBy === "margin_desc") items.sort((a: any, b: any) => b.marginPercent - a.marginPercent);
    else if (sortBy === "profit_desc") items.sort((a: any, b: any) => b.totalPotentialProfit - a.totalPotentialProfit);
    else if (sortBy === "stock_desc") items.sort((a: any, b: any) => b.stock - a.stock);

    // Stats
    const avgMargin = items.length > 0 ? items.reduce((s: any, i: any) => s + i.marginPercent, 0) / items.length : 0;
    const lowMarginCount = items.filter((i: any) => i.marginPercent < 10).length;
    const highMarginCount = items.filter((i: any) => i.marginPercent > 30).length;
    const bestItem = items.length > 0 ? [...items].sort((a: any, b: any) => b.marginPercent - a.marginPercent)[0] : null;
    const worstItem = items.length > 0 ? [...items].sort((a: any, b: any) => a.marginPercent - b.marginPercent)[0] : null;

    const sortOptions = [
        { label: "أقل هامش أولاً", value: "margin_asc" },
        { label: "أعلى هامش أولاً", value: "margin_desc" },
        { label: "أعلى ربح محتمل", value: "profit_desc" },
        { label: "أكبر مخزون", value: "stock_desc" },
    ];

    const buildSortUrl = (sort: string) => {
        const params = new URLSearchParams();
        params.set("sort", sort);
        if (branchId) params.set("branch", branchId);
        return `/dashboard/reports/margins?${params.toString()}`;
    };

    const extraParams = `sort=${sortBy}`;

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                    <DollarSign className="w-8 h-8 text-success" />
                    💰 تقرير هامش الربح لكل دواء
                </h1>
                <div className="flex gap-2 flex-wrap">
                    {sortOptions.map((opt: any) => (
                        <a
                            key={opt.value}
                            href={buildSortUrl(opt.value)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${sortBy === opt.value
                                ? "bg-success text-success-foreground shadow-md"
                                : "bg-card border border-border text-muted-foreground hover:border-success/50"
                                }`}
                        >
                            {opt.label}
                        </a>
                    ))}
                </div>
            </div>

            {/* Branch Filter */}
            <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/margins" extraParams={extraParams} />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="text-sm text-muted-foreground mb-1">متوسط هامش الربح</div>
                    <div className={`text-3xl font-bold ${avgMargin >= 20 ? "text-success" : avgMargin >= 10 ? "text-warning" : "text-destructive"}`}>
                        {avgMargin.toFixed(1)}%
                    </div>
                </div>
                <div className="bg-destructive/10 p-5 rounded-xl border border-red-200">
                    <div className="flex items-center gap-1 text-sm text-destructive mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        هامش منخفض (&lt;10%)
                    </div>
                    <div className="text-3xl font-bold text-destructive">{lowMarginCount}</div>
                </div>
                <div className="bg-success/10 p-5 rounded-xl border border-green-200">
                    <div className="flex items-center gap-1 text-sm text-success mb-1">
                        <TrendingUp className="w-4 h-4" />
                        هامش مرتفع (&gt;30%)
                    </div>
                    <div className="text-3xl font-bold text-success">{highMarginCount}</div>
                </div>
                <div className="bg-card p-5 rounded-xl border shadow-sm">
                    <div className="text-sm text-muted-foreground mb-1">إجمالي الأصناف</div>
                    <div className="text-3xl font-bold text-foreground">{items.length}</div>
                </div>
            </div>

            {/* Best / Worst mini cards */}
            {bestItem && worstItem && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-success/10 p-4 rounded-xl border border-green-200 flex items-center gap-4">
                        <TrendingUp className="w-10 h-10 text-success" />
                        <div>
                            <div className="text-sm text-success font-bold">أفضل هامش ربح</div>
                            <div className="text-lg font-bold text-success">{bestItem.name}</div>
                            <div className="text-sm text-success">{bestItem.marginPercent.toFixed(1)}% — ربح {bestItem.profitPerUnit.toLocaleString()} د.ع/عبوة</div>
                        </div>
                    </div>
                    <div className="bg-destructive/10 p-4 rounded-xl border border-red-200 flex items-center gap-4">
                        <TrendingDown className="w-10 h-10 text-destructive" />
                        <div>
                            <div className="text-sm text-destructive font-bold">أقل هامش ربح</div>
                            <div className="text-lg font-bold text-destructive">{worstItem.name}</div>
                            <div className="text-sm text-destructive">{worstItem.marginPercent.toFixed(1)}% — ربح {worstItem.profitPerUnit.toLocaleString()} د.ع/عبوة</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {items.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد أصناف في المخزون.</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">اسم الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">سعر البيع</th>
                                <th className="px-4 py-3 text-right font-bold">سعر التكلفة</th>
                                <th className="px-4 py-3 text-right font-bold">الربح/عبوة</th>
                                <th className="px-4 py-3 text-right font-bold">هامش الربح</th>
                                <th className="px-4 py-3 text-right font-bold">المخزون</th>
                                <th className="px-4 py-3 text-right font-bold">الربح المحتمل</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((item: any) => (
                                <tr key={item.id} className="hover:bg-muted transition-colors">
                                    <td className="px-4 py-3 font-bold text-foreground">{item.name}</td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{item.branch}</td>
                                    <td className="px-4 py-3">{item.price.toLocaleString()} د.ع</td>
                                    <td className="px-4 py-3">{item.cost.toLocaleString()} د.ع</td>
                                    <td className="px-4 py-3 font-bold text-success">
                                        {item.profitPerUnit.toLocaleString()} د.ع
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`px-2 py-1 rounded-md text-xs font-bold ${item.marginPercent < 10
                                                ? "bg-destructive/10 text-destructive"
                                                : item.marginPercent < 20
                                                    ? "bg-warning/20 text-warning"
                                                    : "bg-success/10 text-success"
                                                }`}
                                        >
                                            {item.marginPercent.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono">{item.stock}</td>
                                    <td className="px-4 py-3 font-bold text-success">
                                        {item.totalPotentialProfit.toLocaleString()} د.ع
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
