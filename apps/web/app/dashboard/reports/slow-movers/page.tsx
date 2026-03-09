export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { AlertOctagon, DollarSign, Package, Clock, TrendingDown } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function SlowMoversPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const period = typeof searchParams.period === "string" ? parseInt(searchParams.period) : 90;
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - period);

    const saleWhere = branchId
        ? { sale: { createdAt: { gte: thresholdDate }, branchId, ...tenantWhere } }
        : { sale: { createdAt: { gte: thresholdDate }, ...tenantBranchWhere } };

    // 1. Find drug IDs that HAVE been sold during the period
    const soldDrugIds = await prisma.saleItem
        .findMany({
            where: saleWhere,
            select: { drugId: true },
            distinct: ["drugId"],
        })
        .then((items: any[]) => items.map((i: any) => i.drugId));

    // 2. Find drugs NOT sold, but WITH stock > 0
    const inventoryFilter = branchId
        ? { some: { branchId, ...tenantWhere, batches: { some: { quantity: { gt: 0 } } } } }
        : { some: { ...tenantBranchWhere, batches: { some: { quantity: { gt: 0 } } } } };

    const stagnantDrugs = await prisma.globalDrug.findMany({
        where: {
            id: { notIn: soldDrugIds },
            inventories: inventoryFilter,
        },
        include: {
            inventories: {
                where: branchId ? { branchId, ...tenantWhere } : { ...tenantBranchWhere },
                include: { batches: true, branch: { select: { name: true } } },
            },
            saleItems: {
                orderBy: { sale: { createdAt: "desc" } },
                take: 1,
                include: { sale: { select: { createdAt: true } } },
            },
        },
        take: 100,
    });

    const now = new Date();

    const items = stagnantDrugs
        .map((drug: any) => {
            const totalStock = drug.inventories.reduce(
                (acc: any, inv: any) => acc + inv.batches.reduce((bAcc: any, b: any) => bAcc + b.quantity, 0),
                0
            );

            const avgCost =
                drug.inventories.length > 0
                    ? drug.inventories.reduce((s: any, inv: any) => s + inv.cost, 0) / drug.inventories.length
                    : 0;

            const valueAtRisk = avgCost * totalStock;

            const lastSale = drug.saleItems[0]?.sale.createdAt || null;
            const referenceDate = lastSale || drug.createdAt;
            const daysSinceLastSale = Math.ceil(
                Math.abs(now.getTime() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24)
            );

            const branches = drug.inventories
                .filter((inv: any) => inv.batches.some((b: any) => b.quantity > 0))
                .map((inv: any) => inv.branch.name);

            return {
                id: drug.id,
                name: drug.tradeName,
                barcode: drug.barcode,
                stock: totalStock,
                valueAtRisk,
                lastSaleDate: lastSale,
                daysSinceLastSale,
                branches,
                neverSold: !lastSale,
            };
        })
        .filter((i: any) => i.stock > 0)
        .sort((a: any, b: any) => b.valueAtRisk - a.valueAtRisk);

    const totalValueAtRisk = items.reduce((s: any, i: any) => s + i.valueAtRisk, 0);
    const neverSoldCount = items.filter((i: any) => i.neverSold).length;

    const periods = [
        { label: "30 يوم", value: 30 },
        { label: "60 يوم", value: 60 },
        { label: "90 يوم", value: 90 },
        { label: "180 يوم", value: 180 },
    ];

    const buildPeriodUrl = (p: number) => {
        const params = new URLSearchParams();
        params.set("period", String(p));
        if (branchId) params.set("branch", branchId);
        return `/dashboard/reports/slow-movers?${params.toString()}`;
    };

    const extraParams = `period=${period}`;

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                    <AlertOctagon className="w-8 h-8 text-destructive" />
                    ⚠️ تقرير الأدوية الراكدة
                </h1>
                <div className="flex gap-2">
                    {periods.map((p: any) => (
                        <a
                            key={p.value}
                            href={buildPeriodUrl(p.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${period === p.value
                                ? "bg-destructive text-destructive-foreground shadow-md"
                                : "bg-card border border-border text-muted-foreground hover:border-red-400"
                                }`}
                        >
                            {p.label}
                        </a>
                    ))}
                </div>
            </div>

            {/* Branch Filter */}
            <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/slow-movers" extraParams={extraParams} />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-destructive/10 p-5 rounded-xl border border-red-200">
                    <div className="flex items-center gap-2 text-destructive text-sm mb-1">
                        <DollarSign className="w-4 h-4" />
                        قيمة المخزون المجمد
                    </div>
                    <div className="text-3xl font-bold text-destructive">
                        {totalValueAtRisk.toLocaleString()} د.ع
                    </div>
                </div>
                <div className="bg-warning/10 p-5 rounded-xl border border-orange-200">
                    <div className="flex items-center gap-2 text-warning text-sm mb-1">
                        <Package className="w-4 h-4" />
                        عدد الأصناف الراكدة
                    </div>
                    <div className="text-3xl font-bold text-warning">{items.length} صنف</div>
                </div>
                <div className="bg-warning/10 p-5 rounded-xl border border-warning/30">
                    <div className="flex items-center gap-2 text-warning text-sm mb-1">
                        <TrendingDown className="w-4 h-4" />
                        لم تُباع أبداً
                    </div>
                    <div className="text-3xl font-bold text-warning">{neverSoldCount} صنف</div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {items.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد أصناف راكدة. جميع الأدوية تُباع بانتظام! 🎉</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">اسم الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">الفروع</th>
                                <th className="px-4 py-3 text-right font-bold">المخزون</th>
                                <th className="px-4 py-3 text-right font-bold">القيمة المجمدة</th>
                                <th className="px-4 py-3 text-right font-bold">آخر بيع</th>
                                <th className="px-4 py-3 text-right font-bold">مدة الركود</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((item: any) => (
                                <tr key={item.id} className="hover:bg-muted transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-foreground">{item.name}</div>
                                        {item.barcode && (
                                            <div className="text-xs text-muted-foreground font-mono">{item.barcode}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                        {item.branches.join("، ")}
                                    </td>
                                    <td className="px-4 py-3 font-bold">{item.stock}</td>
                                    <td className="px-4 py-3 font-bold text-destructive">
                                        {item.valueAtRisk.toLocaleString()} د.ع
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {item.neverSold ? (
                                            <span className="text-warning font-bold">لم تُباع مطلقاً</span>
                                        ) : (
                                            new Date(item.lastSaleDate!).toLocaleDateString("ar-IQ")
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`px-2 py-1 rounded-md text-xs font-bold ${item.daysSinceLastSale > 180
                                                ? "bg-destructive/10 text-destructive"
                                                : item.daysSinceLastSale > 90
                                                    ? "bg-warning/10 text-warning"
                                                    : "bg-warning/20 text-warning"
                                                }`}
                                        >
                                            {item.daysSinceLastSale} يوم
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="bg-primary/10 p-4 rounded-lg text-sm text-primary">
                ملاحظة: الأدوية الراكدة هي التي لم يتم بيعها خلال الفترة المحددة ({period} يوم) ولديها مخزون أكبر من صفر. ننصح بعمل عروض أو إرجاعها للمورد.
            </div>
        </div>
    );
}
