import { PrismaClient } from "@prisma/client";
import { Tag, Plus, Percent, Calendar, ChevronLeft } from "lucide-react";
import Link from "next/link";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function DiscountsPage() {
    const discounts = await prisma.discount.findMany({
        orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const active = discounts.filter(d => d.isActive && new Date(d.endDate) > now).length;
    const expired = discounts.filter(d => new Date(d.endDate) <= now).length;

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <Tag className="w-7 h-7 text-blue-600" />
                    الخصومات والعروض
                </h1>
                <Link
                    href="/dashboard/discounts/create"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Plus className="h-5 w-5" />
                    إضافة عرض
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{discounts.length}</div>
                    <div className="text-sm text-gray-500">إجمالي العروض</div>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-green-600">{active}</div>
                    <div className="text-sm text-green-600">نشطة</div>
                </div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-red-600">{expired}</div>
                    <div className="text-sm text-red-600">منتهية</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {discounts.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <Tag className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد عروض</p>
                        <Link href="/dashboard/discounts/create" className="text-blue-600 hover:underline mt-2 inline-block">
                            إضافة عرض جديد
                        </Link>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">اسم العرض</th>
                                <th className="px-4 py-3 text-right font-bold">الكود</th>
                                <th className="px-4 py-3 text-right font-bold">النوع</th>
                                <th className="px-4 py-3 text-right font-bold">القيمة</th>
                                <th className="px-4 py-3 text-right font-bold">الفترة</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                                <th className="px-4 py-3 text-right font-bold">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {discounts.map((discount) => {
                                const isExpired = new Date(discount.endDate) <= now;
                                const isActive = discount.isActive && !isExpired;
                                return (
                                    <tr key={discount.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${discount.type === "PERCENTAGE" ? "bg-purple-100" : "bg-green-100"
                                                    }`}>
                                                    {discount.type === "PERCENTAGE" ? (
                                                        <Percent className="w-4 h-4 text-purple-600" />
                                                    ) : (
                                                        <Tag className="w-4 h-4 text-green-600" />
                                                    )}
                                                </div>
                                                <span className="font-bold text-gray-800">{discount.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {discount.code ? (
                                                <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                                                    {discount.code}
                                                </code>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {discount.type === "PERCENTAGE" ? "نسبة مئوية" : "مبلغ ثابت"}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-green-600">
                                            {discount.type === "PERCENTAGE"
                                                ? `${discount.value}%`
                                                : `${discount.value.toFixed(2)}`
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-sm" suppressHydrationWarning>
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(discount.startDate).toLocaleDateString("ar-IQ")}
                                                <ChevronLeft className="w-3 h-3" />
                                                {new Date(discount.endDate).toLocaleDateString("ar-IQ")}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${isActive
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                                }`}>
                                                {isActive ? "نشط" : isExpired ? "منتهي" : "معطل"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/dashboard/discounts/${discount.id}/edit`}
                                                className="text-blue-600 hover:underline text-sm"
                                            >
                                                تعديل
                                            </Link>
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
