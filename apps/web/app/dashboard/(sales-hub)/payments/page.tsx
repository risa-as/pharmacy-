import { prisma } from "@/app/lib/prisma";
import { CreditCard, DollarSign, Smartphone, Building2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

const methodLabels: Record<string, string> = {
    CASH: "نقداً",
    CARD: "بطاقة",
    MOBILE_WALLET: "محفظة إلكترونية",
    BANK_TRANSFER: "تحويل بنكي",
    ZAIN_CASH: "زين كاش",
    STRIPE: "Stripe",
};

const methodIcons: Record<string, any> = {
    CASH: DollarSign,
    CARD: CreditCard,
    MOBILE_WALLET: Smartphone,
    BANK_TRANSFER: Building2,
    ZAIN_CASH: Smartphone,
    STRIPE: CreditCard,
};

const statusLabels: Record<string, string> = {
    PENDING: "معلقة",
    COMPLETED: "مكتملة",
    FAILED: "فاشلة",
    REFUNDED: "مسترجعة",
};

const statusColors: Record<string, string> = {
    PENDING: "bg-warning/20 text-warning",
    COMPLETED: "bg-success/10 text-success",
    FAILED: "bg-destructive/10 text-destructive",
    REFUNDED: "bg-info text-info",
};

export default async function PaymentsPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    // Use branchId if provided, else use the default tenantBranchWhere scopes on sale
    const saleWhere = branchId ? { branchId, ...tenantBranchWhere } : { ...tenantBranchWhere };

    const payments = await prisma.payment.findMany({
        where: { sale: saleWhere },
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
    const totalToday = todayPayments.reduce((acc: any, p: any) => acc + p.amount, 0);
    const cashToday = todayPayments.filter(p => p.method === "CASH").reduce((acc: any, p: any) => acc + p.amount, 0);
    const cardToday = todayPayments.filter(p => p.method === "CARD").reduce((acc: any, p: any) => acc + p.amount, 0);
    const zainCashToday = todayPayments.filter(p => p.method === "ZAIN_CASH").reduce((acc: any, p: any) => acc + p.amount, 0);

    return (
        <div className="glass-card w-full p-6" dir="rtl" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-6">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <CreditCard className="w-7 h-7 text-primary" />
                    سجل المدفوعات
                </h1>
            </div>

            {/* Branch Filter */}
            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/payments" />
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{payments.length}</div>
                    <div className="text-sm text-muted-foreground">إجمالي العمليات</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">{totalToday.toLocaleString()}</div>
                    <div className="text-sm text-success">مجموع اليوم</div>
                </div>
                <div className="bg-primary/10 rounded-xl border border-primary p-4">
                    <div className="text-3xl font-bold text-primary">{cashToday.toLocaleString()}</div>
                    <div className="text-sm text-primary">نقداً اليوم</div>
                </div>
                <div className="bg-info/10 rounded-xl border border-info/20 p-4">
                    <div className="text-3xl font-bold text-info">{cardToday.toLocaleString()}</div>
                    <div className="text-sm text-info">بطاقات اليوم</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-emerald-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Smartphone className="w-4 h-4 text-success" />
                    </div>
                    <div className="text-3xl font-bold text-success">{zainCashToday.toLocaleString()}</div>
                    <div className="text-sm text-success">زين كاش اليوم</div>
                </div>
            </div>

            {/* الجدول */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {payments.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد مدفوعات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
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
                            {payments.map((payment: any) => {
                                const Icon = methodIcons[payment.method] || CreditCard;
                                return (
                                    <tr key={payment.id} className="hover:bg-muted">
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {payment.sale.branch.name}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Icon className="w-4 h-4 text-muted-foreground" />
                                                <span>{methodLabels[payment.method] || payment.method}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-success">
                                            {payment.amount.toLocaleString()} د.ع
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                                            {payment.referenceNumber || "-"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusColors[payment.status]}`}>
                                                {statusLabels[payment.status]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-sm" suppressHydrationWarning>
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
