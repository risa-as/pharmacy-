import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Receipt } from "lucide-react";

/** Matches the Prisma PaymentTransaction shape needed for display. */
export interface PaymentTransactionRow {
    id: string;
    amount: number;
    currency: string;
    gateway: "ZAINCASH" | "STRIPE" | "MANUAL";
    status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
    renewalMonths: number;
    initiatedAt: Date;
    completedAt: Date | null;
}

interface PaymentHistoryTableProps {
    transactions: PaymentTransactionRow[];
}

const GATEWAY_LABELS: Record<PaymentTransactionRow["gateway"], string> = {
    ZAINCASH: "زين كاش",
    STRIPE: "Stripe",
    MANUAL: "يدوي",
};

const STATUS_CONFIG: Record<
    PaymentTransactionRow["status"],
    { label: string; className: string }
> = {
    PENDING:   { label: "قيد المعالجة", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
    COMPLETED: { label: "مكتمل",        className: "bg-green-500/10 text-green-600 border-green-500/30"   },
    FAILED:    { label: "فشل",          className: "bg-destructive/10 text-destructive border-destructive/30" },
    EXPIRED:   { label: "منتهي",        className: "bg-muted text-muted-foreground border-border"          },
};

export default function PaymentHistoryTable({ transactions }: PaymentHistoryTableProps) {
    if (transactions.length === 0) {
        return (
            <div className="glass-card rounded-xl border border-border p-8 flex flex-col items-center gap-3 text-center">
                <div className="rounded-full bg-muted p-3">
                    <Receipt className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">لا توجد سجلات دفع</p>
                <p className="text-xs text-muted-foreground">
                    ستظهر هنا جميع عمليات الدفع والتجديد بعد إجراء أول عملية.
                </p>
            </div>
        );
    }

    return (
        <div className="glass-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">التاريخ</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">المبلغ</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">طريقة الدفع</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">مدة التجديد</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground">الحالة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {transactions.map((txn: any) => {
                            const statusCfg = (STATUS_CONFIG as any)[txn.status];
                            return (
                                <tr key={txn.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3 text-foreground">
                                        {format(txn.initiatedAt, "d MMM yyyy", { locale: ar })}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-foreground">
                                        {txn.amount.toLocaleString("ar-IQ")}{" "}
                                        <span className="text-xs text-muted-foreground">{txn.currency}</span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {GATEWAY_LABELS[txn.gateway]}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {txn.renewalMonths}{" "}
                                        {txn.renewalMonths === 1 ? "شهر" : "أشهر"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusCfg.className}`}
                                        >
                                            {statusCfg.label}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
