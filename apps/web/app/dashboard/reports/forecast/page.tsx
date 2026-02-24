import { PrismaClient } from "@prisma/client";
import { TrendingUp, AlertTriangle, ShoppingCart } from "lucide-react";

const prisma = new PrismaClient();

export default async function ForecastPage() {
    // Logic: Calculate "Run Rate" (Average Daily Sales) over last 30 days.
    // Recommended Order = (Daily Sales * 30 Days Target) - Current Stock.

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all inventory
    const allInventory = await prisma.inventory.findMany({
        include: {
            drug: true,
            branch: true,
            batches: true
        }
    });

    const forecastItems = [];

    for (const item of allInventory) {
        // Get sales count in last 30 days
        const sales = await prisma.saleItem.findMany({
            where: {
                drugId: item.drugId,
                sale: {
                    branchId: item.branchId,
                    createdAt: { gte: thirtyDaysAgo }
                }
            }
        });

        const totalSold30Days = sales.reduce((acc, sale) => acc + sale.quantity, 0);
        const dailyRunRate = totalSold30Days / 30;

        // If run rate is significant (e.g., > 0.1 item per day)
        if (dailyRunRate > 0.1) {
            const currentQuantity = item.batches.reduce((sum, b) => sum + b.quantity, 0);
            const daysOfCoverage = currentQuantity > 0 ? currentQuantity / dailyRunRate : 0;
            const targetStock = dailyRunRate * 30; // Target 1 month of stock
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
    forecastItems.sort((a, b) => a.daysOfCoverage - b.daysOfCoverage);

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
                                <th className="px-4 py-3 text-right font-bold bg-primary/10 text-blue-800">الكمية المقترحة للطلب</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {forecastItems.map((item) => (
                                <tr key={item.id} className="hover:bg-muted">
                                    <td className="px-4 py-3 font-bold text-foreground">{item.drug.tradeName}</td>
                                    <td className="px-4 py-3 font-mono text-muted-foreground">{item.currentQuantity}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{item.dailyRunRate.toFixed(1)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-md text-sm font-bold ${item.daysOfCoverage < 7 ? "bg-destructive/10 text-destructive" :
                                            item.daysOfCoverage < 14 ? "bg-yellow-100 text-yellow-700" :
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
