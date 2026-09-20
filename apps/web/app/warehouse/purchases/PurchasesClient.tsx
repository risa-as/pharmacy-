"use client";

// مشتريات المذخر وذممه الدائنة: العميل التفاعلي لصفحة «المشتريات» — إدارة
// الموردين، تسجيل فواتير شراء جديدة (تُنشئ دفعات مخزون مباشرة)، وتسجيل دفعات
// سداد للموردين. نفس أسلوب app/warehouse/accounts/AccountsClient.tsx حرفياً
// بالاتجاه المعاكس (بطاقات ذمم + شريط تقادم + جدول + نافذة دفعة)، زائداً
// قسمَي إدارة الموردين وإنشاء فاتورة شراء ببنود متعددة.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import SharedStatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";
import Modal from "@/app/warehouse/_components/Modal";

type AgingBucket = "CURRENT" | "D30" | "D60" | "D90" | "D90_PLUS";
type PurchaseStatus = "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";

interface SupplierRow {
    id: string;
    name: string;
    phone: string | null;
    contactPerson: string | null;
    notes: string | null;
    isActive: boolean;
}

interface PurchaseRow {
    id: string;
    supplierId: string;
    supplierName: string;
    invoiceNumber: string;
    total: number;
    paidAmount: number;
    remaining: number;
    status: PurchaseStatus;
    issuedAt: string;
    dueAt: string | null;
    aging: AgingBucket;
    itemsCount: number;
    paymentsCount: number;
}

interface PayablesSummary {
    outstanding: number;
    overdue: number;
    byBucket: Record<AgingBucket, number>;
}

/** مُطابِق لما يعيده GET /api/warehouse-portal/purchases/[id]. */
interface PurchaseDetail {
    id: string;
    supplierName: string;
    invoiceNumber: string;
    total: number;
    paidAmount: number;
    remaining: number;
    status: PurchaseStatus;
    issuedAt: string;
    dueAt: string | null;
    notes: string | null;
    items: Array<{
        id: string;
        tradeName: string;
        barcode: string;
        batchNumber: string;
        expiryDate: string;
        quantity: number;
        bonusQuantity: number;
        unitCost: number;
        lineTotal: number;
    }>;
    payments: Array<{
        id: string;
        amount: number;
        method: string;
        reference: string | null;
        paidAt: string;
    }>;
    /** يحسبه الخادم: لا دفعة سداد، وكل دفعة مخزون سليمة. */
    cancellable: boolean;
    /** أسباب المنع بنصّها — تُعرض كما جاءت لأنها تسمّي الدفعة والكمية. */
    cancelBlockers: string[];
}

interface CatalogSearchItem {
    id: string;
    barcode: string;
    drug: { tradeName: string; scientificName: string | null };
}

const money = (n: number) => n.toLocaleString("ar-IQ", { maximumFractionDigits: 2 });

const STATUS_VARIANT: Record<PurchaseStatus, StatusChipVariant> = {
    UNPAID: "danger",
    PARTIAL: "warning",
    PAID: "success",
    CANCELLED: "neutral",
};
const STATUS_LABELS: Record<PurchaseStatus, string> = {
    UNPAID: "غير مسدَّدة",
    PARTIAL: "جزئية",
    PAID: "مسدَّدة",
    CANCELLED: "ملغاة",
};

function StatusChip({ status }: { status: PurchaseStatus }) {
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
    return (
        <SharedStatusChip
            variant={AGING_VARIANT[aging]}
            label={AGING_LABELS[aging]}
            emphasis={aging === "D60" || aging === "D90_PLUS"}
        />
    );
}

interface DraftLine {
    key: number;
    catalogItemId: string;
    label: string; // اسم الصنف المعروض (تجاري — باركود)
    batchNumber: string;
    expiryDate: string;
    quantity: string;
    unitCost: string;
    bonusQuantity: string;
}

let lineKeySeq = 0;
function emptyLine(): DraftLine {
    return {
        key: ++lineKeySeq,
        catalogItemId: "",
        label: "",
        batchNumber: "",
        expiryDate: "",
        quantity: "",
        unitCost: "",
        bonusQuantity: "0",
    };
}

export default function PurchasesClient({
    initialSuppliers,
    initialPurchases,
    initialSummary,
    canCreatePurchase,
    canPaySupplier,
}: {
    initialSuppliers: SupplierRow[];
    initialPurchases: PurchaseRow[];
    initialSummary: PayablesSummary;
    canCreatePurchase: boolean;
    canPaySupplier: boolean;
}) {
    const [suppliers, setSuppliers] = useState(initialSuppliers);
    const [purchases, setPurchases] = useState(initialPurchases);
    const [summary, setSummary] = useState(initialSummary);

    const [statusFilter, setStatusFilter] = useState<"ALL" | PurchaseStatus>("ALL");
    const [search, setSearch] = useState("");

    // ── نافذة مورّد جديد ──────────────────────────────────────────────────
    const [supplierModalOpen, setSupplierModalOpen] = useState(false);
    const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", contactPerson: "", notes: "" });
    const [supplierSaving, setSupplierSaving] = useState(false);
    const [supplierError, setSupplierError] = useState<string | null>(null);

    const submitSupplier = async () => {
        if (!supplierForm.name.trim()) return;
        setSupplierSaving(true);
        setSupplierError(null);
        try {
            const res = await fetch("/api/warehouse-portal/suppliers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: supplierForm.name.trim(),
                    phone: supplierForm.phone.trim() || undefined,
                    contactPerson: supplierForm.contactPerson.trim() || undefined,
                    notes: supplierForm.notes.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSupplierError(data.error ?? "تعذر إنشاء المورّد");
                return;
            }
            setSuppliers((prev) => [...prev, data.supplier].sort((a, b) => a.name.localeCompare(b.name, "ar")));
            toast.success("تم إضافة المورّد");
            setSupplierModalOpen(false);
            setSupplierForm({ name: "", phone: "", contactPerson: "", notes: "" });
        } catch (e) {
            console.error("Failed to create supplier:", e);
            setSupplierError("تعذر الاتصال بالسيرفر");
        } finally {
            setSupplierSaving(false);
        }
    };

    const toggleSupplierActive = async (supplier: SupplierRow) => {
        try {
            const res = await fetch(`/api/warehouse-portal/suppliers/${supplier.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !supplier.isActive }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر تحديث حالة المورّد");
                return;
            }
            setSuppliers((prev) => prev.map((s) => (s.id === supplier.id ? { ...s, isActive: data.supplier.isActive } : s)));
        } catch (e) {
            console.error("Failed to toggle supplier:", e);
            toast.error("تعذر الاتصال بالسيرفر");
        }
    };

    // حذف مورّد أُضيف بالخطأ. الخادم هو الحاكم: يرفض الحذف إن كان للمورّد أي
    // فاتورة أو دفعة (409 + SUPPLIER_HAS_HISTORY) ويوجّه للإيقاف — فلا يُكرَّر
    // ذلك الفحص هنا، والرسالة تُعرض كما جاءت لأنها تسمّي العدد والسبب.
    const [deletingSupplierId, setDeletingSupplierId] = useState<string | null>(null);
    const deleteSupplier = async (supplier: SupplierRow) => {
        if (!confirm(`حذف المورّد «${supplier.name}» نهائياً؟ لا يمكن التراجع.`)) return;
        setDeletingSupplierId(supplier.id);
        try {
            const res = await fetch(`/api/warehouse-portal/suppliers/${supplier.id}`, {
                method: "DELETE",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر حذف المورّد");
                return;
            }
            setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
            toast.success(`حُذف المورّد «${supplier.name}»`);
        } catch (e) {
            console.error("Failed to delete supplier:", e);
            toast.error("تعذر الاتصال بالسيرفر");
        } finally {
            setDeletingSupplierId(null);
        }
    };

    // ── تفصيل فاتورة شراء وإلغاؤها ─────────────────────────────────────────
    // كل شيء يأتي من GET /purchases/[id]: البنود والدفعات و cancellable
    // و cancelBlockers. لا تُستنتَج قابلية الإلغاء في الواجهة — شرطها أن تكون
    // كل دفعة مخزون أنشأتها الفاتورة سليمة، وهذا لا يُعرَف إلا من الخادم.
    const [detail, setDetail] = useState<PurchaseDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const openDetail = async (purchaseId: string) => {
        setDetailLoading(true);
        setDetail(null);
        try {
            const res = await fetch(`/api/warehouse-portal/purchases/${purchaseId}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر جلب تفاصيل الفاتورة");
                return;
            }
            setDetail(data.purchase);
        } catch (e) {
            console.error("Failed to load purchase detail:", e);
            toast.error("تعذر الاتصال بالسيرفر");
        } finally {
            setDetailLoading(false);
        }
    };

    const cancelPurchase = async () => {
        if (!detail) return;
        if (!confirm(
            `إلغاء فاتورة «${detail.invoiceNumber}»؟ ستُسحب كل دفعات المخزون التي أنشأتها. لا يمكن التراجع.`
        )) return;
        setCancelling(true);
        try {
            const res = await fetch(`/api/warehouse-portal/purchases/${detail.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "CANCELLED" }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error ?? "تعذر إلغاء الفاتورة");
                return;
            }
            setPurchases((prev) =>
                prev.map((p) => (p.id === detail.id ? { ...p, status: "CANCELLED", remaining: 0 } : p))
            );
            toast.success(`أُلغيت الفاتورة وسُحبت ${data.reversedBatches ?? 0} دفعة مخزون`);
            setDetail(null);
        } catch (e) {
            console.error("Failed to cancel purchase:", e);
            toast.error("تعذر الاتصال بالسيرفر");
        } finally {
            setCancelling(false);
        }
    };

    // ── نافذة فاتورة شراء جديدة ───────────────────────────────────────────
    const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
    const [purchaseForm, setPurchaseForm] = useState({
        supplierId: "",
        invoiceNumber: "",
        issuedAt: new Date().toISOString().slice(0, 10),
        paymentTermDays: "0",
        notes: "",
    });
    const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
    const [itemQuery, setItemQuery] = useState("");
    const [itemResults, setItemResults] = useState<CatalogSearchItem[]>([]);
    const [itemSearching, setItemSearching] = useState(false);
    const [purchaseSaving, setPurchaseSaving] = useState(false);
    const [purchaseError, setPurchaseError] = useState<string | null>(null);
    const [purchaseErrors, setPurchaseErrors] = useState<string[]>([]);
    const [activeLineKey, setActiveLineKey] = useState<number | null>(null);

    const openPurchaseModal = () => {
        setPurchaseForm({
            supplierId: suppliers.find((s) => s.isActive)?.id ?? "",
            invoiceNumber: "",
            issuedAt: new Date().toISOString().slice(0, 10),
            paymentTermDays: "0",
            notes: "",
        });
        setLines([emptyLine()]);
        setPurchaseError(null);
        setPurchaseErrors([]);
        setItemQuery("");
        setItemResults([]);
        setPurchaseModalOpen(true);
    };

    const searchCatalog = async (q: string) => {
        setItemQuery(q);
        if (!q.trim()) {
            setItemResults([]);
            return;
        }
        setItemSearching(true);
        try {
            const res = await fetch(`/api/warehouse-portal/catalog?search=${encodeURIComponent(q.trim())}`);
            const data = await res.json().catch(() => ({}));
            if (res.ok) setItemResults(data.items ?? []);
        } catch (e) {
            console.error("Failed to search catalog:", e);
        } finally {
            setItemSearching(false);
        }
    };

    const pickItemForLine = (lineKey: number, item: CatalogSearchItem) => {
        setLines((prev) =>
            prev.map((l) =>
                l.key === lineKey
                    ? { ...l, catalogItemId: item.id, label: `${item.drug.tradeName} — ${item.barcode}` }
                    : l
            )
        );
        setActiveLineKey(null);
        setItemQuery("");
        setItemResults([]);
    };

    const updateLine = (key: number, patch: Partial<DraftLine>) => {
        setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    };

    const addLine = () => setLines((prev) => [...prev, emptyLine()]);
    const removeLine = (key: number) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

    // معاينة عميل فقط — نفس صيغة computePurchaseTotal في
    // app/lib/warehouse-purchases.ts (كمية × كلفة، بلا بونص)؛ الإجمالي
    // الحقيقي المعتمَد يُحسَب على الخادم دائماً من نفس الدالة، لا من هذا الرقم.
    const previewTotal = useMemo(() => {
        return lines.reduce((sum, l) => {
            const qty = Number(l.quantity) || 0;
            const cost = Number(l.unitCost) || 0;
            return sum + qty * cost;
        }, 0);
    }, [lines]);

    const refreshSummary = async () => {
        try {
            const res = await fetch("/api/warehouse-portal/purchases/summary");
            const data = await res.json().catch(() => null);
            if (res.ok && data) setSummary(data);
        } catch (e) {
            console.error("Failed to refresh payables summary:", e);
        }
    };

    const submitPurchase = async () => {
        setPurchaseSaving(true);
        setPurchaseError(null);
        setPurchaseErrors([]);
        try {
            const res = await fetch("/api/warehouse-portal/purchases", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    supplierId: purchaseForm.supplierId,
                    invoiceNumber: purchaseForm.invoiceNumber.trim(),
                    issuedAt: purchaseForm.issuedAt ? new Date(purchaseForm.issuedAt).toISOString() : undefined,
                    paymentTermDays: Number(purchaseForm.paymentTermDays) || 0,
                    notes: purchaseForm.notes.trim() || undefined,
                    lines: lines.map((l) => ({
                        catalogItemId: l.catalogItemId,
                        batchNumber: l.batchNumber.trim(),
                        expiryDate: l.expiryDate ? new Date(l.expiryDate).toISOString() : undefined,
                        quantity: Number(l.quantity),
                        unitCost: Number(l.unitCost),
                        bonusQuantity: Number(l.bonusQuantity) || 0,
                    })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPurchaseError(data.error ?? "تعذر تسجيل فاتورة الشراء");
                setPurchaseErrors(Array.isArray(data.errors) ? data.errors : []);
                return;
            }
            const supplierName = suppliers.find((s) => s.id === data.purchase.supplierId)?.name ?? data.purchase.supplier?.name ?? "";
            const newRow: PurchaseRow = {
                id: data.purchase.id,
                supplierId: data.purchase.supplierId,
                supplierName,
                invoiceNumber: data.purchase.invoiceNumber,
                total: data.purchase.total,
                paidAmount: data.purchase.paidAmount,
                remaining: Math.max(data.purchase.total - data.purchase.paidAmount, 0),
                status: data.purchase.status,
                issuedAt: data.purchase.issuedAt,
                dueAt: data.purchase.dueAt,
                // CURRENT مضمونة صحيحة هنا تحديداً (لا حساب مستقل موازٍ
                // لـ agingBucket): فاتورة أُنشئت اللحظة نفسها لا يمكن أن
                // تكون متأخرة — dueAt إما null (نقدي) أو تاريخ مستقبلي دائماً
                // (computeDueDate يضيف الأيام على issuedAt الآن)، وكلاهما
                // يُصنَّف CURRENT في agingBucket. الصف يُستبدَل بقراءة فعلية
                // من الخادم عند أي إعادة تحميل للصفحة.
                aging: "CURRENT",
                itemsCount: data.purchase.items?.length ?? lines.length,
                paymentsCount: 0,
            };
            setPurchases((prev) => [newRow, ...prev]);
            void refreshSummary();
            toast.success("تم تسجيل فاتورة الشراء وإضافة الدفعات إلى المخزون");
            setPurchaseModalOpen(false);
        } catch (e) {
            console.error("Failed to submit purchase:", e);
            setPurchaseError("تعذر الاتصال بالسيرفر");
        } finally {
            setPurchaseSaving(false);
        }
    };

    const purchaseFormValid =
        !!purchaseForm.supplierId &&
        !!purchaseForm.invoiceNumber.trim() &&
        lines.every((l) => l.catalogItemId && l.batchNumber.trim() && l.expiryDate && l.quantity && l.unitCost !== "");

    // ── نافذة تسجيل دفعة لمورّد ───────────────────────────────────────────
    const [payingId, setPayingId] = useState<string | null>(null);
    const [payForm, setPayForm] = useState({ amount: "", method: "CASH", reference: "", notes: "" });
    const [paySaving, setPaySaving] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);

    const openPay = (p: PurchaseRow) => {
        setPayingId(p.id);
        setPayForm({ amount: "", method: "CASH", reference: "", notes: "" });
        setPayError(null);
    };

    const submitPayment = async () => {
        if (!payingId) return;
        setPaySaving(true);
        setPayError(null);
        try {
            const res = await fetch(`/api/warehouse-portal/purchases/${payingId}/payments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount: Number(payForm.amount),
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
            setPurchases((prev) =>
                prev.map((p) =>
                    p.id === payingId
                        ? {
                              ...p,
                              paidAmount: data.purchase.paidAmount,
                              status: data.purchase.status as PurchaseStatus,
                              remaining: Math.max(data.purchase.total - data.purchase.paidAmount, 0),
                              paymentsCount: p.paymentsCount + 1,
                          }
                        : p
                )
            );
            void refreshSummary();
            toast.success("تم تسجيل الدفعة للمورّد");
            setPayingId(null);
        } catch (e) {
            console.error("Failed to submit supplier payment:", e);
            setPayError("تعذر الاتصال بالسيرفر");
        } finally {
            setPaySaving(false);
        }
    };

    const filtered = useMemo(() => {
        return purchases.filter((p) => {
            if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
            if (search.trim()) {
                const q = search.trim().toLowerCase();
                if (!p.supplierName.toLowerCase().includes(q) && !p.invoiceNumber.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [purchases, statusFilter, search]);

    const bucketTotal = Object.values(summary.byBucket).reduce((a, b) => a + b, 0);

    const STATUS_FILTERS: Array<{ key: "ALL" | PurchaseStatus; label: string }> = [
        { key: "ALL", label: "الكل" },
        { key: "UNPAID", label: "غير مسدَّدة" },
        { key: "PARTIAL", label: "جزئية" },
        { key: "PAID", label: "مسدَّدة" },
        { key: "CANCELLED", label: "ملغاة" },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="المشتريات"
                description="فواتير الشراء من الموردين، وذمم المذخر الدائنة تجاههم."
                actions={
                    canCreatePurchase ? (
                        <>
                            <button
                                onClick={() => setSupplierModalOpen(true)}
                                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
                            >
                                + مورّد جديد
                            </button>
                            <button
                                onClick={openPurchaseModal}
                                disabled={suppliers.length === 0}
                                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                title={suppliers.length === 0 ? "أضف مورّداً أولاً" : undefined}
                            >
                                + فاتورة شراء جديدة
                            </button>
                        </>
                    ) : undefined
                }
            />

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="text-xs font-medium text-muted-foreground">إجمالي الذمم الدائنة القائمة</div>
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
                    <div className="text-sm text-muted-foreground">لا توجد ذمم دائنة قائمة حالياً.</div>
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

            {/* الموردون */}
            <div className="rounded-lg border bg-card shadow-sm">
                <div className="border-b px-4 py-3 text-sm font-bold">الموردون ({suppliers.length})</div>
                {suppliers.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground">لا يوجد موردون بعد.</div>
                ) : (
                    <div className="max-h-64 overflow-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="sticky top-0 z-10 border-b bg-muted">
                                    <th className="px-4 py-2 text-right font-bold text-muted-foreground">الاسم</th>
                                    <th className="px-4 py-2 text-right font-bold text-muted-foreground">الهاتف</th>
                                    <th className="px-4 py-2 text-right font-bold text-muted-foreground">جهة الاتصال</th>
                                    <th className="px-4 py-2 text-right font-bold text-muted-foreground">الحالة</th>
                                    {canCreatePurchase && <th className="px-4 py-2 text-right font-bold text-muted-foreground">إجراءات</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {suppliers.map((s) => (
                                    <tr key={s.id} className="border-b last:border-0">
                                        <td className="px-4 py-2 font-medium">{s.name}</td>
                                        <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                                            {s.phone ?? "—"}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">{s.contactPerson ?? "—"}</td>
                                        <td className="px-4 py-2">
                                            <SharedStatusChip
                                                variant={s.isActive ? "success" : "neutral"}
                                                label={s.isActive ? "فعّال" : "موقوف"}
                                            />
                                        </td>
                                        {canCreatePurchase && (
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => toggleSupplierActive(s)}
                                                        className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted"
                                                    >
                                                        {s.isActive ? "إيقاف" : "تفعيل"}
                                                    </button>
                                                    {/* الحذف للمورّد المُضاف بالخطأ فقط — الخادم
                                                        يرفضه إن كان له أي فاتورة أو دفعة ويوجّه
                                                        للإيقاف، فلا حاجة لإخفاء الزرّ هنا. */}
                                                    <button
                                                        onClick={() => deleteSupplier(s)}
                                                        disabled={deletingSupplierId === s.id}
                                                        className="rounded-lg border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                                    >
                                                        {deletingSupplierId === s.id ? "..." : "حذف"}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* فواتير الشراء */}
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
                    placeholder="بحث باسم المورّد أو رقم الفاتورة…"
                    className="mr-auto w-64 rounded-lg border bg-muted px-3 py-1.5 text-sm"
                />
            </div>

            {purchases.length === 0 ? (
                <EmptyState
                    icon="🧾"
                    title="لا توجد فواتير شراء بعد"
                    description="سجّل أول فاتورة شراء من مورّد لإضافتها إلى المخزون مباشرة."
                />
            ) : (
                <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="sticky top-0 z-10 border-b bg-muted">
                                <th className="px-4 py-3 text-right font-bold text-muted-foreground">رقم الفاتورة</th>
                                <th className="px-4 py-3 text-right font-bold text-muted-foreground">المورّد</th>
                                <th className="px-4 py-3 text-right font-bold text-muted-foreground">البنود</th>
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
                            {filtered.map((p) => (
                                <tr key={p.id} className="border-b transition-colors hover:bg-muted/20">
                                    <td className="px-4 py-3">
                                        <code className="font-mono text-xs" dir="ltr">
                                            {p.invoiceNumber}
                                        </code>
                                    </td>
                                    <td className="px-4 py-3 font-medium">{p.supplierName}</td>
                                    <td className="tabular-nums px-4 py-3 text-muted-foreground">{p.itemsCount}</td>
                                    <td className="tabular-nums px-4 py-3 text-muted-foreground">{money(p.total)}</td>
                                    <td className="tabular-nums px-4 py-3 text-muted-foreground">{money(p.paidAmount)}</td>
                                    <td className={`tabular-nums px-4 py-3 ${p.remaining > 0 ? "font-bold text-destructive" : "text-success"}`}>
                                        {money(p.remaining)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusChip status={p.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        {p.status !== "PAID" && p.status !== "CANCELLED" ? (
                                            <AgingChip aging={p.aging} />
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {p.dueAt ? new Date(p.dueAt).toLocaleDateString("ar-IQ") : "نقدي"}
                                    </td>
                                    <td className="px-4 py-3">
                                        {/* فاتورة بونص كامل إجماليها صفر تبقى UNPAID (computeInvoiceStatus
                                            يفحص المدفوع قبل الإجمالي) — فلا يُعرض زر دفع
                                            يرفضه applyPayment حتماً بـ«المتبقي: 0.00». نقيس
                                            المتبقي لا الحالة. */}
                                        <div className="flex items-center gap-1.5">
                                            {canPaySupplier &&
                                                p.status !== "PAID" &&
                                                p.status !== "CANCELLED" &&
                                                p.total - p.paidAmount > 0.01 && (
                                                <button
                                                    onClick={() => openPay(p)}
                                                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                                                >
                                                    تسجيل دفعة
                                                </button>
                                            )}
                                            {/* التفصيل يجلب البنود والدفعات وقابلية
                                                الإلغاء وأسبابها من الخادم — لا يُحسب
                                                أيٌّ منها هنا. */}
                                            <button
                                                onClick={() => openDetail(p.id)}
                                                className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted"
                                            >
                                                تفصيل
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                                        لا توجد فواتير مطابقة لهذا الفلتر/البحث.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* نافذة مورّد جديد */}
            {supplierModalOpen && (
                <Modal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)} title="مورّد جديد" maxWidthClass="max-w-sm">
                    <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">مورّد جديد</h3>
                        {supplierError && (
                            <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
                                {supplierError}
                            </div>
                        )}
                        <div className="space-y-3">
                            <input
                                value={supplierForm.name}
                                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                                placeholder="اسم المورّد *"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={supplierForm.phone}
                                onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                                placeholder="الهاتف (اختياري)"
                                dir="ltr"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={supplierForm.contactPerson}
                                onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                                placeholder="جهة الاتصال (اختياري)"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={supplierForm.notes}
                                onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                                placeholder="ملاحظات (اختياري)"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setSupplierModalOpen(false)} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                                إلغاء
                            </button>
                            <button
                                onClick={submitSupplier}
                                disabled={supplierSaving || !supplierForm.name.trim()}
                                className="rounded-lg bg-success px-4 py-2 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                            >
                                {supplierSaving ? "جارٍ الحفظ…" : "إضافة"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* نافذة فاتورة شراء جديدة */}
            {purchaseModalOpen && (
                <Modal open={purchaseModalOpen} onClose={() => setPurchaseModalOpen(false)} title="فاتورة شراء جديدة" maxWidthClass="max-w-3xl">
                    <div className="w-full max-w-3xl rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">فاتورة شراء جديدة</h3>
                        {purchaseError && (
                            <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
                                {purchaseError}
                                {purchaseErrors.length > 0 && (
                                    <ul className="mt-1 list-inside list-disc">
                                        {purchaseErrors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <select
                                value={purchaseForm.supplierId}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            >
                                <option value="">اختر المورّد *</option>
                                {suppliers
                                    .filter((s) => s.isActive)
                                    .map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                            </select>
                            <input
                                value={purchaseForm.invoiceNumber}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                                placeholder="رقم فاتورة المورّد *"
                                dir="ltr"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                تاريخ الفاتورة
                                <input
                                    type="date"
                                    value={purchaseForm.issuedAt}
                                    onChange={(e) => setPurchaseForm({ ...purchaseForm, issuedAt: e.target.value })}
                                    className="flex-1 rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                مهلة السداد (أيام، 0 = نقدي)
                                <input
                                    type="number"
                                    min={0}
                                    value={purchaseForm.paymentTermDays}
                                    onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentTermDays: e.target.value })}
                                    className="flex-1 rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                            </label>
                        </div>
                        <input
                            value={purchaseForm.notes}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                            placeholder="ملاحظات (اختياري)"
                            className="mt-3 w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                        />

                        <div className="mt-4 space-y-3">
                            <div className="text-sm font-bold">بنود الفاتورة</div>
                            {lines.map((line) => (
                                <div key={line.key} className="rounded-lg border p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                value={activeLineKey === line.key ? itemQuery : line.label}
                                                onFocus={() => {
                                                    setActiveLineKey(line.key);
                                                    setItemQuery("");
                                                    setItemResults([]);
                                                }}
                                                onChange={(e) => searchCatalog(e.target.value)}
                                                placeholder="ابحث عن صنف بالاسم أو الباركود *"
                                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                            />
                                            {activeLineKey === line.key && itemResults.length > 0 && (
                                                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-card shadow-lg">
                                                    {itemResults.map((item) => (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => pickItemForLine(line.key, item)}
                                                            className="block w-full px-3 py-2 text-right text-sm hover:bg-muted"
                                                        >
                                                            {item.drug.tradeName}{" "}
                                                            <span className="text-xs text-muted-foreground" dir="ltr">
                                                                {item.barcode}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {activeLineKey === line.key && itemSearching && (
                                                <div className="absolute z-20 mt-1 w-full rounded-lg border bg-card p-2 text-xs text-muted-foreground shadow-lg">
                                                    جارٍ البحث…
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => removeLine(line.key)}
                                            disabled={lines.length === 1}
                                            className="rounded-lg border px-2.5 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
                                        >
                                            حذف
                                        </button>
                                    </div>

                                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                        <input
                                            value={line.batchNumber}
                                            onChange={(e) => updateLine(line.key, { batchNumber: e.target.value })}
                                            placeholder="رقم الدفعة *"
                                            className="rounded-lg border bg-muted px-2 py-1.5 text-xs"
                                        />
                                        <input
                                            type="date"
                                            value={line.expiryDate}
                                            onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                                            className="rounded-lg border bg-muted px-2 py-1.5 text-xs"
                                        />
                                        <input
                                            value={line.quantity}
                                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                                            placeholder="الكمية *"
                                            inputMode="numeric"
                                            className="rounded-lg border bg-muted px-2 py-1.5 text-xs"
                                        />
                                        <input
                                            value={line.unitCost}
                                            onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                                            placeholder="كلفة الوحدة *"
                                            inputMode="decimal"
                                            className="rounded-lg border bg-muted px-2 py-1.5 text-xs"
                                        />
                                        <input
                                            value={line.bonusQuantity}
                                            onChange={(e) => updateLine(line.key, { bonusQuantity: e.target.value })}
                                            placeholder="بونص (وحدات مجانية)"
                                            inputMode="numeric"
                                            className="rounded-lg border bg-muted px-2 py-1.5 text-xs"
                                        />
                                    </div>
                                </div>
                            ))}
                            <button onClick={addLine} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">
                                + إضافة بند
                            </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t pt-3">
                            <div className="text-sm">
                                الإجمالي (تقديري — يُحسَب نهائياً على الخادم):{" "}
                                <span className="tabular-nums font-bold">{money(previewTotal)}</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setPurchaseModalOpen(false)} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                                    إلغاء
                                </button>
                                <button
                                    onClick={submitPurchase}
                                    disabled={purchaseSaving || !purchaseFormValid}
                                    className="rounded-lg bg-success px-4 py-2 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                                >
                                    {purchaseSaving ? "جارٍ الحفظ…" : "تسجيل الفاتورة"}
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* نافذة تفصيل فاتورة شراء وإلغائها — مستقلة عن نافذة الدفعة أدناه */}
                <Modal
                    open={detailLoading || !!detail}
                    onClose={() => setDetail(null)}
                    title={detail ? `فاتورة ${detail.invoiceNumber}` : "جارٍ التحميل…"}
                    maxWidthClass="max-w-3xl"
                >
                    {detailLoading || !detail ? (
                        <p className="p-4 text-center text-sm text-muted-foreground">جارٍ جلب التفاصيل…</p>
                    ) : (
                        <div className="space-y-4">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                                {[
                                    { label: "المورّد", value: detail.supplierName },
                                    { label: "تاريخ الإصدار", value: new Date(detail.issuedAt).toLocaleDateString("ar-IQ") },
                                    { label: "الاستحقاق", value: detail.dueAt ? new Date(detail.dueAt).toLocaleDateString("ar-IQ") : "نقدي" },
                                    { label: "الإجمالي", value: `${money(detail.total)} د.ع` },
                                    { label: "المسدَّد", value: `${money(detail.paidAmount)} د.ع` },
                                    { label: "المتبقي", value: `${money(detail.remaining)} د.ع` },
                                ].map((r) => (
                                    <div key={r.label} className="flex gap-1.5">
                                        <dt className="shrink-0 text-muted-foreground">{r.label}:</dt>
                                        <dd className="min-w-0 truncate font-medium text-foreground">{r.value}</dd>
                                    </div>
                                ))}
                            </dl>

                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/40 text-right text-muted-foreground">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">الصنف</th>
                                            <th className="px-3 py-2 font-medium">الدفعة</th>
                                            <th className="px-3 py-2 font-medium">الانتهاء</th>
                                            <th className="px-3 py-2 font-medium">الكمية</th>
                                            <th className="px-3 py-2 font-medium">بونص</th>
                                            <th className="px-3 py-2 font-medium">الكلفة</th>
                                            <th className="px-3 py-2 font-medium">الإجمالي</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.items.map((it) => (
                                            <tr key={it.id} className="border-t">
                                                <td className="px-3 py-2">
                                                    <div className="font-medium">{it.tradeName}</div>
                                                    <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">{it.barcode}</div>
                                                </td>
                                                <td className="px-3 py-2 font-mono text-[11px]" dir="ltr">{it.batchNumber}</td>
                                                <td className="px-3 py-2 text-muted-foreground">
                                                    {new Date(it.expiryDate).toLocaleDateString("ar-IQ")}
                                                </td>
                                                <td className="tabular-nums px-3 py-2">{it.quantity}</td>
                                                <td className="tabular-nums px-3 py-2">{it.bonusQuantity > 0 ? it.bonusQuantity : "—"}</td>
                                                <td className="tabular-nums px-3 py-2">{money(it.unitCost)}</td>
                                                <td className="tabular-nums px-3 py-2 font-medium">{money(it.lineTotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {detail.payments.length > 0 && (
                                <div>
                                    <p className="mb-1.5 text-xs font-bold">الدفعات المسدَّدة</p>
                                    <ul className="space-y-1 text-[11px]">
                                        {detail.payments.map((pm) => (
                                            <li key={pm.id} className="flex justify-between gap-3 text-muted-foreground">
                                                <span>{new Date(pm.paidAt).toLocaleDateString("ar-IQ")} — {pm.method}</span>
                                                <span className="tabular-nums">{money(pm.amount)} د.ع</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {detail.notes && (
                                <p className="text-[11px] text-muted-foreground">ملاحظات: {detail.notes}</p>
                            )}

                            {/* الإلغاء يتطلب canCreatePurchase على الخادم — من يُدخل
                                الفاتورة هو من يصحّح خطأه، لا المحاسب الذي يسدّد. */}
                            {canCreatePurchase && detail.status !== "CANCELLED" && (
                                <div className="border-t pt-3">
                                    {detail.cancellable ? (
                                        <button
                                            onClick={cancelPurchase}
                                            disabled={cancelling}
                                            className="rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                                        >
                                            {cancelling ? "جارٍ الإلغاء…" : "إلغاء الفاتورة وسحب دفعاتها"}
                                        </button>
                                    ) : (
                                        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
                                            <p className="text-xs font-bold text-warning">لا يمكن إلغاء هذه الفاتورة:</p>
                                            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-muted-foreground">
                                                {detail.cancelBlockers.map((b, i) => (
                                                    <li key={i}>{b}</li>
                                                ))}
                                            </ul>
                                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                                                صحّح المخزون بجرد أو إتلاف من صفحة المخزون بدل الإلغاء.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </Modal>

            {/* نافذة تسجيل دفعة لمورّد */}
            {payingId && (
                <Modal open={!!payingId} onClose={() => setPayingId(null)} title="تسجيل دفعة لمورّد" maxWidthClass="max-w-sm">
                    <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">تسجيل دفعة لمورّد</h3>
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
                                disabled={paySaving || !payForm.amount}
                                className="rounded-lg bg-success px-4 py-2 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                            >
                                {paySaving ? "جارٍ الحفظ…" : "تأكيد"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
