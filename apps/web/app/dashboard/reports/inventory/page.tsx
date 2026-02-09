import { PrismaClient } from "@prisma/client";
import { Package, ArrowRight, Download, AlertTriangle, CheckCircle } from "lucide-react";
import Link from "next/link";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function InventoryReportPage() {
    const inventory = await prisma.inventory.findMany({
        include: {
            branch: true,
            batches: true,
        },
    });

    // Calculate stats
    const totalItems = inventory.length;
    const lowStock = inventory.filter(i => i.quantity <= i.reorderLevel).length;
    const outOfStock = inventory.filter(i => i.quantity === 0).length;
    const healthyStock = inventory.filter(i => i.quantity > i.reorderLevel).length;
    const totalValue = inventory.reduce((acc, item) => acc + (item.quantity * item.price), 0);

    // Check for expiring batches
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringBatches = inventory.flatMap(item =>
        item.batches.filter(batch => new Date(batch.expiryDate) <= thirtyDaysFromNow)
    ).length;

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/reports" className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                        <ArrowRight className="w-5 h-5 text-gray-600" />
                    </Link>
                    <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                        <Package className="w-7 h-7 text-green-600" />
                        تقرير المخزون
                    </h1>
                </div>
                <button className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-700">
                    <Download className="h-4 w-4" />
                    تصدير Excel
                </button>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-5 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{totalItems}</div>
                    <div className="text-sm text-gray-500">إجمالي الأصناف</div>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-green-600">{healthyStock}</div>
                    <div className="text-sm text-green-600">مخزون جيد</div>
                </div>
                <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
                    <div className="text-3xl font-bold text-yellow-600">{lowStock}</div>
                    <div className="text-sm text-yellow-600">مخزون منخفض</div>
                </div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-red-600">{outOfStock}</div>
                    <div className="text-sm text-red-600">نفاد المخزون</div>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="text-3xl font-bold text-blue-600">{totalValue.toFixed(0)}</div>
                    <div className="text-sm text-blue-600">قيمة المخزون</div>
                </div>
            </div>

            {/* تنبيهات */}
            {(lowStock > 0 || expiringBatches > 0) && (
                <div className="grid gap-4 sm:grid-cols-2 mb-8">
                    {lowStock > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-yellow-600" />
                            </div>
                            <div>
                                <div className="font-bold text-yellow-800">{lowStock} صنف بمخزون منخفض</div>
                                <div className="text-sm text-yellow-600">يحتاج إلى إعادة طلب</div>
                            </div>
                        </div>
                    )}
                    {expiringBatches > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <div className="font-bold text-red-800">{expiringBatches} دفعة تنتهي صلاحيتها قريباً</div>
                                <div className="text-sm text-red-600">خلال 30 يوم</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* جدول المخزون */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="font-bold text-gray-800">تفاصيل المخزون</h3>
                </div>
                {inventory.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        لا توجد أصناف في المخزون
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الصنف</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">الكمية</th>
                                <th className="px-4 py-3 text-right font-bold">حد إعادة الطلب</th>
                                <th className="px-4 py-3 text-right font-bold">السعر</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {inventory.map((item) => {
                                const isLow = item.quantity <= item.reorderLevel;
                                const isOut = item.quantity === 0;
                                return (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-800">{item.drugName}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.branch.name}</td>
                                        <td className="px-4 py-3">
                                            <span className={`font-bold ${isOut ? "text-red-600" : isLow ? "text-yellow-600" : "text-gray-800"
                                                }`}>
                                                {item.quantity}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{item.reorderLevel}</td>
                                        <td className="px-4 py-3 text-gray-600">{item.price.toFixed(2)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${isOut ? "bg-red-100 text-red-700" :
                                                    isLow ? "bg-yellow-100 text-yellow-700" :
                                                        "bg-green-100 text-green-700"
                                                }`}>
                                                {isOut ? (
                                                    <><AlertTriangle className="w-3 h-3" /> نفاد</>
                                                ) : isLow ? (
                                                    <><AlertTriangle className="w-3 h-3" /> منخفض</>
                                                ) : (
                                                    <><CheckCircle className="w-3 h-3" /> جيد</>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
