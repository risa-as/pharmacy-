import { getPatientDebts } from "@/app/lib/actions/debt";
import { getSafes, getSafesForOrg } from "@/app/lib/actions/finance-actions";
import { ArrowRight, BookOpen, CheckCircle, Clock, Receipt } from "lucide-react";
import Link from "next/link";
import DebtPaymentForm from "@/app/ui/debts/debt-payment-form";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";

function formatIQD(amount: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(amount)) + " د.ع";
}

export default async function DebtDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const tenantCtx = await getTenantContext();

    const safesPromise = tenantCtx instanceof NextResponse
        ? Promise.resolve([])
        : tenantCtx.user.branchId
            ? getSafes(tenantCtx.user.branchId)
            : tenantCtx.user.organizationId
                ? getSafesForOrg(tenantCtx.user.organizationId)
                : Promise.resolve([]);

    const [data, safes] = await Promise.all([
        getPatientDebts(params.id),
        safesPromise,
    ]);

    if (!data) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <p>العميل غير موجود</p>
                <Link href="/dashboard/debts" className="text-primary mt-4 inline-block">
                    العودة لدفتر الديون
                </Link>
            </div>
        );
    }

    const { patient, sales } = data;

    return (
        <div className="w-full max-w-4xl mx-auto" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/dashboard/debts"
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-destructive" />
                        كشف حساب: {patient.name}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1" dir="ltr">{patient.phone}</p>
                </div>
            </div>

            {/* Balance Card */}
            <div className="bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground rounded-2xl p-6 mb-8 shadow-lg">
                <p className="text-sm opacity-80">الرصيد المستحق</p>
                <p className="text-3xl font-bold mt-1">{formatIQD(patient.balance)}</p>
                <p className="text-xs opacity-60 mt-2">
                    {sales.filter((s: any) => !s.isPaid).length} فاتورة غير مسددة من أصل {sales.length}
                </p>
                {(() => {
                    const totalBilled = sales.reduce((sum: number, s: any) => sum + s.total - s.discount, 0);
                    const totalPaid = sales.reduce((sum: number, s: any) => sum + s.totalPaid, 0);
                    return (
                        <div className="flex gap-6 mt-4 pt-3 border-t border-white/20 text-xs">
                            <div>
                                <p className="opacity-60">إجمالي الفواتير</p>
                                <p className="font-bold opacity-90">{formatIQD(totalBilled)}</p>
                            </div>
                            <div>
                                <p className="opacity-60">المدفوع</p>
                                <p className="font-bold opacity-90">{formatIQD(totalPaid)}</p>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Sales List */}
            <div className="space-y-4">
                {sales.length === 0 ? (
                    <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
                        <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>لا توجد فواتير بالآجل</p>
                    </div>
                ) : (
                    sales.map((sale: any) => (
                        <div
                            key={sale.id}
                            className={`bg-card rounded-2xl border ${sale.isPaid ? "border-success/40" : "border-destructive/40"
                                } overflow-hidden`}
                        >
                            {/* Sale Header */}
                            <div className={`p-4 flex items-center justify-between ${sale.isPaid ? "bg-success/10" : "bg-destructive/10"
                                }`}>
                                <div className="flex items-center gap-3">
                                    {sale.isPaid ? (
                                        <CheckCircle className="w-5 h-5 text-success" />
                                    ) : (
                                        <Clock className="w-5 h-5 text-destructive" />
                                    )}
                                    <div>
                                        <p className="text-sm font-medium text-foreground">
                                            فاتورة بتاريخ {new Date(sale.createdAt).toLocaleDateString("ar-IQ")}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(sale.createdAt).toLocaleTimeString("ar-IQ", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-foreground">{formatIQD(sale.total - sale.discount)}</p>
                                    {!sale.isPaid && (
                                        <p className="text-xs text-destructive">متبقي: {formatIQD(sale.remaining)}</p>
                                    )}
                                </div>
                            </div>

                            {/* Sale Items */}
                            <div className="p-4 border-t border-border">
                                <div className="space-y-1">
                                    {sale.items.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between text-sm text-muted-foreground">
                                            <span>{item.name} × {item.quantity}</span>
                                            <span>{formatIQD(item.price * item.quantity)}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Payments History */}
                                {sale.payments.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-border">
                                        <p className="text-xs font-medium text-muted-foreground mb-2">سجل الدفعات:</p>
                                        {sale.payments.map((p: any) => (
                                            <div key={p.id} className="flex justify-between text-xs text-success py-1">
                                                <span>
                                                    ✓ {formatIQD(p.amount)} — {new Date(p.createdAt).toLocaleDateString("ar-IQ")}
                                                    {p.note && <span className="text-muted-foreground mr-2">({p.note})</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Payment Form for unpaid */}
                                {!sale.isPaid && (
                                    <DebtPaymentForm
                                        saleId={sale.id}
                                        patientId={patient.id}
                                        remaining={sale.remaining}
                                        safes={safes}
                                    />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
