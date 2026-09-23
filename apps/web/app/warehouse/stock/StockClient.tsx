"use client";

// المرحلة ب من ميزة تتبّع مخزون المذخر: عميل صفحة «المخزون» — فلاتر، توسيع صف
// لعرض الدفعات (إضافة/تعديل/إتلاف)، وسجل حركات لكل صنف. نفس أسلوب
// app/warehouse/catalog/CatalogClient.tsx (sonner للتنبيهات، إعادة الجلب الخفيف
// بعد كل عملية كتابة بدل تعديل متفائل معقّد).
import MoreActions from '@/app/ui/order-more-actions';
import ListPages from "../_components/ListPages";
import { useWarehouseList } from "../_components/useWarehouseList";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import EmptyState from "@/app/warehouse/_components/EmptyState";
import StatusChip, { type StatusChipVariant } from "@/app/warehouse/_components/StatusChip";
import LoadingBlock from "@/app/warehouse/_components/Loading";
import Modal from "@/app/warehouse/_components/Modal";

type ExpiryBucket = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";

interface StockBatch {
    id: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    initialQuantity: number;
    costPrice: number | null;
    supplierName: string | null;
    bucket: ExpiryBucket;
}

interface StockItem {
    id: string;
    barcode: string;
    tradeName: string;
    scientificName: string | null;
    price: number;
    costPrice: number | null;
    minStock: number;
    isAvailable: boolean;
    availability: boolean;
    // صنف بلا أي دفعة (batchCount = 0) هو صنف غير متتبَّع — لم يبدأ المذخر
    // إدخال مخزونه بعد، وهذا مختلف تماماً عن "نافد" (متتبَّع لكن رصيده صفر).
    isTracked: boolean;
    sellableQuantity: number;
    expiredQuantity: number;
    batchCount: number;
    nearestExpiry: string | null;
    nearestExpiryBucket: ExpiryBucket | null;
    isLowStock: boolean;
    batches: StockBatch[];
}

interface MoveRow {
    id: string;
    type: string;
    quantity: number;
    reason: string | null;
    actorName: string | null;
    orderId: string | null;
    createdAt: string;
    batch: { batchNumber: string } | null;
}

type FilterKey = "all" | "low" | "expiring" | "out";

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: "الكل" },
    { key: "low", label: "منخفض" },
    { key: "expiring", label: "قارب الانتهاء" },
    { key: "out", label: "نافد" },
];

// شارة حالة الانتهاء — ألوان دلالية (نجاح/تحذير/خطر) منفصلة عن لون العلامة
// (primary)، وتُقرأ في الوضعين الفاتح والداكن عبر StatusChip المشترك.
const EXPIRY_VARIANT: Record<ExpiryBucket, StatusChipVariant> = {
    EXPIRED: "danger",
    CRITICAL: "warning",
    WARNING: "warning",
    OK: "success",
};
const EXPIRY_LABEL: Record<ExpiryBucket, string> = {
    EXPIRED: "منتهي",
    CRITICAL: "حرج (≤90 يوم)",
    WARNING: "قارب الانتهاء (≤180 يوم)",
    OK: "سليم",
};
function ExpiryChip({ bucket }: { bucket: ExpiryBucket | null }) {
    if (!bucket) {
        return <span className="text-xs text-muted-foreground">لا يوجد رصيد صالح</span>;
    }
    return <StatusChip variant={EXPIRY_VARIANT[bucket]} label={EXPIRY_LABEL[bucket]} emphasis={bucket === "CRITICAL"} />;
}

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("ar-IQ-u-nu-latn");
    } catch {
        return iso;
    }
}


export default function StockClient({ initialItems }: { initialItems: StockItem[] }) {

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterKey>("all");
    const list = useWarehouseList<StockItem>('/api/warehouse-portal/stock', 'items', new URLSearchParams({ search, filter }).toString(), initialItems);
    const { items, setItems } = list;
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [receiptOpenFor, setReceiptOpenFor] = useState<string | null>(null);
    const [receiptForm, setReceiptForm] = useState({
        batchNumber: "",
        expiryDate: "",
        quantity: "",
        costPrice: "",
        supplierName: "",
    });
    const [saving, setSaving] = useState(false);
    const [movesFor, setMovesFor] = useState<StockItem | null>(null);
    const [moves, setMoves] = useState<MoveRow[]>([]);
    const [loadingMoves, setLoadingMoves] = useState(false);
    const [editingBatch, setEditingBatch] = useState<{ batchId: string; mode: "adjust" | "damage"; expectedQuantity: number } | null>(null);
    const [editForm, setEditForm] = useState({ value: "", reason: "" });

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((it) => {
            if (q && !it.tradeName.toLowerCase().includes(q) && !it.barcode.toLowerCase().includes(q)) return false;
            if (filter === "low") return it.isLowStock;
            if (filter === "expiring") return it.nearestExpiryBucket === "CRITICAL" || it.nearestExpiryBucket === "WARNING";
            // "نافد" يقتصر على أصناف متتبَّعة فعلاً (لها دفعات) وصفرية الرصيد —
            // صنف بلا أي دفعة غير متتبَّع، وليس "نافداً".
            if (filter === "out") return it.isTracked && it.sellableQuantity === 0;
            return true;
        });
    }, [items, search, filter]);

    const refresh = async () => {
        const fresh = await list.refresh();
        setItems(fresh);
        // أبقِ الصف المفتوح والحوارات مرتبطة بأحدث نسخة من نفس الصنف.
        if (movesFor) {
            const stillThere = fresh.find((i) => i.id === movesFor.id);
            if (stillThere) setMovesFor(stillThere);
        }
    };

    const submitReceipt = async (catalogItemId: string) => {
        const quantity = Number(receiptForm.quantity);
        if (!receiptForm.batchNumber.trim()) return toast.error("رقم الدفعة مطلوب");
        if (!receiptForm.expiryDate) return toast.error("تاريخ الانتهاء مطلوب");
        if (!Number.isInteger(quantity) || quantity <= 0) return toast.error("الكمية يجب أن تكون عدداً صحيحاً موجباً");

        setSaving(true);
        try {
            const res = await fetch("/api/warehouse-portal/stock/receipt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    catalogItemId,
                    batchNumber: receiptForm.batchNumber.trim(),
                    expiryDate: receiptForm.expiryDate,
                    quantity,
                    costPrice: receiptForm.costPrice ? Number(receiptForm.costPrice) : undefined,
                    supplierName: receiptForm.supplierName.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "فشل في تسجيل الاستلام");
                return;
            }
            toast.success("تم تسجيل الدفعة");
            setReceiptForm({ batchNumber: "", expiryDate: "", quantity: "", costPrice: "", supplierName: "" });
            setReceiptOpenFor(null);
            setExpandedId(catalogItemId);
            await refresh();
        } finally {
            setSaving(false);
        }
    };

    const submitAdjust = async () => {
        if (!editingBatch) return;
        const { batchId, mode } = editingBatch;
        const value = Number(editForm.value);
        if (!editForm.reason.trim()) return toast.error("السبب مطلوب");
        if (!Number.isInteger(value) || value < 0) return toast.error("قيمة غير صالحة");
        if (mode === "damage" && value <= 0) return toast.error("كمية الإتلاف يجب أن تكون أكبر من صفر");

        setSaving(true);
        try {
            const body =
                mode === "adjust"
                    ? { batchId, newQuantity: value, expectedQuantity: editingBatch.expectedQuantity, reason: editForm.reason.trim() }
                    : { batchId, quantity: value, reason: editForm.reason.trim() };
            const res = await fetch("/api/warehouse-portal/stock/adjust", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "فشل في تنفيذ العملية");
                return;
            }
            toast.success(mode === "adjust" ? "تم تصحيح الكمية" : "تم تسجيل الإتلاف");
            setEditingBatch(null);
            setEditForm({ value: "", reason: "" });
            await refresh();
        } finally {
            setSaving(false);
        }
    };

    const openMoves = async (item: StockItem) => {
        setMovesFor(item);
        setLoadingMoves(true);
        try {
            const res = await fetch(`/api/warehouse-portal/stock/moves?catalogItemId=${encodeURIComponent(item.id)}`);
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? "فشل في جلب الحركات");
                setMoves([]);
                return;
            }
            setMoves(data.moves ?? []);
        } finally {
            setLoadingMoves(false);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="المخزون"
                description="دفعات كتالوجك، أرصدتها، وتواريخ انتهائها — التتبّع يبدأ تلقائياً بمجرد أول دفعة تُدخلها لأي صنف."
                actions={
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث بالاسم أو الباركود…"
                        className="w-56 rounded-lg border bg-muted px-3 py-2 text-sm"
                    />
                }
            />

            <div className="flex items-center gap-1 border-b">
                {FILTER_TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setFilter(t.key)}
                        className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
                            filter === t.key
                                ? "border-b-2 border-primary text-primary"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <ListPages {...list} />
            {filtered.length === 0 ? (
                <EmptyState
                    icon="🗃️"
                    title={search.trim() || filter !== "all" ? "لا توجد أصناف مطابقة" : "لا توجد أصناف في كتالوجك بعد"}
                    description={search.trim() || filter !== "all" ? "جرّب تغيير البحث أو الفلتر لعرض أصناف أخرى." : "أضف أصنافك من تبويب أدويتي أولاً، ثم سجّل دفعاتها هنا."}
                    action={<a href="/warehouse/catalog" className="rounded-lg border px-3 py-2 text-sm font-medium text-primary">فتح أدويتي</a>}
                />
            ) : (
                /* max-h + overflow-auto — انظر التعليق المطابق في CatalogClient.tsx:
                   ارتفاع محدود فعلياً هو الشرط الوحيد الذي يُفعِّل sticky على الترويسة. */
                <div className="max-h-[70vh] overflow-auto rounded-lg border bg-card shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-muted text-right text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 font-medium">الدواء</th>
                                <th className="px-4 py-3 font-medium">الباركود</th>
                                <th className="px-4 py-3 font-medium">القابل للبيع</th>
                                <th className="px-4 py-3 font-medium">عدد الدفعات (الكل)</th>
                                <th className="px-4 py-3 font-medium">أقرب انتهاء</th>
                                <th className="px-4 py-3 font-medium">السعر</th>
                                <th className="px-4 py-3 font-medium">الكلفة</th>
                                <th className="px-4 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((it) => (
                                <StockRow
                                    key={it.id}
                                    item={it}
                                    expanded={expandedId === it.id}
                                    onToggle={() => setExpandedId(expandedId === it.id ? null : it.id)}
                                    onOpenReceipt={() => setReceiptOpenFor(it.id)}
                                    onOpenMoves={() => openMoves(it)}
                                    onEditBatch={(batchId, mode) => {
                                        setEditingBatch({ batchId, mode, expectedQuantity: it.batches.find((b) => b.id === batchId)?.quantity ?? 0 });
                                        setEditForm({ value: mode === "adjust" ? String(it.batches.find((b) => b.id === batchId)?.quantity ?? 0) : "", reason: "" });
                                    }}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {receiptOpenFor && (
                <Modal open={!!receiptOpenFor} onClose={() => setReceiptOpenFor(null)} title="إضافة دفعة" maxWidthClass="max-w-md">
                    <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">إضافة دفعة</h3>
                        <div className="space-y-3">
                            <input
                                value={receiptForm.batchNumber}
                                onChange={(e) => setReceiptForm({ ...receiptForm, batchNumber: e.target.value })}
                                placeholder="رقم الدفعة *"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                type="date"
                                value={receiptForm.expiryDate}
                                onChange={(e) => setReceiptForm({ ...receiptForm, expiryDate: e.target.value })}
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={receiptForm.quantity}
                                onChange={(e) => setReceiptForm({ ...receiptForm, quantity: e.target.value })}
                                placeholder="الكمية *"
                                inputMode="numeric"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={receiptForm.costPrice}
                                onChange={(e) => setReceiptForm({ ...receiptForm, costPrice: e.target.value })}
                                placeholder="كلفة الشراء (اختياري)"
                                inputMode="decimal"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={receiptForm.supplierName}
                                onChange={(e) => setReceiptForm({ ...receiptForm, supplierName: e.target.value })}
                                placeholder="اسم المورد (اختياري)"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setReceiptOpenFor(null)}
                                className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={() => submitReceipt(receiptOpenFor)}
                                disabled={saving}
                                className="rounded-lg bg-success px-4 py-2 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                            >
                                {saving ? "جارٍ الحفظ…" : "حفظ الدفعة"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {editingBatch && (
                <Modal
                    open={!!editingBatch}
                    onClose={() => setEditingBatch(null)}
                    title={editingBatch.mode === "adjust" ? "تعديل كمية" : "إتلاف"}
                    maxWidthClass="max-w-sm"
                >
                    <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg">
                        <h3 className="mb-3 font-bold">{editingBatch.mode === "adjust" ? "تعديل كمية" : "إتلاف"}</h3>
                        <div className="space-y-3">
                            <input
                                value={editForm.value}
                                onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                                placeholder={editingBatch.mode === "adjust" ? "الكمية الجديدة" : "الكمية التالفة"}
                                inputMode="numeric"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                            <input
                                value={editForm.reason}
                                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                                placeholder="السبب *"
                                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setEditingBatch(null)}
                                className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={submitAdjust}
                                disabled={saving}
                                className={`rounded-lg px-4 py-2 text-sm disabled:opacity-50 ${
                                    editingBatch.mode === "damage"
                                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                                }`}
                            >
                                {saving ? "جارٍ الحفظ…" : "تأكيد"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {movesFor && (
                <Modal open={!!movesFor} onClose={() => setMovesFor(null)} title={`حركات المخزون — ${movesFor.tradeName}`} maxWidthClass="max-w-2xl">
                    <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border bg-card p-5 shadow-lg">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-bold">حركات المخزون — {movesFor.tradeName}</h3>
                            <button onClick={() => setMovesFor(null)} className="text-sm text-muted-foreground hover:underline">
                                إغلاق
                            </button>
                        </div>
                        {loadingMoves ? (
                            <LoadingBlock />
                        ) : moves.length === 0 ? (
                            <p className="text-sm text-muted-foreground">لا توجد حركات مسجَّلة بعد.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 z-10 bg-card text-right text-muted-foreground">
                                    <tr>
                                        <th className="px-2 py-2 font-medium">النوع</th>
                                        <th className="px-2 py-2 font-medium">الكمية</th>
                                        <th className="px-2 py-2 font-medium">الدفعة</th>
                                        <th className="px-2 py-2 font-medium">السبب</th>
                                        <th className="px-2 py-2 font-medium">بواسطة</th>
                                        <th className="px-2 py-2 font-medium">التاريخ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {moves.map((m) => (
                                        <tr key={m.id} className="border-t">
                                            <td className="px-2 py-2">{MOVE_TYPE_LABELS[m.type] ?? m.type}</td>
                                            <td className="tabular-nums px-2 py-2">{m.quantity}</td>
                                            <td className="px-2 py-2 font-mono text-xs">{m.batch?.batchNumber ?? "—"}</td>
                                            <td className="px-2 py-2 text-xs text-muted-foreground">{m.reason ?? "—"}</td>
                                            <td className="px-2 py-2 text-xs text-muted-foreground">{m.actorName ?? "—"}</td>
                                            <td className="px-2 py-2 text-xs text-muted-foreground">{formatDate(m.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
}

const MOVE_TYPE_LABELS: Record<string, string> = {
    RECEIPT: "استلام",
    SHIPMENT: "شحن",
    ADJUSTMENT: "تصحيح جرد",
    DAMAGE: "إتلاف",
    RETURN: "إرجاع",
};

function StockRow({
    item,
    expanded,
    onToggle,
    onOpenReceipt,
    onOpenMoves,
    onEditBatch,
}: {
    item: StockItem;
    expanded: boolean;
    onToggle: () => void;
    onOpenReceipt: () => void;
    onOpenMoves: () => void;
    onEditBatch: (batchId: string, mode: "adjust" | "damage") => void;
}) {
    return (
        <>
            <tr className="border-t">
                <td className="px-4 py-3">
                    <button onClick={onToggle} className="text-right font-medium hover:underline">
                        {item.tradeName}
                    </button>
                    {item.scientificName && <div className="text-xs text-muted-foreground">{item.scientificName}</div>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{item.barcode}</td>
                <td className="tabular-nums px-4 py-3">
                    {item.isTracked ? (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="font-medium">{item.sellableQuantity.toLocaleString("ar-IQ-u-nu-latn")}</span>
                                {item.isLowStock && <StatusChip variant="warning" label="منخفض" />}
                                {item.sellableQuantity === 0 && <StatusChip variant="danger" label="نافد" />}
                            </div>
                            {item.expiredQuantity > 0 && (
                                <div className="text-xs text-destructive">+{item.expiredQuantity} منتهي (غير مُحتسَب)</div>
                            )}
                        </>
                    ) : (
                        // بلا أي دفعة مُدخَلة بعد — غير متتبَّع، وليس "نافداً" (لا يخضع
                        // للتحقق عند الشحن، انظر تعليق deductStockForShipment).
                        <StatusChip variant="neutral" label="غير متتبَّع" />
                    )}
                </td>
                <td className="tabular-nums px-4 py-3 text-muted-foreground">{item.batchCount}</td>
                <td className="px-4 py-3">
                    <ExpiryChip bucket={item.nearestExpiryBucket} />
                </td>
                <td className="tabular-nums px-4 py-3">{item.price.toLocaleString("ar-IQ-u-nu-latn")}</td>
                <td className="tabular-nums px-4 py-3 text-muted-foreground">{item.costPrice?.toLocaleString("ar-IQ-u-nu-latn") ?? '—'}</td>
                <td className="px-4 py-3 text-left">
                    <div className="flex items-center justify-end gap-2">
                        <button onClick={onOpenMoves} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                            الحركات
                        </button>
                        <button onClick={onOpenReceipt} className="inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium text-primary hover:bg-primary/5">
                            إضافة دفعة
                        </button>
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="border-t bg-muted/30">
                    <td colSpan={8} className="px-4 py-3">
                        {item.batches.length === 0 ? (
                            <p className="text-sm text-muted-foreground">لا توجد دفعات مسجَّلة لهذا الصنف بعد.</p>
                        ) : (
                            <table className="w-full text-xs">
                                <thead className="text-muted-foreground">
                                    <tr>
                                        <th className="px-2 py-1 text-right font-medium">رقم الدفعة</th>
                                        <th className="px-2 py-1 text-right font-medium">الانتهاء</th>
                                        <th className="px-2 py-1 text-right font-medium">الحالة</th>
                                        <th className="px-2 py-1 text-right font-medium">الكمية</th>
                                        <th className="px-2 py-1 text-right font-medium">الكلفة</th>
                                        <th className="px-2 py-1 text-right font-medium">المورد</th>
                                        <th className="px-2 py-1"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {item.batches.map((b) => (
                                        <tr key={b.id} className="border-t">
                                            <td className="px-2 py-1.5 font-mono">{b.batchNumber}</td>
                                            <td className="px-2 py-1.5">{formatDate(b.expiryDate)}</td>
                                            <td className="px-2 py-1.5">
                                                <ExpiryChip bucket={b.bucket} />
                                            </td>
                                            <td className="tabular-nums px-2 py-1.5">{b.quantity}</td>
                                            <td className="tabular-nums px-2 py-1.5">{b.costPrice?.toLocaleString("ar-IQ-u-nu-latn") ?? '—'}</td>
                                            <td className="px-2 py-1.5 text-muted-foreground">{b.supplierName ?? "—"}</td>
                                            <td className="px-2 py-1.5 text-left">
                                                <MoreActions label={`إجراءات الدفعة ${b.batchNumber}`}>
                                                    <button
                                                        onClick={() => onEditBatch(b.id, "adjust")}
                                                        className="flex items-center px-3 py-2 text-xs text-primary hover:bg-muted"
                                                    >
                                                        تعديل كمية
                                                    </button>
                                                    <button
                                                        onClick={() => onEditBatch(b.id, "damage")}
                                                        className="flex items-center px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                                                    >
                                                        إتلاف
                                                    </button>
                                                </MoreActions>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}
