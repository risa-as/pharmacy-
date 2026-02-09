import { PrismaClient } from "@prisma/client";
import { Box, AlertTriangle, Calendar, Plus } from "lucide-react";
import Link from "next/link";

const prisma = new PrismaClient();

export default async function BatchesPage() {
    const batches = await prisma.batch.findMany({
        orderBy: { expiryDate: "asc" },
        include: {
            inventory: {
                include: {
                    branch: true,
                },
            },
        },
    });

    // جلب الأدوية
    const drugIds = batches.map((b) => b.inventory.drugId);
    const uniqueDrugIds = drugIds.filter((id, index) => drugIds.indexOf(id) === index);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: uniqueDrugIds } },
        select: { id: true, tradeName: true },
    });
    const drugMap = new Map(drugs.map((d) => [d.id, d]));

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <Box className="w-7 h-7 text-blue-600" />
                    إدارة الدفعات
                </h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{batches.length}</div>
                    <div className="text-sm text-gray-500">إجمالي الدفعات</div>
                </div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-red-600">
                        {batches.filter((b) => new Date(b.expiryDate) < now).length}
                    </div>
                    <div className="text-sm text-red-600">منتهية الصلاحية</div>
                </div>
                <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
                    <div className="text-3xl font-bold text-yellow-600">
                        {batches.filter((b) => {
                            const exp = new Date(b.expiryDate);
                            return exp >= now && exp <= thirtyDaysFromNow;
                        }).length}
                    </div>
                    <div className="text-sm text-yellow-600">ستنتهي خلال 30 يوم</div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {batches.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <Box className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد دفعات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">رقم الدفعة</th>
                                <th className="px-4 py-3 text-right font-bold">الكمية</th>
                                <th className="px-4 py-3 text-right font-bold">تاريخ الانتهاء</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {batches.map((batch) => {
                                const drug = drugMap.get(batch.inventory.drugId);
                                const expiryDate = new Date(batch.expiryDate);
                                const isExpired = expiryDate < now;
                                const isExpiringSoon = expiryDate >= now && expiryDate <= thirtyDaysFromNow;

                                let statusClass = "bg-green-100 text-green-700";
                                let statusText = "صالح";

                                if (isExpired) {
                                    statusClass = "bg-red-100 text-red-700";
                                    statusText = "منتهي";
                                } else if (isExpiringSoon) {
                                    statusClass = "bg-yellow-100 text-yellow-700";
                                    statusText = "قريب الانتهاء";
                                }

                                return (
                                    <tr key={batch.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-800">
                                            {drug?.tradeName || "غير معروف"}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {batch.inventory.branch?.name || "غير محدد"}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-gray-600">
                                            {batch.batchNumber}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-gray-800">
                                            {batch.quantity}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {expiryDate.toLocaleDateString("ar-IQ")}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusClass}`}>
                                                {statusText}
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
