import { PrismaClient } from "@prisma/client";
import { TrendingUp, Calendar, Download, ArrowRight, DollarSign } from "lucide-react";
import Link from "next/link";
import SalesChart from "@/app/ui/dashboard/sales-chart";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function SalesReportPage() {
    // Get sales for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sales = await prisma.sale.findMany({
        where: {
            createdAt: { gte: sevenDaysAgo },
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

    sales.forEach(sale => {
        const dayName = dayNames[new Date(sale.createdAt).getDay()];
        const current = salesByDay.get(dayName) || 0;
        salesByDay.set(dayName, current + sale.totalAmount);
    });

    const chartData = Array.from(salesByDay.entries()).map(([day, amount]) => ({
        day,
        amount,
    }));

    // Calculate stats
    const totalSales = sales.reduce((acc, s) => acc + s.totalAmount, 0);
    const averageSale = sales.length > 0 ? totalSales / sales.length : 0;
    const topBranches = new Map<string, number>();
    sales.forEach(sale => {
        const branchName = sale.branch.name;
        const current = topBranches.get(branchName) || 0;
        topBranches.set(branchName, current + sale.totalAmount);
    });

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/reports" className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                        <ArrowRight className="w-5 h-5 text-gray-600" />
                    </Link>
                    <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                        <TrendingUp className="w-7 h-7 text-blue-600" />
                        تقرير المبيعات
                    </h1>
                </div>
                <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700">
                    <Download className="h-4 w-4" />
                    تصدير PDF
                </button>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{sales.length}</div>
                    <div className="text-sm text-gray-500">عدد المبيعات</div>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-green-600">{totalSales.toFixed(2)}</div>
                    <div className="text-sm text-green-600">إجمالي المبيعات</div>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="text-3xl font-bold text-blue-600">{averageSale.toFixed(2)}</div>
                    <div className="text-sm text-blue-600">متوسط الفاتورة</div>
                </div>
                <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
                    <div className="text-3xl font-bold text-purple-600">{topBranches.size}</div>
                    <div className="text-sm text-purple-600">الفروع النشطة</div>
                </div>
            </div>

            {/* مخطط المبيعات */}
            <div className="grid gap-6 lg:grid-cols-2 mb-8">
                <SalesChart data={chartData} title="المبيعات - آخر 7 أيام" />

                {/* أفضل الفروع */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        المبيعات حسب الفرع
                    </h3>
                    <div className="space-y-3">
                        {Array.from(topBranches.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([branch, amount], index) => (
                                <div key={branch} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${index === 0 ? "bg-yellow-100 text-yellow-700" :
                                                index === 1 ? "bg-gray-200 text-gray-700" :
                                                    "bg-blue-50 text-blue-600"
                                            }`}>
                                            {index + 1}
                                        </span>
                                        <span className="font-medium text-gray-800">{branch}</span>
                                    </div>
                                    <span className="font-bold text-green-600">{amount.toFixed(2)}</span>
                                </div>
                            ))}
                        {topBranches.size === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                لا توجد مبيعات
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* جدول المبيعات الأخيرة */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="font-bold text-gray-800">آخر المبيعات</h3>
                </div>
                {sales.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        لا توجد مبيعات
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">عدد الأصناف</th>
                                <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                                <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sales.slice(-10).reverse().map((sale) => (
                                <tr key={sale.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-gray-600">{sale.branch.name}</td>
                                    <td className="px-4 py-3 text-gray-600">{sale.items.length}</td>
                                    <td className="px-4 py-3 font-bold text-green-600">{sale.totalAmount.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-gray-600 text-sm" suppressHydrationWarning>
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
