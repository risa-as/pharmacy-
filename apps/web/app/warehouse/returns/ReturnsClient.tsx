"use client";

// المرحلة 5 (الصقل التجاري) §Part 4: عميل صفحة «الإرجاعات» — قائمة بفلترة
// الحالة + قبول/رفض (canQuoteOrders، الخادم يتحقق مجدداً).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import StatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";

interface ReturnItem {
    id: string;
    barcode: string;
    quantity: number;
    unitPrice: number;
}

interface ReturnRow {
    id: string;
    orderId: string;
    organizationName: string;
    reason: string | null;
    totalAmount: number;
    status: string;
    actorName: string | null;
    createdAt: string;
    items: ReturnItem[];
}

const money = (n: number) => n.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
    PENDING: "بانتظار قرارك",
    ACCEPTED: "مقبول",
    REJECTED: "مرفوض",
};
const STATUS_VARIANT: Record<string, StatusChipVariant> = {
    PENDING: "warning",
    ACCEPTED: "success",
    REJECTED: "danger",
};

export default function ReturnsClient({
    initialReturns,
    canDecide,
}: {
    initialReturns: ReturnRow[];
    canDecide: boolean;
}) {
    const [returns, setReturns] = useState(initialReturns);
    const [filter, setFilter] = useState("ALL");
    const [busyId, setBusyId] = useState<string | null>(null);

    const visible = useMemo(
        () => (filter === "ALL" ? returns : returns.filter((r) => r.status === filter)),
        [returns, filter]
    );

    const decide = async (r: ReturnRow, action: "ACCEPTED" | "REJECTED") => {
        if (action === "REJECTED" && !confirm(`رفض طلب الإرجاع من «${r.organizationName}»؟`)) return;
        setBusyId(r.id);
        try {
            const res = await fetch(`/api/warehouse-portal/returns/${r.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر تنفيذ القرار");
                return;
            }
            setReturns((prev) =>
                prev.map((p) => (p.id === r.id ? { ...p, status: action } : p))
            );
            toast.success(action === "ACCEPTED" ? "قُبل الإرجاع وطُبِّق الإشعار الدائن على الفاتورة" : "رُفض طلب الإرجاع");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="الإرجاعات"
                description="طلبات إرجاع الصيدليات على طلبات مُسلَّمة — القبول ينشئ إشعاراً دائناً على فاتورة الصيدلية."
                actions={
                    <div className="flex flex-wrap gap-1">
                        {[
                            ["ALL", "الكل"],
                            ["PENDING", "بانتظار القرار"],
                            ["ACCEPTED", "مقبولة"],
                            ["REJECTED", "مرفوضة"],
                        ].map(([v, l]) => (
                            <button
                                key={v}
                                onClick={() => setFilter(v)}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                    filter === v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                                }`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                }
            />

            {visible.length === 0 ? (
                <EmptyState icon="↩️" title="لا توجد طلبات إرجاع بهذه الحالة." />
            ) : (
                <div className="space-y-3">
                    {visible.map((r) => (
                        <div key={r.id} className="rounded-lg border bg-card p-4 shadow-sm">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-bold">{r.organizationName}</span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(r.createdAt).toLocaleString("ar-IQ")}
                                </span>
                                <span className="mr-auto">
                                    <StatusChip variant={STATUS_VARIANT[r.status] ?? "neutral"} label={STATUS_LABEL[r.status] ?? r.status} emphasis={r.status === "PENDING"} />
                                </span>
                            </div>
                            {r.reason && <div className="mt-1 text-sm text-muted-foreground">السبب: {r.reason}</div>}
                            <div className="mt-3 overflow-x-auto rounded-lg border">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted text-right text-muted-foreground">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">الباركود</th>
                                            <th className="px-3 py-2 font-medium">الكمية</th>
                                            <th className="px-3 py-2 font-medium">سعر الوحدة</th>
                                            <th className="px-3 py-2 font-medium">القيمة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {r.items.map((it) => (
                                            <tr key={it.id} className="border-t">
                                                <td className="px-3 py-2 font-mono text-xs">{it.barcode}</td>
                                                <td className="tabular-nums px-3 py-2">{it.quantity}</td>
                                                <td className="tabular-nums px-3 py-2">{money(it.unitPrice)}</td>
                                                <td className="tabular-nums px-3 py-2 font-medium">{money(it.quantity * it.unitPrice)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="tabular-nums mt-2 text-left font-bold">إجمالي الإرجاع: {money(r.totalAmount)}</div>
                            {canDecide && r.status === "PENDING" && (
                                <div className="mt-3 flex justify-end gap-2">
                                    <button
                                        onClick={() => decide(r, "REJECTED")}
                                        disabled={busyId === r.id}
                                        className="rounded-lg bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                                    >
                                        رفض
                                    </button>
                                    <button
                                        onClick={() => decide(r, "ACCEPTED")}
                                        disabled={busyId === r.id}
                                        className="rounded-lg bg-success px-3 py-1.5 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                                    >
                                        قبول وتطبيق الإشعار الدائن
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
