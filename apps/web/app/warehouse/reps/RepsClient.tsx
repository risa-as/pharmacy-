"use client";
import { warehouseMutation } from '@/app/lib/warehouse-mutation-client';

// المندوبون (مذاخر B2B): العميل التفاعلي لصفحة «المندوبون» — قائمة مندوبي
// مذخرك (بضاعة سيارة كل واحد وعمولته المحسوبة للفترة المختارة)، إنشاء/تعديل
// مندوب (canManageReps)، درج تفاصيل مندوب واحد (بضاعة سيارته/مبيعاته
// الميدانية/تحصيلاته)، وثلاثة إجراءات: تحميل بضاعة (canManageReps)، بيع
// ميداني، وتسجيل تحصيل (كلاهما canSellField). كل حساب فعلي (العمولة، الربح،
// الخصم من المخزون) يتم في مسارات app/api/warehouse-portal/reps* — هذا الملف
// عرض وتفاعل فقط، بلا أي منطق مالي مستقل.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import StatusChip from "@/app/warehouse/_components/StatusChip";
import LoadingBlock from "@/app/warehouse/_components/Loading";
import Modal from "@/app/warehouse/_components/Modal";

type CommissionBasis = "SALES" | "PROFIT" | "COLLECTION";
type FieldSaleStatus = "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";

const BASIS_LABELS: Record<CommissionBasis, string> = {
    SALES: "على المبيعات",
    PROFIT: "على الربح",
    COLLECTION: "على التحصيل",
};

const STATUS_LABELS: Record<FieldSaleStatus, string> = {
    UNPAID: "غير مسدَّدة",
    PARTIAL: "جزئية",
    PAID: "مسدَّدة",
    CANCELLED: "ملغاة",
};
const STATUS_VARIANT: Record<FieldSaleStatus, "success" | "warning" | "danger" | "neutral"> = {
    UNPAID: "danger",
    PARTIAL: "warning",
    PAID: "success",
    CANCELLED: "neutral",
};

function money(n: number): string {
    return Math.round(n).toLocaleString("ar-IQ-u-nu-latn");
}

interface RepRow {
    id: string;
    userId: string | null;
    name: string;
    phone: string | null;
    commissionBasis: CommissionBasis;
    commissionRate: number;
    isActive: boolean;
    vanValue: number;
    vanUnits: number;
    salesTotal: number;
    profitTotal: number;
    collectedTotal: number;
    commission: { base: number; amount: number };
}

interface RepStockRow {
    batchId: string;
    quantity: number;
    batchNumber: string;
    expiryDate: string;
    costPrice: number;
    barcode: string;
    tradeName: string;
}

interface FieldSaleItemRow {
    id: string;
    batchId: string;
    catalogItemId: string;
    quantity: number;
    bonusQuantity: number;
    unitPrice: number;
    unitCost: number;
}

interface FieldSaleRow {
    id: string;
    customerName: string;
    invoiceNumber: string;
    total: number;
    paidAmount: number;
    status: FieldSaleStatus;
    soldAt: string;
    notes: string | null;
    items: FieldSaleItemRow[];
}

interface CollectionRow {
    id: string;
    amount: number;
    notes: string | null;
    collectedAt: string;
    fieldSaleId: string | null;
}

// GET /api/warehouse-portal/reps/[id] يُرجِع صف Prisma الخام لـ WarehouseRep —
// بلا vanValue/salesTotal/commission المحسوبة فقط في قائمة GET /reps (تلك
// حقول مُشتقّة من فترة زمنية، لا أعمدة على الجدول). نوع منفصل عمداً عن RepRow
// كي لا يُوهِم بوجود حقول غير موجودة فعلياً في استجابة هذا المسار تحديداً.
interface RepDetailInfo {
    id: string;
    name: string;
    phone: string | null;
    commissionBasis: CommissionBasis;
    commissionRate: number;
    isActive: boolean;
}

interface RepDetail {
    rep: RepDetailInfo;
    stock: RepStockRow[];
    fieldSales: FieldSaleRow[];
    collections: CollectionRow[];
}

interface WarehouseBatchOption {
    catalogItemId: string;
    tradeName: string;
    barcode: string;
    batchId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    bucket: "EXPIRED" | "CRITICAL" | "WARNING" | "OK";
}

const RANGE_OPTIONS = [
    { label: "30 يوم", days: 30 },
    { label: "90 يوم", days: 90 },
    { label: "180 يوم", days: 180 },
];

function rangeToFromTo(days: number): { from: string; to: string } {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
}

export default function RepsClient({
    canManageReps,
    canSellField,
}: {
    canManageReps: boolean;
    canSellField: boolean;
}) {
    const [rangeDays, setRangeDays] = useState(30);
    const [reps, setReps] = useState<RepRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadReps = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { from, to } = rangeToFromTo(rangeDays);
            const res = await fetch(`/api/warehouse-portal/reps?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل قائمة المندوبين");
            setReps(data.reps);
        } catch (e: any) {
            setError(e?.message || "فشل تحميل قائمة المندوبين");
        } finally {
            setLoading(false);
        }
    }, [rangeDays]);

    useEffect(() => {
        loadReps();
    }, [loadReps]);

    // ── إنشاء/تعديل مندوب ────────────────────────────────────────────────
    const [formOpen, setFormOpen] = useState(false);
    const [editingRep, setEditingRep] = useState<RepRow | null>(null);

    // ── درج تفاصيل مندوب ─────────────────────────────────────────────────
    const [detailRepId, setDetailRepId] = useState<string | null>(null);
    const [detail, setDetail] = useState<RepDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    const loadDetail = useCallback(async (repId: string) => {
        setDetailLoading(true);
        setDetailError(null);
        try {
            const res = await fetch(`/api/warehouse-portal/reps/${repId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تحميل تفاصيل المندوب");
            setDetail(data);
        } catch (e: any) {
            setDetailError(e?.message || "فشل تحميل تفاصيل المندوب");
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        if (detailRepId) loadDetail(detailRepId);
        else setDetail(null);
    }, [detailRepId, loadDetail]);

    // إعادة تحميل القائمة والتفاصيل معاً بعد أي عملية تُغيّر البيانات.
    const refreshAll = useCallback(() => {
        loadReps();
        if (detailRepId) loadDetail(detailRepId);
    }, [loadReps, loadDetail, detailRepId]);

    // ── نوافذ الإجراءات الثلاثة ──────────────────────────────────────────
    const [loadModalOpen, setLoadModalOpen] = useState(false);
    const [sellModalOpen, setSellModalOpen] = useState(false);
    const [collectModalOpen, setCollectModalOpen] = useState(false);

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="المندوبون"
                description="بضاعة سيارة كل مندوب، مبيعاته الميدانية، تحصيلاته، وعمولته المحسوبة."
                actions={
                    canManageReps ? (
                        <button
                            onClick={() => {
                                setEditingRep(null);
                                setFormOpen(true);
                            }}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            + إضافة مندوب
                        </button>
                    ) : undefined
                }
            />

            <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">فترة العمولة/الأداء:</span>
                {RANGE_OPTIONS.map((r) => (
                    <button
                        key={r.days}
                        onClick={() => setRangeDays(r.days)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            rangeDays === r.days ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
                {loading && <LoadingBlock label="جارٍ تحميل المندوبين…" />}
                {error && <div className="p-4 text-sm text-destructive">{error}</div>}
                {!loading && !error && reps && (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted text-right text-xs text-muted-foreground">
                                <th className="p-2.5 font-medium">المندوب</th>
                                <th className="p-2.5 font-medium">الحالة</th>
                                <th className="p-2.5 font-medium">قيمة بضاعة السيارة</th>
                                <th className="p-2.5 font-medium">المبيعات</th>
                                <th className="p-2.5 font-medium">الربح</th>
                                <th className="p-2.5 font-medium">المُحصَّل</th>
                                <th className="p-2.5 font-medium">العمولة</th>
                                <th className="p-2.5 font-medium">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reps.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-4 text-center text-muted-foreground">
                                        لا يوجد مندوبون بعد.
                                    </td>
                                </tr>
                            )}
                            {reps.map((rep) => (
                                <tr key={rep.id} className="border-t">
                                    <td className="p-2.5">
                                        <div className="font-medium">{rep.name}</div>
                                        {rep.phone && <div className="text-xs text-muted-foreground">{rep.phone}</div>}
                                        <div className="text-xs text-muted-foreground">
                                            {BASIS_LABELS[rep.commissionBasis]} — {rep.commissionRate}%
                                        </div>
                                    </td>
                                    <td className="p-2.5">
                                        <StatusChip variant={rep.isActive ? "success" : "neutral"} label={rep.isActive ? "فعّال" : "موقوف"} />
                                    </td>
                                    <td className="tabular-nums p-2.5">
                                        {money(rep.vanValue)} <span className="text-xs text-muted-foreground">({rep.vanUnits} وحدة)</span>
                                    </td>
                                    <td className="tabular-nums p-2.5">{money(rep.salesTotal)}</td>
                                    <td className="tabular-nums p-2.5">{money(rep.profitTotal)}</td>
                                    <td className="tabular-nums p-2.5">{money(rep.collectedTotal)}</td>
                                    <td className="tabular-nums p-2.5 font-medium text-primary">{money(rep.commission.amount)}</td>
                                    <td className="p-2.5">
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                onClick={() => setDetailRepId(rep.id)}
                                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            >
                                                تفاصيل
                                            </button>
                                            {canManageReps && (
                                                <button
                                                    onClick={() => {
                                                        setEditingRep(rep);
                                                        setFormOpen(true);
                                                    }}
                                                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                >
                                                    تعديل
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {formOpen && (
                <RepFormModal
                    rep={editingRep}
                    onClose={() => setFormOpen(false)}
                    onSaved={() => {
                        setFormOpen(false);
                        refreshAll();
                    }}
                />
            )}

            {detailRepId && (
                <Modal open={!!detailRepId} onClose={() => setDetailRepId(null)} title="تفاصيل المندوب" maxWidthClass="max-w-3xl">
                    <div className="max-h-[85vh] overflow-y-auto rounded-lg border bg-card p-5 shadow-lg">
                        {detailLoading && <LoadingBlock label="جارٍ تحميل التفاصيل…" />}
                        {detailError && <div className="text-sm text-destructive">{detailError}</div>}
                        {!detailLoading && !detailError && detail && (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold">{detail.rep.name}</h3>
                                    <button onClick={() => setDetailRepId(null)} className="text-sm text-muted-foreground hover:text-foreground">
                                        إغلاق ✕
                                    </button>
                                </div>

                                {canManageReps && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setLoadModalOpen(true)}
                                            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                                        >
                                            تحميل بضاعة
                                        </button>
                                        {canSellField && (
                                            <>
                                                <button
                                                    onClick={() => setSellModalOpen(true)}
                                                    className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                                                >
                                                    بيع ميداني
                                                </button>
                                                <button
                                                    onClick={() => setCollectModalOpen(true)}
                                                    className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                                                >
                                                    تسجيل تحصيل
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                                {!canManageReps && canSellField && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setSellModalOpen(true)}
                                            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                                        >
                                            بيع ميداني
                                        </button>
                                        <button
                                            onClick={() => setCollectModalOpen(true)}
                                            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                                        >
                                            تسجيل تحصيل
                                        </button>
                                    </div>
                                )}

                                <section>
                                    <h4 className="mb-2 text-sm font-semibold">بضاعة السيارة</h4>
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-muted text-right text-muted-foreground">
                                                    <th className="p-2 font-medium">الصنف</th>
                                                    <th className="p-2 font-medium">الدفعة</th>
                                                    <th className="p-2 font-medium">الانتهاء</th>
                                                    <th className="p-2 font-medium">الكمية</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.stock.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="p-3 text-center text-muted-foreground">
                                                            لا توجد بضاعة محمَّلة حالياً.
                                                        </td>
                                                    </tr>
                                                )}
                                                {detail.stock.map((s) => (
                                                    <tr key={s.batchId} className="border-t">
                                                        <td className="p-2">{s.tradeName}</td>
                                                        <td className="p-2">{s.batchNumber}</td>
                                                        <td className="p-2">{new Date(s.expiryDate).toLocaleDateString("ar-IQ-u-nu-latn")}</td>
                                                        <td className="tabular-nums p-2">{s.quantity}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>

                                <section>
                                    <h4 className="mb-2 text-sm font-semibold">المبيعات الميدانية</h4>
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-muted text-right text-muted-foreground">
                                                    <th className="p-2 font-medium">الفاتورة</th>
                                                    <th className="p-2 font-medium">العميل</th>
                                                    <th className="p-2 font-medium">الإجمالي</th>
                                                    <th className="p-2 font-medium">المتبقي</th>
                                                    <th className="p-2 font-medium">الحالة</th>
                                                    <th className="p-2 font-medium">التاريخ</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.fieldSales.length === 0 && (
                                                    <tr>
                                                        <td colSpan={6} className="p-3 text-center text-muted-foreground">
                                                            لا توجد مبيعات ميدانية بعد.
                                                        </td>
                                                    </tr>
                                                )}
                                                {detail.fieldSales.map((s) => (
                                                    <tr key={s.id} className="border-t">
                                                        <td className="p-2">{s.invoiceNumber}</td>
                                                        <td className="p-2">{s.customerName}</td>
                                                        <td className="tabular-nums p-2">{money(s.total)}</td>
                                                        <td className="tabular-nums p-2">{money(Math.max(s.total - s.paidAmount, 0))}</td>
                                                        <td className="p-2">
                                                            <StatusChip variant={STATUS_VARIANT[s.status]} label={STATUS_LABELS[s.status]} />
                                                        </td>
                                                        <td className="p-2">{new Date(s.soldAt).toLocaleDateString("ar-IQ-u-nu-latn")}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>

                                <section>
                                    <h4 className="mb-2 text-sm font-semibold">التحصيلات</h4>
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-muted text-right text-muted-foreground">
                                                    <th className="p-2 font-medium">المبلغ</th>
                                                    <th className="p-2 font-medium">مرتبط بفاتورة؟</th>
                                                    <th className="p-2 font-medium">التاريخ</th>
                                                    <th className="p-2 font-medium">ملاحظات</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.collections.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="p-3 text-center text-muted-foreground">
                                                            لا توجد تحصيلات بعد.
                                                        </td>
                                                    </tr>
                                                )}
                                                {detail.collections.map((c) => (
                                                    <tr key={c.id} className="border-t">
                                                        <td className="tabular-nums p-2">{money(c.amount)}</td>
                                                        <td className="p-2">{c.fieldSaleId ? "تحصيل فاتورة" : "تسليم نقدي — خارج العمولة"}</td>
                                                        <td className="p-2">{new Date(c.collectedAt).toLocaleDateString("ar-IQ-u-nu-latn")}</td>
                                                        <td className="p-2">{c.notes ?? "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {loadModalOpen && detailRepId && (
                <LoadStockModal
                    repId={detailRepId}
                    onClose={() => setLoadModalOpen(false)}
                    onDone={() => {
                        setLoadModalOpen(false);
                        refreshAll();
                    }}
                />
            )}

            {sellModalOpen && detailRepId && detail && (
                <SellModal
                    repId={detailRepId}
                    stock={detail.stock}
                    onClose={() => setSellModalOpen(false)}
                    onDone={() => {
                        setSellModalOpen(false);
                        refreshAll();
                    }}
                />
            )}

            {collectModalOpen && detailRepId && detail && (
                <CollectModal
                    repId={detailRepId}
                    fieldSales={detail.fieldSales.filter((s) => s.status === "UNPAID" || s.status === "PARTIAL")}
                    onClose={() => setCollectModalOpen(false)}
                    onDone={() => {
                        setCollectModalOpen(false);
                        refreshAll();
                    }}
                />
            )}
        </div>
    );
}

// ── نافذة إنشاء/تعديل مندوب ──────────────────────────────────────────────
function RepFormModal({ rep, onClose, onSaved }: { rep: RepRow | null; onClose: () => void; onSaved: () => void }) {
    const [name, setName] = useState(rep?.name ?? "");
    const [phone, setPhone] = useState(rep?.phone ?? "");
    const [basis, setBasis] = useState<CommissionBasis>(rep?.commissionBasis ?? "SALES");
    const [rate, setRate] = useState(String(rep?.commissionRate ?? 0));
    const [isActive, setIsActive] = useState(rep?.isActive ?? true);
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!name.trim()) {
            toast.error("اسم المندوب مطلوب");
            return;
        }
        const rateNum = Number(rate);
        if (!Number.isFinite(rateNum) || rateNum < 0) {
            toast.error("نسبة العمولة يجب أن تكون رقماً غير سالب");
            return;
        }
        setSaving(true);
        try {
            const url = rep ? `/api/warehouse-portal/reps/${rep.id}` : "/api/warehouse-portal/reps";
            const res = await fetch(url, {
                method: rep ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    phone: phone.trim() || null,
                    commissionBasis: basis,
                    commissionRate: rateNum,
                    ...(rep ? { isActive } : {}),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل الحفظ");
            toast.success(rep ? "تم تحديث بيانات المندوب" : "تم إضافة المندوب");
            onSaved();
        } catch (e: any) {
            toast.error(e?.message || "فشل الحفظ");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose} title={rep ? "تعديل مندوب" : "إضافة مندوب"}>
            <div className="space-y-4 rounded-lg border bg-card p-5 shadow-lg">
                <h3 className="text-lg font-bold">{rep ? "تعديل مندوب" : "إضافة مندوب"}</h3>

                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">الاسم</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border bg-muted px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">الهاتف</label>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border bg-muted px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">نمط العمولة</label>
                        <select
                            value={basis}
                            onChange={(e) => setBasis(e.target.value as CommissionBasis)}
                            className="w-full rounded-lg border bg-muted px-2.5 py-2 text-sm"
                        >
                            <option value="SALES">على المبيعات</option>
                            <option value="PROFIT">على الربح</option>
                            <option value="COLLECTION">على التحصيل</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">النسبة (%)</label>
                        <input
                            type="number"
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                            className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                        />
                    </div>
                </div>
                {rep && (
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                        فعّال
                    </label>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
                        إلغاء
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                        {saving ? "جارٍ الحفظ…" : "حفظ"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ── نافذة تحميل بضاعة على سيارة مندوب ────────────────────────────────────
interface LoadLine {
    key: number;
    batchId: string;
    quantity: string;
}
let loadLineSeq = 0;

function LoadStockModal({ repId, onClose, onDone }: { repId: string; onClose: () => void; onDone: () => void }) {
    const [options, setOptions] = useState<WarehouseBatchOption[] | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [lines, setLines] = useState<LoadLine[]>([{ key: ++loadLineSeq, batchId: "", quantity: "" }]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/warehouse-portal/stock");
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || "فشل تحميل قائمة المخزون");
                const flat: WarehouseBatchOption[] = [];
                for (const item of data.items ?? []) {
                    for (const b of item.batches ?? []) {
                        if (b.quantity > 0) {
                            flat.push({
                                catalogItemId: item.id,
                                tradeName: item.tradeName,
                                barcode: item.barcode,
                                batchId: b.id,
                                batchNumber: b.batchNumber,
                                expiryDate: b.expiryDate,
                                quantity: b.quantity,
                                bucket: b.bucket,
                            });
                        }
                    }
                }
                setOptions(flat);
            } catch (e: any) {
                setOptionsError(e?.message || "فشل تحميل قائمة المخزون");
            }
        })();
    }, []);

    const submit = async () => {
        const items = lines
            .filter((l) => l.batchId && l.quantity)
            .map((l) => ({ batchId: l.batchId, quantity: Number(l.quantity) }));
        if (items.length === 0) {
            toast.error("أضف دفعة واحدة على الأقل");
            return;
        }
        setSaving(true);
        try {
            const res = await warehouseMutation(`/api/warehouse-portal/reps/${repId}/load`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || (data?.errors ? data.errors.join("، ") : "فشل التحميل"));
            toast.success("تم تحميل البضاعة على سيارة المندوب");
            onDone();
        } catch (e: any) {
            toast.error(e?.message || "فشل التحميل");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose} title="تحميل بضاعة" maxWidthClass="max-w-lg">
            <div className="max-h-[85vh] overflow-y-auto space-y-4 rounded-lg border bg-card p-5 shadow-lg">
                <h3 className="text-lg font-bold">تحميل بضاعة على سيارة المندوب</h3>

                {optionsError && <div className="text-sm text-destructive">{optionsError}</div>}
                {!options && !optionsError && <LoadingBlock label="جارٍ تحميل الدفعات المتوفرة…" />}

                {options && (
                    <div className="space-y-3">
                        {lines.map((line, idx) => (
                            <div key={line.key} className="flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
                                <div className="min-w-[200px] flex-1">
                                    <label className="mb-1 block text-xs text-muted-foreground">الدفعة</label>
                                    <select
                                        value={line.batchId}
                                        onChange={(e) => {
                                            const next = [...lines];
                                            next[idx] = { ...line, batchId: e.target.value };
                                            setLines(next);
                                        }}
                                        className="w-full rounded-lg border bg-muted px-2.5 py-2 text-sm"
                                    >
                                        <option value="">اختر دفعة…</option>
                                        {options.map((o) => (
                                            <option key={o.batchId} value={o.batchId} disabled={o.bucket === "EXPIRED"}>
                                                {o.tradeName} — {o.batchNumber} — متوفر {o.quantity}
                                                {o.bucket === "EXPIRED" ? " (منتهية الصلاحية)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-28">
                                    <label className="mb-1 block text-xs text-muted-foreground">الكمية</label>
                                    <input
                                        type="number"
                                        value={line.quantity}
                                        onChange={(e) => {
                                            const next = [...lines];
                                            next[idx] = { ...line, quantity: e.target.value };
                                            setLines(next);
                                        }}
                                        className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                    />
                                </div>
                                <button
                                    onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                                    className="rounded-md border px-2 py-2 text-xs text-destructive hover:bg-destructive/10"
                                >
                                    حذف
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => setLines([...lines, { key: ++loadLineSeq, batchId: "", quantity: "" }])}
                            className="text-xs font-medium text-primary hover:underline"
                        >
                            + إضافة دفعة أخرى
                        </button>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
                        إلغاء
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving || !options}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                        {saving ? "جارٍ التحميل…" : "تحميل"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ── نافذة بيع ميداني ──────────────────────────────────────────────────────
// كل سطر يحدّد دفعة صريحة (batchId) من رصيد المندوب الحالي — لا نتخمّن أي
// دفعة يقصدها المستخدم من بين عدّة دفعات لنفس الصنف. الخادم يتحقق فعلياً من
// الرصيد المتوفر لتلك الدفعة تحديداً (repStockAvailable) قبل أي خصم. مسار
// الفهرسة بالصنف (catalogItemId مع FEFO تلقائي داخل رصيد المندوب) يبقى
// مدعوماً في الـ API لاستخدام مستقبلي (تكامل/استيراد جماعي) لكنه غير معروض
// في هذه الواجهة لتفادي غموض "أي دفعة تحديداً بيعت؟" أمام المندوب نفسه.
interface SellLine {
    key: number;
    batchId: string;
    quantity: string;
    bonusQuantity: string;
    unitPrice: string;
}
let sellLineSeq = 0;

function SellModal({
    repId,
    stock,
    onClose,
    onDone,
}: {
    repId: string;
    stock: RepStockRow[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [organizationId, setOrganizationId] = useState("");
    const [customers, setCustomers] = useState<{ organizationId: string; name: string; isBlocked: boolean }[]>([]);
    const customerName = customers.find(c => c.organizationId === organizationId)?.name ?? '';
    useEffect(() => {
        let active = true;
        fetch('/api/warehouse-portal/customers').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (active) setCustomers(d.customers); }).catch(e => toast.error(e.message));
        return () => { active = false; };
    }, []);
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<SellLine[]>([
        { key: ++sellLineSeq, batchId: "", quantity: "", bonusQuantity: "0", unitPrice: "" },
    ]);
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!customerName.trim()) {
            toast.error("اسم الصيدلية (العميل) مطلوب");
            return;
        }
        const preparedLines = lines
            .filter((l) => l.batchId && l.quantity && l.unitPrice !== "")
            .map((l) => ({
                batchId: l.batchId,
                quantity: Number(l.quantity),
                bonusQuantity: Number(l.bonusQuantity || 0),
                unitPrice: Number(l.unitPrice),
            }));
        if (preparedLines.length === 0) {
            toast.error("أضف صنفاً واحداً على الأقل");
            return;
        }
        setSaving(true);
        try {
            const res = await warehouseMutation(`/api/warehouse-portal/reps/${repId}/sales`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId, customerName: customerName.trim(), notes: notes.trim() || undefined, lines: preparedLines }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || (data?.errors ? data.errors.join("، ") : "فشل تسجيل البيع"));
            toast.success(`تم تسجيل البيع — فاتورة ${data.fieldSale?.invoiceNumber ?? ""}`);
            onDone();
        } catch (e: any) {
            toast.error(e?.message || "فشل تسجيل البيع");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose} title="بيع ميداني" maxWidthClass="max-w-lg">
            <div className="max-h-[85vh] overflow-y-auto space-y-4 rounded-lg border bg-card p-5 shadow-lg">
                <h3 className="text-lg font-bold">تسجيل بيع ميداني</h3>

                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم الصيدلية (العميل)</label>
                    <select value={organizationId} onChange={e => setOrganizationId(e.target.value)} className="w-full rounded-lg border bg-muted px-3 py-2 text-sm">
                        <option value="">اختر حساب العميل المسجل</option>
                        {customers.map(c => <option key={c.organizationId} value={c.organizationId} disabled={c.isBlocked}>{c.name}{c.isBlocked ? ' — موقوف' : ''}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">يجب ربط البيع بحساب عميل لتطبيق الحظر وحد الائتمان. أضف العميل من صفحة العملاء أولاً.</p>
                </div>

                <div className="space-y-3">
                    {lines.map((line, idx) => (
                        <div key={line.key} className="flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
                            <div className="min-w-[200px] flex-1">
                                <label className="mb-1 block text-xs text-muted-foreground">الصنف / الدفعة</label>
                                <select
                                    value={line.batchId}
                                    onChange={(e) => {
                                        const next = [...lines];
                                        next[idx] = { ...line, batchId: e.target.value };
                                        setLines(next);
                                    }}
                                    className="w-full rounded-lg border bg-muted px-2.5 py-2 text-sm"
                                >
                                    <option value="">اختر دفعة…</option>
                                    {stock.map((s) => (
                                        <option key={s.batchId} value={s.batchId}>
                                            {s.tradeName} — {s.batchNumber} — متوفر {s.quantity}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-20">
                                <label className="mb-1 block text-xs text-muted-foreground">الكمية</label>
                                <input
                                    type="number"
                                    value={line.quantity}
                                    onChange={(e) => {
                                        const next = [...lines];
                                        next[idx] = { ...line, quantity: e.target.value };
                                        setLines(next);
                                    }}
                                    className="w-full rounded-lg border bg-muted px-2 py-2 text-sm"
                                />
                            </div>
                            <div className="w-20">
                                <label className="mb-1 block text-xs text-muted-foreground">بونص</label>
                                <input
                                    type="number"
                                    value={line.bonusQuantity}
                                    onChange={(e) => {
                                        const next = [...lines];
                                        next[idx] = { ...line, bonusQuantity: e.target.value };
                                        setLines(next);
                                    }}
                                    className="w-full rounded-lg border bg-muted px-2 py-2 text-sm"
                                />
                            </div>
                            <div className="w-24">
                                <label className="mb-1 block text-xs text-muted-foreground">السعر</label>
                                <input
                                    type="number"
                                    value={line.unitPrice}
                                    onChange={(e) => {
                                        const next = [...lines];
                                        next[idx] = { ...line, unitPrice: e.target.value };
                                        setLines(next);
                                    }}
                                    className="w-full rounded-lg border bg-muted px-2 py-2 text-sm"
                                />
                            </div>
                            <button
                                onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                                className="rounded-md border px-2 py-2 text-xs text-destructive hover:bg-destructive/10"
                            >
                                حذف
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() =>
                            setLines([...lines, { key: ++sellLineSeq, batchId: "", quantity: "", bonusQuantity: "0", unitPrice: "" }])
                        }
                        className="text-xs font-medium text-primary hover:underline"
                    >
                        + إضافة صنف آخر
                    </button>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">ملاحظات</label>
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border bg-muted px-3 py-2 text-sm" />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
                        إلغاء
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                        {saving ? "جارٍ التسجيل…" : "تسجيل البيع"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ── نافذة تسجيل تحصيل ─────────────────────────────────────────────────────
function CollectModal({
    repId,
    fieldSales,
    onClose,
    onDone,
}: {
    repId: string;
    fieldSales: FieldSaleRow[];
    onClose: () => void;
    onDone: () => void;
}) {
    const [amount, setAmount] = useState("");
    const [fieldSaleId, setFieldSaleId] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        const amountNum = Number(amount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            toast.error("مبلغ التحصيل يجب أن يكون رقماً موجباً");
            return;
        }
        setSaving(true);
        try {
            const res = await warehouseMutation(`/api/warehouse-portal/reps/${repId}/collections`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: amountNum, fieldSaleId: fieldSaleId || undefined, notes: notes.trim() || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "فشل تسجيل التحصيل");
            toast.success("تم تسجيل التحصيل");
            onDone();
        } catch (e: any) {
            toast.error(e?.message || "فشل تسجيل التحصيل");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open onClose={onClose} title="تسجيل تحصيل">
            <div className="space-y-4 rounded-lg border bg-card p-5 shadow-lg">
                <h3 className="text-lg font-bold">تسجيل تحصيل نقدي من المندوب</h3>

                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">تطبيق على فاتورة (اختياري)</label>
                    <select
                        value={fieldSaleId}
                        onChange={(e) => setFieldSaleId(e.target.value)}
                        className="w-full rounded-lg border bg-muted px-2.5 py-2 text-sm"
                    >
                        <option value="">تسليم نقدي للمذخر (لا يسدد فاتورة ولا يحتسب للعمولة)</option>
                        {fieldSales.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.invoiceNumber} — {s.customerName} — متبقي {money(Math.max(s.total - s.paidAmount, 0))}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">المبلغ</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">ملاحظات</label>
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border bg-muted px-3 py-2 text-sm" />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
                        إلغاء
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                        {saving ? "جارٍ التسجيل…" : "تسجيل"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
