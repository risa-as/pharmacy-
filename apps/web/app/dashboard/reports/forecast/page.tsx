export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { TrendingUp, AlertTriangle, ShoppingCart } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function ForecastPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { tenantBranchWhere } = tenantCtx;

    // Logic: Calculate "Run Rate" (Average Daily Sales) over last 30 days.
    // Recommended Order = (Daily Sales * 30 Days Target) - Current Stock.

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all inventory
    const allInventory = await prisma.inventory.findMany({
        where: tenantBranchWhere,
        include: {
            drug: true,
            branch: true,
            batches: true
        }
    });

    // Single batch query: sum sold quantity per drug across all inventory branches in the period
    const inventoryBranchIds = Array.from(new Set(allInventory.map((i: any) => i.branchId)));
    const soldData = await prisma.saleItem.groupBy({
        by: ['drugId'],
        where: {
            sale: {
                branchId: { in: inventoryBranchIds },
                createdAt: { gte: thirtyDaysAgo }
            }
        },
        _sum: { quantity: true }
    });
    const soldMap = new Map(soldData.map((s: any) => [s.drugId, s._sum.quantity ?? 0]));

    const forecastItems = [];
    for (const item of allInventory) {
        const totalSold30Days = soldMap.get(item.drugId) ?? 0;
        const dailyRunRate = totalSold30Days / 30;

        if (dailyRunRate > 0.1) {
            const currentQuantity = item.batches.reduce((sum: any, b: any) => sum + b.quantity, 0);
            const daysOfCoverage = currentQuantity > 0 ? currentQuantity / dailyRunRate : 0;
            const targetStock = dailyRunRate * 30;
            const recommendedOrder = Math.max(0, targetStock - currentQuantity);

            if (recommendedOrder > 0) {
                forecastItems.push({
                    ...item,
                    currentQuantity,
                    dailyRunRate,
                    daysOfCoverage,
                    recommendedOrder
                });
            }
        }
    }

    // Sort by most critical (lowest days of coverage)
    forecastItems.sort((a: any, b: any) => a.daysOfCoverage - b.daysOfCoverage);

    return (
        <div className="glass-card w-full p-6" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                        <TrendingUp className="w-7 h-7 text-primary" />
                        توقعات الاحتياجات (Demand Forecast)
                    </h1>
                    <p className="text-muted-foreground mt-2">قائمة بالنواقص المتوقعة بناءً على معدل البيع اليومي خلال الـ 30 يوم الماضية.</p>
                </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {forecastItems.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>المخزون بوضع جيد! لا توجد نواقص متوقعة حالياً.</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">اسم الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">المخزون الحالي</th>
                                <th className="px-4 py-3 text-right font-bold">معدل البيع اليومي</th>
                                <th className="px-4 py-3 text-right font-bold">يكفي لـ (أيام)</th>
                                <th className="px-4 py-3 text-right font-bold bg-primary/10 text-primary">الكمية المقترحة للطلب</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {forecastItems.map((item: any) => (
                                <tr key={item.id} className="hover:bg-muted">
                                    <td className="px-4 py-3 font-bold text-foreground">{item.drug.tradeName}</td>
                                    <td className="px-4 py-3 font-mono text-muted-foreground">{item.currentQuantity}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{item.dailyRunRate.toFixed(1)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-md text-sm font-bold ${item.daysOfCoverage < 7 ? "bg-destructive/10 text-destructive" :
                                            item.daysOfCoverage < 14 ? "bg-warning/20 text-warning" :
                                                "bg-success/10 text-success"
                                            }`}>
                                            {item.daysOfCoverage.toFixed(0)} يوم
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-bold text-primary bg-primary/10/50">
                                        {Math.ceil(item.recommendedOrder)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.daysOfCoverage < 7 && (
                                            <div className="flex items-center gap-1 text-destructive text-xs font-bold">
                                                <AlertTriangle className="w-3 h-3" />
                                                حرج جداً
                                            </div>
                                        )}
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
