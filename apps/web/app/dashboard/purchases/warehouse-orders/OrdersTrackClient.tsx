'use client';

// المرحلة 4 من ميزة المذاخر: عميل متابعة طلبات المذاخر — قائمة بفلترة الحالة +
// تفاصيل الطلب: العرض (المتوفرة/الجزئية/النافدة والأسعار النهائية) + Timeline +
// اعتماد/رفض العرض وإلغاء الطلب قبل الشحن.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, PackageCheck, AlertTriangle } from 'lucide-react';
import type { ReceiptState } from '@/app/lib/warehouse-order-receipt';

type OrderStatus =
    | 'DRAFT' | 'SENT' | 'UNDER_REVIEW' | 'QUOTED' | 'APPROVED'
    | 'REJECTED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface TrackItem {
    id: string;
    quantity: number;
    unitPrice: number;
    requestedPrice: number | null;
    quotedPrice: number | null;
    quotedQuantity: number | null;
    status: string;
    note: string | null;
    drug: { tradeName: string; barcode: string };
    // ميزة البونص: وحدات مجانية اعتمدها المذخر لهذا السطر — تصل الصيدلية فعلياً
    // بلا أي مقابل مالي (WarehouseInvoice.total لا يتضمنها). هذا هو صلب الميزة
    // من منظور الصيدلي: يجب أن يرى بوضوح ما يستلمه مجاناً.
    bonusQuantity: number;
}

interface TrackEvent {
    id: string;
    actorType: string;
    actorName: string | null;
    type: string;
    payload: any;
    createdAt: string;
}

interface TrackOrder {
    id: string;
    orderNumber: string | null;
    status: OrderStatus;
    totalAmount: number;
    notes: string | null;
    createdAt: string;
    warehouse: { name: string };
    branch: { name: string };
    items: TrackItem[];
    events: TrackEvent[];
    /** فاتورة الشراء التي أنشأها الاعتماد — تُحسب في page.tsx. */
    purchaseId: string | null;
    /** هل دخلت الأدوية الدفعات؟ الاعتماد وحده لا يُدخلها — الاستلام يفعل. */
    receiptState: ReceiptState;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
    DRAFT: 'مسودة',
    SENT: 'أُرسل — بانتظار المذخر',
    UNDER_REVIEW: 'المذخر يراجع',
    QUOTED: 'عرض سعر جاهز — يحتاج قرارك',
    APPROVED: 'معتمد',
    REJECTED: 'مرفوض',
    SHIPPED: 'قيد التسليم',
    DELIVERED: 'مُسلَّم',
    CANCELLED: 'ملغى',
};

const STATUS_STYLE: Record<OrderStatus, string> = {
    DRAFT: 'bg-muted text-muted-foreground',
    SENT: 'bg-blue-500/10 text-blue-600',
    UNDER_REVIEW: 'bg-amber-500/10 text-amber-600',
    QUOTED: 'bg-primary/10 text-primary font-bold',
    APPROVED: 'bg-success/10 text-success',
    REJECTED: 'bg-destructive/10 text-destructive',
    SHIPPED: 'bg-indigo-500/10 text-indigo-600',
    DELIVERED: 'bg-success/10 text-success',
    CANCELLED: 'bg-muted text-muted-foreground',
};

const ITEM_LABEL: Record<string, string> = {
    REQUESTED: 'بانتظار المذخر',
    AVAILABLE: 'متوفر',
    PARTIAL: 'جزئي',
    OUT_OF_STOCK: 'نافد',
};

const EVENT_LABEL: Record<string, string> = {
    SENT: 'أُرسل الطلب للمذخر',
    UNDER_REVIEW: 'بدأ المذخر المراجعة',
    QUOTED: 'أرسل المذخر عرض السعر',
    APPROVED: 'اعتمدت الصيدلية العرض',
    REJECTED: 'رفضت الصيدلية العرض',
    SHIPPED: 'خرج الطلب للتسليم',
    DELIVERED: 'تم التسليم',
    CANCELLED: 'أُلغي الطلب',
    NOTE: 'ملاحظة',
};

export default function OrdersTrackClient({ initialOrders }: { initialOrders: TrackOrder[] }) {
    const router = useRouter();
    const [orders, setOrders] = useState<TrackOrder[]>(initialOrders);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [details, setDetails] = useState<TrackOrder | null>(null);
    const [busy, setBusy] = useState(false);
    const [returningFor, setReturningFor] = useState<TrackOrder | null>(null);

    // يصل ناتج router.refresh() كـ prop جديدة. نزامنها مع الحالة المحلية كي
    // يظهر تغيير حالة الطلب فعلياً بدلاً من تنفيذ polling لا أثر مرئي له.
    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    // طلبات معتمدة لم تُستلم بضاعتها: أدويتها ليست في الدفعات ولا المخزون بعد.
    const awaitingReceipt = useMemo(() => orders.filter((o) => o.receiptState === 'AWAITING_RECEIPT'), [orders]);

    const visible = useMemo(
        () => (statusFilter === 'ALL' ? orders : orders.filter((o) => o.status === statusFilter)),
        [orders, statusFilter]
    );

    // تحديث عملي خلال دقيقة واحدة بلا WebSocket. نؤجله أثناء نافذة التفاصيل أو
    // عملية قرار/إرجاع جارية كي لا يخفي حوار المستخدم أو يعيد بياناته قبل الحفظ.
    useEffect(() => {
        if (details || returningFor || busy) return;

        const refreshIfVisible = () => {
            if (document.visibilityState === 'visible') router.refresh();
        };
        const timer = window.setInterval(refreshIfVisible, 60_000);
        return () => window.clearInterval(timer);
    }, [details, returningFor, busy, router]);

    const decide = async (order: TrackOrder, action: 'APPROVED' | 'REJECTED' | 'CANCELLED') => {
        const reason =
            action === 'REJECTED'
                ? window.prompt('سبب الرفض (اختياري، يظهر للمذخر):') ?? null
                : null;
        if (action === 'REJECTED' && reason === null) return; // ألغى المستخدم الـ prompt

        setBusy(true);
        try {
            const res = await fetch(`/api/warehouses/orders/${order.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, reason }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? 'تعذر تنفيذ القرار');
                return;
            }
            // تحديث محلي فوري من استجابة الـ API ثم جلب كامل للتفاصيل
            setOrders((prev) =>
                prev.map((o) => (o.id === order.id ? { ...o, status: data.order.status } : o))
            );
            setDetails(null);
            // حالة الاستلام تُحسب في الخادم من فاتورة الشراء التي أنشأها الاعتماد للتو.
            router.refresh();
            toast.success(
                action === 'APPROVED'
                    ? 'اعتُمد العرض. عند وصول البضاعة اضغط «استلام البضاعة» لإضافة الأدوية إلى الدفعات والمخزون.'
                    : action === 'REJECTED'
                    ? 'رُفض العرض وأُبلغ المذخر'
                    : 'أُلغي الطلب'
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">طلبات المذاخر</h1>
                    <p className="text-sm text-muted-foreground">
                        تابع حالة طلباتك من المذاخر — العروض، الشحن، وسجل الأحداث الكامل.
                    </p>
                </div>
                <Link
                    href="/dashboard/purchases/warehouse-orders/new"
                    className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    <Plus className="h-4 w-4" /> طلب جديد
                </Link>
            </div>

            {awaitingReceipt.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                        <p className="font-bold text-foreground">
                            {awaitingReceipt.length} طلب معتمد بانتظار استلام البضاعة
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            اعتماد العرض لا يضيف الأدوية إلى الدفعات. عند وصول البضاعة اضغط «استلام البضاعة» وأدخل
                            رقم الدفعة وتاريخ الانتهاء لكل صنف؛ الأدوية غير الموجودة في مخزونك تُضاف إليه تلقائياً.
                        </p>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-1">
                {[
                    ['ALL', 'الكل'],
                    ['SENT', 'بانتظار المذخر'],
                    ['UNDER_REVIEW', 'قيد المراجعة'],
                    ['QUOTED', 'عروض جاهزة'],
                    ['APPROVED', 'معتمدة'],
                    ['SHIPPED', 'قيد التسليم'],
                    ['DELIVERED', 'مُسلَّمة'],
                    ['REJECTED', 'مرفوضة'],
                    ['CANCELLED', 'ملغاة'],
                ].map(([v, l]) => (
                    <button
                        key={v}
                        onClick={() => setStatusFilter(v)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                            statusFilter === v ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
                        }`}
                    >
                        {l}
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground shadow-sm">
                    <p className="text-4xl">🧾</p>
                    <p className="mt-3">لا توجد طلبات بهذه الحالة.</p>
                    <Link
                        href="/dashboard/purchases/warehouse-orders/new"
                        className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                    >
                        أنشئ طلبك الأول من مذخر
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {visible.map((o) => (
                        <div key={o.id} className="rounded-xl border bg-card p-4 shadow-sm">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-mono text-sm font-bold">{o.orderNumber ?? o.id.slice(0, 8)}</span>
                                <span className="text-sm">من: {o.warehouse.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(o.createdAt).toLocaleString('ar-IQ')}
                                </span>
                                <span className={`mr-auto rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[o.status]}`}>
                                    {STATUS_LABEL[o.status]}
                                </span>
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                                {o.items.length} صنف — الإجمالي الحالي: {o.totalAmount.toLocaleString('ar-IQ')} د.ع
                                {/* ميزة البونص: مجموع وحدات البونص عبر كل أصناف الطلب — ظاهر في
                                    القائمة مباشرة، لا داخل التفاصيل فقط، لأنه صلب عرض هذا المذخر. */}
                                {(() => {
                                    const totalBonus = o.items.reduce((sum, it) => sum + (it.bonusQuantity || 0), 0);
                                    return totalBonus > 0 ? (
                                        <span className="mr-2 font-medium text-success">
                                            + {totalBonus.toLocaleString('ar-IQ')} بونص مجاني
                                        </span>
                                    ) : null;
                                })()}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    onClick={() => setDetails(o)}
                                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
                                >
                                    التفاصيل والسجل
                                </button>
                                {o.receiptState === 'AWAITING_RECEIPT' && o.purchaseId && (
                                    <Link
                                        href={`/dashboard/purchases/${o.purchaseId}/receive?return=warehouse-orders`}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                                    >
                                        <PackageCheck className="h-4 w-4" />
                                        استلام البضاعة وإضافتها للمخزون
                                    </Link>
                                )}
                                {o.receiptState === 'RECEIVED' && (
                                    <Link
                                        href="/dashboard/batches"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-sm text-success hover:bg-success/15"
                                    >
                                        <PackageCheck className="h-4 w-4" />
                                        استُلمت — عرض الدفعات
                                    </Link>
                                )}
                                {o.receiptState === 'PURCHASE_CANCELLED' && (
                                    <span className="rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                                        فاتورة الشراء المرتبطة ملغاة
                                    </span>
                                )}
                                {o.status === 'QUOTED' && (
                                    <>
                                        <button
                                            onClick={() => decide(o, 'APPROVED')}
                                            disabled={busy}
                                            className="rounded-lg bg-success px-3 py-1.5 text-sm text-success-foreground hover:bg-success/90 disabled:opacity-50"
                                        >
                                            اعتماد العرض
                                        </button>
                                        <button
                                            onClick={() => decide(o, 'REJECTED')}
                                            disabled={busy}
                                            className="rounded-lg bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                                        >
                                            رفض
                                        </button>
                                    </>
                                )}
                                {['SENT', 'UNDER_REVIEW', 'QUOTED', 'APPROVED'].includes(o.status) && (
                                    <button
                                        onClick={() => decide(o, 'CANCELLED')}
                                        disabled={busy}
                                        className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
                                    >
                                        إلغاء الطلب
                                    </button>
                                )}
                                {['SHIPPED', 'DELIVERED'].includes(o.status) && (
                                    <button
                                        onClick={() => setReturningFor(o)}
                                        className="rounded-lg border px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
                                    >
                                        طلب إرجاع
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {details && <DetailsModal order={details} onClose={() => setDetails(null)} />}
            {returningFor && (
                <ReturnRequestModal order={returningFor} onClose={() => setReturningFor(null)} />
            )}
        </div>
    );
}

// المرحلة 5 (الصقل التجاري) §Part 4: طلب إرجاع صنف/أصناف من طلب مُسلَّم أو
// قيد التسليم. الكمية والسعر يُحسمان على الخادم (effectiveLine) — هذه الواجهة
// ترسل فقط الباركود والكمية المطلوب إرجاعها.
function ReturnRequestModal({ order, onClose }: { order: TrackOrder; onClose: () => void }) {
    const returnable = order.items.filter((it) => it.status !== 'OUT_OF_STOCK');
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    const maxQuantity = (it: TrackItem) => (it.status === 'PARTIAL' ? it.quotedQuantity ?? 0 : it.quantity);

    const submit = async () => {
        const items = returnable
            .map((it) => ({ barcode: it.drug.barcode, quantity: Number(quantities[it.id] || 0) }))
            .filter((it) => it.quantity > 0);
        if (items.length === 0) {
            toast.error('حدِّد كمية لصنف واحد على الأقل');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/warehouses/orders/${order.id}/returns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, reason: reason.trim() || undefined }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (Array.isArray(data.details) && data.details.length > 0) {
                    toast.error(data.details[0]);
                } else {
                    toast.error(data.error ?? 'تعذر إنشاء طلب الإرجاع');
                }
                return;
            }
            toast.success('أُرسل طلب الإرجاع للمذخر — بانتظار قراره');
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-card p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">طلب إرجاع — {order.warehouse.name}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>

                <div className="space-y-2">
                    {returnable.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                            <div>
                                <div className="font-medium">{it.drug.tradeName}</div>
                                <div className="text-xs text-muted-foreground">
                                    الكمية المشحونة: {maxQuantity(it)}
                                </div>
                            </div>
                            <input
                                type="number"
                                min={0}
                                max={maxQuantity(it)}
                                value={quantities[it.id] ?? ''}
                                onChange={(e) => setQuantities((prev) => ({ ...prev, [it.id]: e.target.value }))}
                                placeholder="0"
                                className="w-24 rounded-lg border bg-muted px-3 py-2 text-sm"
                            />
                        </div>
                    ))}
                </div>

                <div className="mt-4">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">سبب الإرجاع (اختياري)</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                    />
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                        إلغاء
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {saving ? 'جارٍ الإرسال…' : 'إرسال طلب الإرجاع'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function DetailsModal({ order, onClose }: { order: TrackOrder; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-card p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">
                        طلب {order.orderNumber ?? ''} — {order.warehouse.name}
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-right text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 font-medium">الصنف</th>
                                <th className="px-3 py-2 font-medium">المطلوب</th>
                                <th className="px-3 py-2 font-medium">التوقع</th>
                                <th className="px-3 py-2 font-medium">الحكم</th>
                                <th className="px-3 py-2 font-medium">السعر النهائي</th>
                                <th className="px-3 py-2 font-medium">بونص</th>
                                <th className="px-3 py-2 font-medium">ملاحظة المذخر</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((it) => (
                                <tr key={it.id} className="border-t">
                                    <td className="px-3 py-2">
                                        <div className="font-medium">{it.drug.tradeName}</div>
                                        <div className="font-mono text-xs text-muted-foreground">{it.drug.barcode}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        {it.quotedQuantity != null && it.status === 'PARTIAL'
                                            ? `${it.quotedQuantity} من ${it.quantity}`
                                            : it.quantity}
                                    </td>
                                    <td className="px-3 py-2">{it.requestedPrice ?? it.unitPrice}</td>
                                    <td className="px-3 py-2">{ITEM_LABEL[it.status] ?? it.status}</td>
                                    <td className="px-3 py-2 font-medium">
                                        {it.status === 'OUT_OF_STOCK' ? '—' : (it.quotedPrice ?? it.requestedPrice ?? it.unitPrice)}
                                    </td>
                                    <td className="px-3 py-2">
                                        {it.bonusQuantity > 0 ? (
                                            <span className="font-medium text-success">+{it.bonusQuantity} مجاناً</span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-xs">
                                        {/* المرحلة 4 (بدائل الدواء): note نص حر بحت — المذخر قد يكتب فيه
                                            اقتراح بديل يدوياً. لا تحليل/استخراج بنيوي هنا؛ فقط تمييز بصري
                                            لصنف نافد بملاحظة (الحالة التي يُرجَّح أن تحمل اقتراح بديل فعلياً)
                                            عن ملاحظة عادية على صنف متوفر. whitespace-pre-line يحافظ على
                                            السطر الجديد الذي يضيفه applyAlternativeSuggestion في OrdersClient. */}
                                        {it.status === 'OUT_OF_STOCK' && it.note ? (
                                            <div className="whitespace-pre-line rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-warning">
                                                {it.note}
                                            </div>
                                        ) : (
                                            <span className="whitespace-pre-line text-muted-foreground">{it.note ?? ''}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-3 text-left font-bold">
                    الإجمالي النهائي: {order.totalAmount.toLocaleString('ar-IQ')} د.ع
                </div>

                <div className="mt-5 rounded-xl bg-muted/40 p-4">
                    <p className="mb-2 text-sm font-bold">سجل الأحداث</p>
                    <div className="space-y-2">
                        {order.events.map((ev) => (
                            <div key={ev.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                                    {EVENT_LABEL[ev.type] ?? ev.type}
                                </span>
                                <span className="text-muted-foreground">
                                    {new Date(ev.createdAt).toLocaleString('ar-IQ')}
                                </span>
                                <span className="text-muted-foreground">
                                    {ev.actorType === 'PHARMACY' ? 'الصيدلية' : ev.actorType === 'WAREHOUSE' ? 'المذخر' : 'النظام'}
                                    {ev.actorName ? ` — ${ev.actorName}` : ''}
                                </span>
                            </div>
                        ))}
                        {order.events.length === 0 && (
                            <p className="text-xs text-muted-foreground">لا أحداث مسجلة.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
