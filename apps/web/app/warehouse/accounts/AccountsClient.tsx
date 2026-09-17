"use client";

// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: عميل صفحة «الحسابات» —
// إجمالي الذمم، شريط تقادم مقسَّم (بلا مكتبة رسوم — أعمدة CSS بسيطة)، فلاتر،
// قائمة فواتير، ونافذة تسجيل دفعة (OWNER فقط). نفس أسلوب
// app/warehouse/stock/StockClient.tsx (sonner، فلترة عميل بلا إعادة جلب لأن
// القائمة الأولية تغطي حتى 300 فاتورة).
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import SharedStatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";
import Modal from "@/app/warehouse/_components/Modal";

type AgingBucket = "CURRENT" | "D30" | "D60" | "D90" | "D90_PLUS";
type InvoiceStatus = "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";

interface InvoiceRow {
    id: string;
    organizationId: string;
    organizationName: string;
    orderId: string;
    invoiceNumber: string;
    total: number;
    paidAmount: number;
    remaining: number;
    status: InvoiceStatus;
    issuedAt: string;
    dueAt: string | null;
    aging: AgingBucket;
    paymentsCount: number;
}

interface ReceivablesSummary {
    outstanding: number;
    overdue: number;
    byBucket: Record<AgingBucket, number>;
}

const money = (n: number) => n.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });

// دلالات الحالة/التقادم موحَّدة عبر StatusChip المشترك (app/warehouse/_components/StatusChip.tsx) —
// هذان غلافان رفيعان يبقيان أسماء المكوّنات ومواقع استدعائها كما كانت (StatusChip/AgingChip
// بخاصية status/aging)، فقط اللون الفعلي انتقل لمصدر واحد مشترك مع بقية عملاء البوابة.
const STATUS_VARIANT: Record<InvoiceStatus, StatusChipVariant> = {
    UNPAID: "danger",
    PARTIAL: "warning",
    PAID: "success",
    CANCELLED: "neutral",
};
const STATUS_LABELS: Record<InvoiceStatus, string> = {
    UNPAID: "غير مسدَّدة",
    PARTIAL: "جزئية",
    PAID: "مسدَّدة",
    CANCELLED: "ملغاة",
};

function StatusChip({ status }: { status: InvoiceStatus }) {
    return <SharedStatusChip variant={STATUS_VARIANT[status]} label={STATUS_LABELS[status]} />;
}

const AGING_ORDER: AgingBucket[] = ["CURRENT", "D30", "D60", "D90", "D90_PLUS"];
const AGING_BAR_COLOR: Record<AgingBucket, string> = {
    CURRENT: "bg-success",
    D30: "bg-warning/70",
    D60: "bg-warning",
    D90: "bg-destructive/70",
    D90_PLUS: "bg-destructive",
};
const AGING_VARIANT: Record<AgingBucket, StatusChipVariant> = {
    CURRENT: "success",
    D30: "warning",
    D60: "warning",
    D90: "danger",
    D90_PLUS: "danger",
};
const AGING_LABELS: Record<AgingBucket, string> = {
    CURRENT: "ضمن المهلة",
    D30: "متأخر 1-30 يوم",
    D60: "متأخر 31-60 يوم",
    D90: "متأخر 61-90 يوم",
    D90_PLUS: "متأخر +90 يوم",
};

function AgingChip({ aging }: { aging: AgingBucket }) {
    return <SharedStatusChip variant={AGING_VARIANT[aging]} label={AGING_LABELS[aging]} emphasis={aging === "D60" || aging === "D90_PLUS"} />;
}

const STATUS_FILTERS: Array<{ key: "ALL" | InvoiceStatus; label: string }> = [
    { key: "ALL", label: "الكل" },
    { key: "UNPAID", label: "غير مسدَّدة" },
    { key: "PARTIAL", label: "جزئية" },
    { key: "PAID", label: "مسدَّدة" },
    { key: "CANCELLED", label: "ملغاة" },
];

export default function AccountsClient({
    initialInvoices,
    initialSummary,
    canRecordPayment,
}: {
    initialInvoices: InvoiceRow[];
    initialSummary: ReceivablesSummary;
    canRecordPayment: boolean;
}) {
    const paymentKey = useRef(crypto.randomUUID());
    const [invoices, setInvoices] = useState(initialInvoices);
    const [summary, setSummary] = useState(initialSummary);
    const [statusFilter, setStatusFilter] = useState<"ALL" | InvoiceStatus>("ALL");
    const [search, setSearch] = useState("");
    const [payingId, setPayingId] = useState<string | null>(null);
    const [payForm, setPayForm] = useState({ amount: "", method: "CASH", reference: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);

    const filtered = useMemo(() => {
        return invoices.filter((inv) => {
            if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
            if (search.trim() && !inv.organizationName.toLowerCase().includes(search.trim().toLowerCase())) return false;
            return true;
        });
    }, [invoices, statusFilter, search]);

    const bucketTotal = Object.values(summary.byBucket).reduce((a, b) => a + b, 0);

    // الملخّص (البطاقات + شريط التقادم) يُعاد جلبه من GET /accounts/summary بعد
    // كل دفعة بدل إعادة تنفيذ قاعدة summarizeReceivables هنا في العميل — نفس
    // الخطأ الذي effectiveLine() في warehouse-quote.ts وُجدت لمنعه: قاعدة مالية
    // واحدة بمصدر واحد، لا نسختان قد تتفرّقان لاحقاً.
    const refreshSummary = async () => {
        try {
            const res = await fetch("/api/warehouse-portal/accounts/summary");
            const data = await res.json().catch(() => null);
            if (res.ok && data) setSummary(data);
        } catch (e) {
            console.error("Failed to refresh receivables summary:", e);
        }
    };

    const openPay = (inv: InvoiceRow) => {
        setPayingId(inv.id);
        paymentKey.current = crypto.randomUUID();
        setPayForm({ amount: "", method: "CASH", reference: "", notes: "" });
        setPayError(null);
    };

    const submitPayment = async () => {
        if (!payingId) return;
        setSaving(true);
        setPayError(null);
        try {
            const res = await fetch(`/api/warehouse-portal/invoices/${payingId}/payments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount: Number(payForm.amount),
                    idempotencyKey: paymentKey.current,
                    method: payForm.method,
                    reference: payForm.reference || undefined,
                    notes: payForm.notes || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPayError(data.error ?? "تعذر تسجيل الدفعة");
                return;
            }
            setInvoices((prev) =>
                prev.map((inv) =>
                    inv.id === payingId
                        ? {
                              ...inv,
                              paidAmount: data.invoice.paidAmount,
                              status: data.invoice.status as InvoiceStatus,
                              remaining: Math.max(data.invoice.total - data.invoice.paidAmount, 0),
                              paymentsCount: inv.paymentsCount + 1,
                          }
                        : inv
                )
            );
            void refreshSummary();
            toast.success("تم تسجيل الدفعة");
            setPayingId(null);
        } catch (e) {
            console.error("Failed to submit payment:", e);
            setPayError("تعذر الاتصال بالسيرفر");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader title="الحسابات" description="الذمم المدينة على الصيدليات لدى مذخرك، وتقادمها." />

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="text-xs font-medium text-muted-foreground">إجمالي الذمم القائمة</div>
                    <div className="tabular-nums mt-1 text-2xl font-bold">{money(summary.outstanding)}</div>
                </div>
                <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="text-xs font-medium text-muted-foreground">المتأخر منها (تجاوز الاستحقاق)</div>
                    <div className="tabular-nums mt-1 text-2xl font-bold text-destructive">{money(summary.overdue)}</div>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-5 shadow-sm">
                <div className="mb-3 text-sm font-bold">توزيع التقادم</div>
                {bucketTotal <= 0 ? (
                    <div className="text-sm text-muted-foreground">لا توجد ذمم قائمة حالياً.</div>
                ) : (
                    <>
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                            {AGING_ORDER.map((b) =>
                                summary.byBucket[b] > 0 ? (
                                    <div
                                        key={b}
                                        className={AGING_BAR_COLOR[b]}
                                        style={{ width: `${(summary.byBucket[b] / bucketTotal) * 100}%` }}
                                        title={`${AGING_LABELS[b]}: ${money(summary.byBucket[b])}`}
                                    />
                                ) : null
                            )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-xs">
                            {AGING_ORDER.map((b) => (
                                <div key={b} className="flex items-center gap-1.5">
                                    <span className={`h-2.5 w-2.5 rounded-full ${AGING_BAR_COLOR[b]}`} />
                                    <span className="text-muted-foreground">{AGING_LABELS[b]}:</span>
                                    <span className="font-medium">{money(summary.byBucket[b])}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-1">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setStatusFilter(f.key)}
                            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                                statusFilter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث باسم الصيدلية…"
                    className="mr-auto w-56 rounded-lg border bg-muted px-3 py-1.5 text-sm"
                />
            </div>

            {invoices.length === 0 ? (
                <EmptyState icon="🧾" title="لا توجد فواتير بعد" description="تُنشأ الفواتير تلقائياً عند اعتماد الصيدلية لعرضك على الطلب." />
            ) : (
            /* max-h + overflow-auto (لا overflow-x-auto فقط) — ارتفاع محدود فعلياً
               هو الشرط الوحيد الذي يُفعِّل sticky على ترويسة الجدول. */
            <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="sticky top-0 z-10 border-b bg-muted">
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">رقم الفاتورة</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الصيدلية</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الإجمالي</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">المسدَّد</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">المتبقي</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الحالة</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">التقادم</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الاستحقاق</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((inv) => (
                            <tr key={inv.id} className="border-b transition-colors hover:bg-muted/20">
                                <td className="px-4 py-3">
                                    <code className="font-mono text-xs" dir="ltr">
                                        {inv.invoiceNumber}
                                    </code>
                                </td>
                                <td className="px-4 py-3 font-medium">{inv.organizationName}</td>
                                <td className="tabular-nums px-4 py-3 text-muted-foreground">{money(inv.total)}</td>
                                <td className="tabular-nums px-4 py-3 text-muted-foreground">{money(inv.paidAmount)}</td>
                                <td className={`tabular-nums px-4 py-3 ${inv.remaining > 0 ? "font-bold text-destructive" : "text-success"}`}>
                                    {money(inv.remaining)}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusChip status={inv.status} />
                                </td>
                                <td className="px-4 py-3">
                                    {inv.status !== "PAID" && inv.status !== "CANCELLED" ? (
                                        <AgingChip aging={inv.aging} />
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString("ar-IQ") : "نقدي"}
                                </td>
                                <td className="px-4 py-3">
                                    {canRecordPayment && inv.status !== "PAID" && inv.status !== "CANCELLED" ? (
                                        <button
                                            onClick={() => openPay(inv)}
                                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                                        >
                                            تسجيل دفعة
                                        </button>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                                    لا توجد فواتير مطابقة لهذا الفلتر/البحث.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {payingId && (
                <Modal open={!!payingId} onClose={() => setPayingId(null)} title="تسجيل دفعة" maxWidthClass="max-w-sm">
                    <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">تسجيل دفعة</h3>
                        {payError && (
                            <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
                                {payError}
                            </div>
                        )}
                        <div className="space-y-3">
                            <input
                                value={payForm.amount}
                                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                                placeholder="المبلغ *"
                                inputMode="decimal"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <select
                                value={payForm.method}
                                onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            >
                                <option value="CASH">نقدي</option>
                                <option value="CHECK">شيك</option>
                                <option value="TRANSFER">حوالة / تحويل</option>
                                <option value="OTHER">أخرى</option>
                            </select>
                            <input
                                value={payForm.reference}
                                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                                placeholder="مرجع (اختياري)"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={payForm.notes}
                                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                                placeholder="ملاحظات (اختياري)"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setPayingId(null)} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                                إلغاء
                            </button>
                            <button
                                onClick={submitPayment}
                                disabled={saving || !payForm.amount}
                                className="rounded-lg bg-success px-4 py-2 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                            >
                                {saving ? "جارٍ الحفظ…" : "تأكيد"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
