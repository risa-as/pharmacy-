import { PrismaClient } from "@prisma/client";
import { ShoppingCart, TrendingUp, Calendar, Package } from "lucide-react";
import Link from "next/link";

const prisma = new PrismaClient();

export default async function SalesPage() {
    // جلب المبيعات
    const sales = await prisma.sale.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            items: true,
            branch: true,
        },
        take: 100,
    });

    // إحصائيات
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySales = sales.filter(s => new Date(s.createdAt) >= today);
    const todayTotal = todaySales.reduce((acc, s) => acc + s.total, 0);
    const totalItems = todaySales.reduce((acc, s) => acc + s.items.length, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthSales = sales.filter(s => new Date(s.createdAt) >= thisMonth);
    const monthTotal = monthSales.reduce((acc, s) => acc + s.total, 0);

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <ShoppingCart className="w-7 h-7 text-blue-600" />
                    المبيعات
                </h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-green-600" />
                        </div>
                        <span className="text-sm text-gray-500">مبيعات اليوم</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">{todayTotal.toLocaleString()} د.ع</div>
                    <div className="text-xs text-gray-400">{todaySales.length} عملية بيع</div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-sm text-gray-500">مبيعات الشهر</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">{monthTotal.toLocaleString()} د.ع</div>
                    <div className="text-xs text-gray-400">{monthSales.length} عملية بيع</div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Package className="w-5 h-5 text-purple-600" />
                        </div>
                        <span className="text-sm text-gray-500">أصناف اليوم</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">{totalItems}</div>
                    <div className="text-xs text-gray-400">صنف مباع</div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <ShoppingCart className="w-5 h-5 text-orange-600" />
                        </div>
                        <span className="text-sm text-gray-500">إجمالي المبيعات</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">{sales.length}</div>
                    <div className="text-xs text-gray-400">عملية مسجلة</div>
                </div>
            </div>

            {/* Sales Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 p-4 border-b border-gray-200">
                    <h2 className="font-bold text-gray-800">سجل المبيعات</h2>
                </div>

                {sales.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد مبيعات مسجلة</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 text-gray-600 text-sm">
                                <tr>
                                    <th className="px-4 py-3 text-right font-bold">#</th>
                                    <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                                    <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                    <th className="px-4 py-3 text-right font-bold">الأصناف</th>
                                    <th className="px-4 py-3 text-right font-bold">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sales.map((sale, index) => (
                                    <tr key={sale.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-600">{index + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-gray-800">
                                                {new Date(sale.createdAt).toLocaleDateString('ar-IQ')}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {new Date(sale.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {sale.branch?.name || 'غير محدد'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm">
                                                {sale.items.length} صنف
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-gray-800">
                                            {sale.total.toLocaleString()} د.ع
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
