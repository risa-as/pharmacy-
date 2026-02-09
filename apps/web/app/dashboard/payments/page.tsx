import { PrismaClient } from "@prisma/client";
import { CreditCard, DollarSign, Smartphone, Building2 } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const methodLabels: Record<string, string> = {
    CASH: "نقداً",
    CARD: "بطاقة",
    MOBILE_WALLET: "محفظة إلكترونية",
    BANK_TRANSFER: "تحويل بنكي",
};

const methodIcons: Record<string, any> = {
    CASH: DollarSign,
    CARD: CreditCard,
    MOBILE_WALLET: Smartphone,
    BANK_TRANSFER: Building2,
};

const statusLabels: Record<string, string> = {
    PENDING: "معلقة",
    COMPLETED: "مكتملة",
    FAILED: "فاشلة",
    REFUNDED: "مسترجعة",
};

const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    REFUNDED: "bg-purple-100 text-purple-700",
};

export default async function PaymentsPage() {
    const payments = await prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            sale: {
                include: {
                    branch: true,
                },
            },
        },
    });

    // إحصائيات
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayPayments = payments.filter(p => new Date(p.createdAt) >= today);
    const totalToday = todayPayments.reduce((acc, p) => acc + p.amount, 0);
    const cashToday = todayPayments.filter(p => p.method === "CASH").reduce((acc, p) => acc + p.amount, 0);
    const cardToday = todayPayments.filter(p => p.method === "CARD").reduce((acc, p) => acc + p.amount, 0);

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <CreditCard className="w-7 h-7 text-blue-600" />
                    سجل المدفوعات
                </h1>
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-3xl font-bold text-gray-800">{payments.length}</div>
                    <div className="text-sm text-gray-500">إجمالي العمليات</div>
                </div>
                <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-green-600">{totalToday.toFixed(2)}</div>
                    <div className="text-sm text-green-600">مجموع اليوم</div>
                </div>
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="text-3xl font-bold text-blue-600">{cashToday.toFixed(2)}</div>
                    <div className="text-sm text-blue-600">نقداً اليوم</div>
                </div>
                <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
                    <div className="text-3xl font-bold text-purple-600">{cardToday.toFixed(2)}</div>
                    <div className="text-sm text-purple-600">بطاقات اليوم</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {payments.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد مدفوعات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">طريقة الدفع</th>
                                <th className="px-4 py-3 text-right font-bold">المبلغ</th>
                                <th className="px-4 py-3 text-right font-bold">المرجع</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                                <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {payments.map((payment) => {
                                const Icon = methodIcons[payment.method] || CreditCard;
                                return (
                                    <tr key={payment.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-600">
                                            {payment.sale.branch.name}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Icon className="w-4 h-4 text-gray-500" />
                                                <span>{methodLabels[payment.method]}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-green-600">
                                            {payment.amount.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-gray-500">
                                            {payment.referenceNumber || "-"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusColors[payment.status]}`}>
                                                {statusLabels[payment.status]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-sm" suppressHydrationWarning>
                                            {new Date(payment.createdAt).toLocaleDateString("ar-IQ")}
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
