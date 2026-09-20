"use client";

// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: عميل صفحة «العملاء» —
// جدول الصيدليات + تعديل شروط التعامل (OWNER فقط، الخادم يتحقق مجدداً) +
// نافذة كشف حساب (فواتير كل صيدلية ودفعاتها) — نفس أسلوب
// app/warehouse/stock/StockClient.tsx (sonner، نوافذ عبر Modal المشترك).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import LoadingBlock from "@/app/warehouse/_components/Loading";
import SharedStatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";
import Modal from "@/app/warehouse/_components/Modal";

interface CustomerRow {
    customerId: string | null;
    organizationId: string;
    name: string;
    orderCount: number;
    lastOrderDate: string | null;
    creditLimit: number;
    paymentTermDays: number;
    // رصيد سابق: دَين موروث من قبل هذا النظام، وليس جزءاً متحركاً من outstanding
    // أدناه — outstanding يشمله فعلياً (مُضافاً من الخادم)، لكنه يبقى حقلاً
    // مستقلاً هنا كي تُعرض القيمتان معاً بلا التباس بينهما.
    openingBalance: number;
    priceTier: string | null;
    isBlocked: boolean;
    notes: string | null;
    outstanding: number;
}

type AgingBucket = "CURRENT" | "D30" | "D60" | "D90" | "D90_PLUS";
type InvoiceStatus = "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";

interface InvoiceRow {
    id: string;
    invoiceNumber: string;
    orderId: string;
    total: number;
    paidAmount: number;
    remaining: number;
    status: InvoiceStatus;
    issuedAt: string;
    dueAt: string | null;
    aging: AgingBucket;
    paymentsCount: number;
}

interface PaymentRow {
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    notes: string | null;
    receivedAt: string;
    actorName: string | null;
}

const money = (n: number) => n.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });

// دلالات الحالة/التقادم موحَّدة عبر StatusChip المشترك — انظر التعليق المطابق
// في app/warehouse/accounts/AccountsClient.tsx (نفس النمط حرفياً).
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
    return <SharedStatusChip variant={AGING_VARIANT[aging]} label={AGING_LABELS[aging]} emphasis={aging === "D60" || aging === "D90_PLUS"} />
}

export default function CustomersClient({
    initialCustomers,
    isOwner,
}: {
    initialCustomers: CustomerRow[];
    isOwner: boolean;
}) {
    const [customers, setCustomers] = useState(initialCustomers);
    const [editing, setEditing] = useState<CustomerRow | null>(null);
    const [editForm, setEditForm] = useState({ creditLimit: "", paymentTermDays: "", openingBalance: "", priceTier: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [statementFor, setStatementFor] = useState<CustomerRow | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [availableOrgs, setAvailableOrgs] = useState<{ id: string; name: string }[] | null>(null);
    const [addForm, setAddForm] = useState({
        organizationId: "",
        creditLimit: "0",
        paymentTermDays: "0",
        openingBalance: "0",
        priceTier: "",
        notes: "",
    });
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const openAdd = async () => {
        setShowAdd(true);
        setAddError(null);
        setAddForm({ organizationId: "", creditLimit: "0", paymentTermDays: "0", openingBalance: "0", priceTier: "", notes: "" });
        if (availableOrgs === null) {
            try {
                const res = await fetch("/api/warehouse-portal/customers/available-organizations");
                const data = await res.json().catch(() => ({}));
                setAvailableOrgs(res.ok ? data.organizations : []);
            } catch (e) {
                console.error("Failed to load available organizations:", e);
                setAvailableOrgs([]);
            }
        }
    };

    const submitAdd = async () => {
        if (!addForm.organizationId) {
            setAddError("اختر صيدلية أولاً");
            return;
        }
        setAddSaving(true);
        setAddError(null);
        try {
            const res = await fetch("/api/warehouse-portal/customers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    organizationId: addForm.organizationId,
                    creditLimit: Number(addForm.creditLimit) || 0,
                    paymentTermDays: Number(addForm.paymentTermDays) || 0,
                    openingBalance: Number(addForm.openingBalance) || 0,
                    priceTier: addForm.priceTier.trim() || null,
                    notes: addForm.notes.trim() || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAddError(data.error ?? "تعذر إنشاء العميل");
                return;
            }
            const org = availableOrgs?.find((o) => o.id === addForm.organizationId);
            setCustomers((prev) => [
                {
                    customerId: data.customer.id,
                    organizationId: addForm.organizationId,
                    name: org?.name ?? addForm.organizationId,
                    orderCount: 0,
                    lastOrderDate: null,
                    creditLimit: data.customer.creditLimit,
                    paymentTermDays: data.customer.paymentTermDays,
                    openingBalance: data.customer.openingBalance,
                    priceTier: data.customer.priceTier,
                    isBlocked: false,
                    notes: data.customer.notes,
                    // عميل جديد بلا أي طلب/فاتورة بعد — outstanding = الرصيد
                    // السابق فقط بالضبط (لا مستندات مفتوحة أصلاً لتضاف إليه).
                    outstanding: data.customer.openingBalance ?? 0,
                },
                ...prev,
            ]);
            setAvailableOrgs((prev) => prev?.filter((o) => o.id !== addForm.organizationId) ?? prev);
            toast.success("أُنشئت العلاقة التجارية — يمكنك الآن ضبط شروطها");
            setShowAdd(false);
        } catch (e) {
            console.error("Failed to create customer:", e);
            setAddError("تعذر الاتصال بالسيرفر");
        } finally {
            setAddSaving(false);
        }
    };

    const openEdit = (c: CustomerRow) => {
        setEditing(c);
        setEditForm({
            creditLimit: String(c.creditLimit),
            paymentTermDays: String(c.paymentTermDays),
            openingBalance: String(c.openingBalance),
            priceTier: c.priceTier ?? "",
            notes: c.notes ?? "",
        });
        setEditError(null);
    };

    const saveEdit = async () => {
        if (!editing?.customerId) return;
        setSaving(true);
        setEditError(null);
        try {
            const res = await fetch(`/api/warehouse-portal/customers/${editing.customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    creditLimit: Number(editForm.creditLimit),
                    paymentTermDays: Number(editForm.paymentTermDays),
                    openingBalance: Number(editForm.openingBalance),
                    priceTier: editForm.priceTier.trim() || null,
                    notes: editForm.notes.trim() || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setEditError(data.error ?? "تعذر الحفظ");
                return;
            }
            setCustomers((prev) =>
                prev.map((c) =>
                    c.customerId === editing.customerId
                        ? {
                              ...c,
                              creditLimit: data.customer.creditLimit,
                              paymentTermDays: data.customer.paymentTermDays,
                              openingBalance: data.customer.openingBalance,
                              // outstanding محسوب على الخادم من مستندات + رصيد سابق
                              // قديم — لا نداء GET إضافي هنا، فنعدّله محلياً بنفس
                              // فرق الرصيد السابق فقط (المستندات المفتوحة لم تتغيّر
                              // بهذا الحفظ): يبقى outstanding صحيحاً فوراً بلا حاجة
                              // لتحديث الصفحة، وإلا بقي العمود القديم ظاهراً خطأً
                              // حتى إعادة تحميل الصفحة.
                              outstanding: c.outstanding - c.openingBalance + data.customer.openingBalance,
                              priceTier: data.customer.priceTier,
                              notes: data.customer.notes,
                          }
                        : c
                )
            );
            toast.success("تم حفظ الشروط");
            setEditing(null);
        } catch (e) {
            console.error("Failed to save customer terms:", e);
            setEditError("تعذر الاتصال بالسيرفر");
        } finally {
            setSaving(false);
        }
    };

    const toggleBlocked = async (c: CustomerRow) => {
        if (!c.customerId) return;
        if (!c.isBlocked && !confirm(`إيقاف التعامل مع «${c.name}»؟ لن تتمكن من إرسال طلبات جديدة لمذخرك.`)) return;
        try {
            const res = await fetch(`/api/warehouse-portal/customers/${c.customerId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isBlocked: !c.isBlocked }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر تغيير الحالة");
                return;
            }
            setCustomers((prev) =>
                prev.map((p) => (p.customerId === c.customerId ? { ...p, isBlocked: data.customer.isBlocked } : p))
            );
            toast.success(data.customer.isBlocked ? "تم إيقاف التعامل" : "تم استئناف التعامل");
        } catch (e) {
            console.error("Failed to toggle customer block state:", e);
            toast.error("تعذر الاتصال بالسيرفر");
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="العملاء"
                description="الصيدليات المتعاملة مع مذخرك — الذمم القائمة وشروط التعامل."
                actions={
                    isOwner && (
                        <button
                            onClick={openAdd}
                            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                        >
                            + إضافة عميل
                        </button>
                    )
                }
            />

            {customers.length === 0 ? (
                <EmptyState
                    icon="🏥"
                    title="لا توجد صيدليات متعاملة مع مذخرك بعد."
                    description={isOwner ? "أضف أول عميل لضبط شروط التعامل معه قبل استلام أي طلب." : undefined}
                    action={
                        isOwner ? (
                            <button
                                onClick={openAdd}
                                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                            >
                                + إضافة عميل
                            </button>
                        ) : undefined
                    }
                />
            ) : (
            /* max-h + overflow-auto — انظر التعليق المطابق في AccountsClient.tsx. */
            <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="sticky top-0 z-10 border-b bg-muted">
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الصيدلية</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">المتبقي عليها (الكلي)</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground" title="دَين موروث من قبل هذا النظام — مُضمَّن أصلاً داخل «المتبقي عليها»، معروض هنا فقط للتوضيح">
                                منه رصيد سابق
                            </th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">حدّ الائتمان</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">مهلة السداد</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الطلبات</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">آخر طلب</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">الحالة</th>
                            <th className="px-4 py-3 text-right font-bold text-muted-foreground">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map((c) => (
                            <tr key={c.organizationId} className="border-b transition-colors hover:bg-muted/20">
                                <td className="px-4 py-3 font-medium">{c.name}</td>
                                <td className={`tabular-nums px-4 py-3 ${c.outstanding > 0 ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                                    {money(c.outstanding)}
                                </td>
                                {/* عمود منفصل بلا لون تحذيري — جزء من المتبقي أعلاه لا
                                    رقم إضافي، فتمييزه بصرياً عن عمود "المتبقي" يمنع
                                    قراءته كدَين مضاعف. */}
                                <td className="tabular-nums px-4 py-3 text-muted-foreground">
                                    {c.openingBalance > 0 ? money(c.openingBalance) : "—"}
                                </td>
                                <td className="tabular-nums px-4 py-3 text-muted-foreground">
                                    {c.creditLimit > 0 ? money(c.creditLimit) : "بلا حد"}
                                </td>
                                <td className="tabular-nums px-4 py-3 text-muted-foreground">
                                    {c.paymentTermDays > 0 ? `${c.paymentTermDays} يوم` : "نقدي"}
                                </td>
                                <td className="tabular-nums px-4 py-3 text-muted-foreground">{c.orderCount}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString("ar-IQ") : "لم يطلب بعد"}
                                </td>
                                <td className="px-4 py-3">
                                    <SharedStatusChip
                                        variant={c.isBlocked ? "danger" : "success"}
                                        label={c.isBlocked ? "محظور" : "نشط"}
                                        bordered
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setStatementFor(c)}
                                            className="rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10"
                                        >
                                            كشف حساب
                                        </button>
                                        {/* نسخة ورقية للعميل — تقرأ دفترَي الذمم
                                            (طلبات المنصة + البيع الميداني)، بخلاف
                                            كشف الشاشة أعلاه الذي يعرض الفواتير. */}
                                        <Link
                                            href={`/warehouse/print/statement/${c.organizationId}`}
                                            title="طباعة كشف الحساب"
                                            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            <Printer className="h-3.5 w-3.5" />
                                        </Link>
                                        {isOwner && c.customerId && (
                                            <>
                                                <button
                                                    onClick={() => openEdit(c)}
                                                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                                >
                                                    تعديل الشروط
                                                </button>
                                                <button
                                                    onClick={() => toggleBlocked(c)}
                                                    className={`rounded-md px-2 py-1 text-xs ${
                                                        c.isBlocked ? "text-success hover:bg-success/10" : "text-destructive hover:bg-destructive/10"
                                                    }`}
                                                >
                                                    {c.isBlocked ? "استئناف" : "إيقاف"}
                                                </button>
                                            </>
                                        )}
                                        {isOwner && !c.customerId && (
                                            <span className="text-xs text-muted-foreground">بانتظار أول اعتماد</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            )}

            {editing && (
                <Modal open={!!editing} onClose={() => setEditing(null)} title={`شروط التعامل — ${editing.name}`} maxWidthClass="max-w-md">
                    <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">شروط التعامل — {editing.name}</h3>
                        {editError && (
                            <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
                                {editError}
                            </div>
                        )}
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">حدّ الائتمان (0 = بلا حد)</label>
                                <input
                                    value={editForm.creditLimit}
                                    onChange={(e) => setEditForm({ ...editForm, creditLimit: e.target.value })}
                                    inputMode="decimal"
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">مهلة السداد بالأيام (0 = نقدي)</label>
                                <input
                                    value={editForm.paymentTermDays}
                                    onChange={(e) => setEditForm({ ...editForm, paymentTermDays: e.target.value })}
                                    inputMode="numeric"
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                    الرصيد السابق (دَين موروث قبل هذا النظام — وليس المستحق الحالي)
                                </label>
                                <input
                                    value={editForm.openingBalance}
                                    onChange={(e) => setEditForm({ ...editForm, openingBalance: e.target.value })}
                                    inputMode="decimal"
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                    مبلغ ثابت يُدخَل يدوياً مرة واحدة عند الإعداد — لا يُحسَب من فواتير هذا
                                    النظام ولا يتغيّر تلقائياً معها. لو سجَّلت هذا الدَين لاحقاً كفاتورة
                                    حقيقية هنا، خفِّض هذا الرقم يدوياً بنفس القيمة حتى لا يُحسَب مرتين.
                                </p>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">شريحة التسعير (اختياري)</label>
                                <input
                                    value={editForm.priceTier}
                                    onChange={(e) => setEditForm({ ...editForm, priceTier: e.target.value })}
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">ملاحظات</label>
                                <textarea
                                    value={editForm.notes}
                                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                    rows={2}
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setEditing(null)} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                                إلغاء
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving ? "جارٍ الحفظ…" : "حفظ"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {statementFor && <StatementModal customer={statementFor} isOwner={isOwner} onClose={() => setStatementFor(null)} />}

            {showAdd && (
                <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة عميل جديد" maxWidthClass="max-w-md">
                    <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">إضافة عميل جديد</h3>
                        <p className="mb-3 text-xs text-muted-foreground">
                            اتفق على شروط التعامل مع صيدلية قبل أن تُرسل أول طلب لها.
                        </p>
                        {addError && (
                            <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
                                {addError}
                            </div>
                        )}
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">الصيدلية *</label>
                                {availableOrgs === null ? (
                                    <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>
                                ) : availableOrgs.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">
                                        لا توجد صيدليات جديدة — كل الصيدليات على المنصة لديها بالفعل علاقة تجارية مع مذخرك.
                                    </div>
                                ) : (
                                    <select
                                        value={addForm.organizationId}
                                        onChange={(e) => setAddForm({ ...addForm, organizationId: e.target.value })}
                                        className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                    >
                                        <option value="">اختر صيدلية…</option>
                                        {availableOrgs.map((o) => (
                                            <option key={o.id} value={o.id}>
                                                {o.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">حدّ الائتمان (0 = بلا حد)</label>
                                <input
                                    value={addForm.creditLimit}
                                    onChange={(e) => setAddForm({ ...addForm, creditLimit: e.target.value })}
                                    inputMode="decimal"
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">مهلة السداد بالأيام (0 = نقدي)</label>
                                <input
                                    value={addForm.paymentTermDays}
                                    onChange={(e) => setAddForm({ ...addForm, paymentTermDays: e.target.value })}
                                    inputMode="numeric"
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                    الرصيد السابق (دَين موروث قبل هذا النظام، 0 = لا يوجد)
                                </label>
                                <input
                                    value={addForm.openingBalance}
                                    onChange={(e) => setAddForm({ ...addForm, openingBalance: e.target.value })}
                                    inputMode="decimal"
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                    إن كانت لهذه الصيدلية ديون سابقة من قبل انضمام مذخرك للمنصة (نظام
                                    ورقي/إكسل/برنامج آخر)، سجّلها هنا مرة واحدة. تُضاف فوق أي فواتير
                                    تُنشأ لاحقاً على هذا النظام ولا تُستبدَل بها أبداً.
                                </p>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">شريحة التسعير (اختياري)</label>
                                <input
                                    value={addForm.priceTier}
                                    onChange={(e) => setAddForm({ ...addForm, priceTier: e.target.value })}
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">ملاحظات</label>
                                <textarea
                                    value={addForm.notes}
                                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                                    rows={2}
                                    className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setShowAdd(false)} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                                إلغاء
                            </button>
                            <button
                                onClick={submitAdd}
                                disabled={addSaving || !addForm.organizationId}
                                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {addSaving ? "جارٍ الحفظ…" : "إضافة"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function StatementModal({
    customer,
    isOwner,
    onClose,
}: {
    customer: CustomerRow;
    isOwner: boolean;
    onClose: () => void;
}) {
    const paymentKey = useRef(crypto.randomUUID());
    const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [payments, setPayments] = useState<Record<string, PaymentRow[]>>({});
    const [payingId, setPayingId] = useState<string | null>(null);
    const [payForm, setPayForm] = useState({ amount: "", method: "CASH", reference: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/warehouse-portal/invoices?organizationId=${customer.organizationId}`);
                const data = await res.json().catch(() => ({}));
                if (!cancelled) setInvoices(res.ok ? data.invoices : []);
            } catch (e) {
                console.error("Failed to load statement invoices:", e);
                if (!cancelled) setInvoices([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [customer.organizationId]);

    const toggleExpand = async (invId: string) => {
        if (expandedId === invId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(invId);
        if (!payments[invId]) {
            try {
                const res = await fetch(`/api/warehouse-portal/invoices/${invId}`);
                const data = await res.json().catch(() => ({}));
                if (res.ok) setPayments((prev) => ({ ...prev, [invId]: data.invoice.payments }));
            } catch (e) {
                console.error("Failed to load invoice payments:", e);
            }
        }
    };

    const openPay = (invId: string) => {
        setPayingId(invId);
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
                (prev ?? []).map((inv) =>
                    inv.id === payingId
                        ? {
                              ...inv,
                              paidAmount: data.invoice.paidAmount,
                              status: data.invoice.status,
                              remaining: Math.max(data.invoice.total - data.invoice.paidAmount, 0),
                              paymentsCount: inv.paymentsCount + 1,
                          }
                        : inv
                )
            );
            setPayments((prev) => ({ ...prev, [payingId]: [data.payment, ...(prev[payingId] ?? [])] }));
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
        <Modal open onClose={onClose} title={`كشف حساب — ${customer.name}`} maxWidthClass="max-w-3xl">
            <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg border bg-card p-5 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-bold">كشف حساب — {customer.name}</h3>
                    <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">
                        إغلاق
                    </button>
                </div>

                {loading && <LoadingBlock />}

                {!loading && invoices && invoices.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">لا توجد فواتير لهذه الصيدلية بعد.</div>
                )}

                {!loading && invoices && invoices.length > 0 && (
                    <div className="space-y-2">
                        {invoices.map((inv) => (
                            <div key={inv.id} className="rounded-lg border">
                                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                                    <div>
                                        <button
                                            onClick={() => toggleExpand(inv.id)}
                                            className="font-mono text-xs text-primary hover:underline"
                                            dir="ltr"
                                        >
                                            {inv.invoiceNumber}
                                        </button>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            صدرت {new Date(inv.issuedAt).toLocaleDateString("ar-IQ")}
                                            {inv.dueAt && <> — تستحق {new Date(inv.dueAt).toLocaleDateString("ar-IQ")}</>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StatusChip status={inv.status} />
                                        {inv.status !== "PAID" && inv.status !== "CANCELLED" && <AgingChip aging={inv.aging} />}
                                    </div>
                                    <div className="tabular-nums text-left text-sm">
                                        <div>الإجمالي: {money(inv.total)}</div>
                                        <div className="text-muted-foreground">المسدَّد: {money(inv.paidAmount)}</div>
                                        <div className={inv.remaining > 0 ? "font-bold text-destructive" : "text-success"}>
                                            المتبقي: {money(inv.remaining)}
                                        </div>
                                    </div>
                                    {isOwner && inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                                        <button
                                            onClick={() => openPay(inv.id)}
                                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                                        >
                                            تسجيل دفعة
                                        </button>
                                    )}
                                </div>

                                {expandedId === inv.id && (
                                    <div className="border-t bg-muted/20 p-3">
                                        {!payments[inv.id] && <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>}
                                        {payments[inv.id] && payments[inv.id].length === 0 && (
                                            <div className="text-xs text-muted-foreground">لا توجد دفعات مسجَّلة بعد.</div>
                                        )}
                                        {payments[inv.id] && payments[inv.id].length > 0 && (
                                            <ul className="space-y-1 text-xs">
                                                {payments[inv.id].map((p) => (
                                                    <li key={p.id} className="flex justify-between">
                                                        <span>
                                                            {money(p.amount)} — {p.method} {p.reference ? `(${p.reference})` : ""}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            {new Date(p.receivedAt).toLocaleString("ar-IQ")}{" "}
                                                            {p.actorName ? `· ${p.actorName}` : ""}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
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
        </Modal>
    );
}
