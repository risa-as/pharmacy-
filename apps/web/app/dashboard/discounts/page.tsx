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
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Tag className="w-7 h-7 text-primary" />
                    الخصومات والعروض
                </h1>
                <Link
                    href="/dashboard/discounts/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-5 w-5" />
                    إضافة عرض
                </Link>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{discounts.length}</div>
                    <div className="text-sm text-muted-foreground">إجمالي العروض</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">{active}</div>
                    <div className="text-sm text-success">نشطة</div>
                </div>
                <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-destructive">{expired}</div>
                    <div className="text-sm text-destructive">منتهية</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {discounts.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Tag className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد عروض</p>
                        <Link href="/dashboard/discounts/create" className="text-primary hover:underline mt-2 inline-block">
                            إضافة عرض جديد
                        </Link>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
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
                                    <tr key={discount.id} className="hover:bg-muted">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${discount.type === "PERCENTAGE" ? "bg-purple-100" : "bg-success/10"
                                                    }`}>
                                                    {discount.type === "PERCENTAGE" ? (
                                                        <Percent className="w-4 h-4 text-purple-600" />
                                                    ) : (
                                                        <Tag className="w-4 h-4 text-success" />
                                                    )}
                                                </div>
                                                <span className="font-bold text-foreground">{discount.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {discount.code ? (
                                                <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                                                    {discount.code}
                                                </code>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {discount.type === "PERCENTAGE" ? "نسبة مئوية" : "مبلغ ثابت"}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-success">
                                            {discount.type === "PERCENTAGE"
                                                ? `${discount.value}%`
                                                : `${discount.value.toFixed(2)}`
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(discount.startDate).toLocaleDateString("ar-IQ")}
                                                <ChevronLeft className="w-3 h-3" />
                                                {new Date(discount.endDate).toLocaleDateString("ar-IQ")}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${isActive
                                                ? "bg-success/10 text-success"
                                                : "bg-destructive/10 text-destructive"
                                                }`}>
                                                {isActive ? "نشط" : isExpired ? "منتهي" : "معطل"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/dashboard/discounts/${discount.id}/edit`}
                                                className="text-primary hover:underline text-sm"
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
