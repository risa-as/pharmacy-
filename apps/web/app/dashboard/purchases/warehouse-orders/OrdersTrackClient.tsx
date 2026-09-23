'use client';
import type { UserPermissions } from '@/app/lib/permissions';
import OrderSettlement from './OrderSettlement';
import { warehouseMutation } from '@/app/lib/warehouse-mutation-client';

// المرحلة 4 من ميزة المذاخر: عميل متابعة طلبات المذاخر — قائمة بفلترة الحالة +
// تفاصيل الطلب: العرض (المتوفرة/الجزئية/النافدة والأسعار النهائية) + Timeline +
// اعتماد/رفض العرض وإلغاء الطلب قبل الشحن.
import { useEffect, useMemo, useState, useRef } from 'react';
// النافذتان أدناه تُنقلان إلى document.body عبر بوابة (نفس نمط PriceCompareModal
// و«إدارة المذاخر» وبقية نوافذ المستودع). صيّرهما داخل الشجرة مباشرةً كان يجعلهما
// ابنين للحاوية الجذرية `space-y-6`، فتُطبَّق عليها قاعدة `> * + * { margin-top:
// 1.5rem }`: ومع `fixed inset-0` (top و bottom صفر وارتفاع تلقائي) يحلّ المتصفح
// التعارض بإزاحة الطبقة 24px للأسفل وإنقاص ارتفاعها 24px، فيظهر شريط شفاف بعرض
// الشاشة أعلى التعتيم. البوابة تُخرجها من أي سياق هوامش كهذا نهائياً.
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, PackageCheck, AlertTriangle, FileText, Boxes, RotateCcw, MoreHorizontal, X } from 'lucide-react';
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

type ReturnSummary = { id: string; status: string; totalAmount?: number; items: { barcode: string; quantity: number }[] };

interface TrackOrder {
    returnRequests: ReturnSummary[];
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
    RECEIPT_RECONCILED: 'تم ربط فاتورة ودفعات الاستلام',
    RETURN_REQUESTED: 'أُرسل طلب الإرجاع',
    RETURN_ACCEPTED: 'قَبِل المذخر الإرجاع وطُبّق الإشعار الدائن',
    RETURN_REJECTED: 'رفض المذخر الإرجاع',
    RETURN_DISPATCHED: 'أُرسلت بضاعة المرتجع للمذخر',
    RETURN_PHARMACY_RESTORED: 'أُعيد المرتجع المرفوض لمخزون الصيدلية',
    RETURN_REFUNDED: 'سُجل رد الرصيد الدائن',
    PAYMENT_MATCH_PROPOSED: 'طلب مطابقة السداد',
    PAYMENT_MATCH_CONFIRMED: 'اعتُمدت مطابقة السداد',
};

function remainingReturn(order: TrackOrder, item: TrackItem) {
    const shipped = item.status === 'OUT_OF_STOCK' ? 0 : item.status === 'PARTIAL' ? item.quotedQuantity ?? 0 : item.quantity;
    const reserved = (order.returnRequests ?? []).filter(r => ['PENDING', 'ACCEPTED'].includes(r.status)).flatMap(r => r.items).filter(i => i.barcode === item.drug.barcode).reduce((sum, i) => sum + i.quantity, 0);
    return Math.max(0, shipped - reserved);
}
function acceptedCredit(order: TrackOrder) {
    return (order.returnRequests ?? []).filter(r => r.status === 'ACCEPTED').reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);
}
export default function OrdersTrackClient({ initialOrders, permissions, canManageCustody }: { initialOrders: TrackOrder[]; permissions: UserPermissions; canManageCustody: boolean }) {
    const router = useRouter();
    useEffect(() => {
        const refresh = () => { if (document.visibilityState === 'visible') router.refresh(); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, [router]);
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
                {permissions.canCreateWarehouseOrder && <Link
                    href="/dashboard/purchases/warehouse-orders/new"
                    className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    <Plus className="h-4 w-4" /> طلب جديد
                </Link>}
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

            <div role="group" aria-label="تصفية الطلبات حسب الحالة" className="grid grid-cols-3 gap-2 rounded-lg border bg-card p-2 sm:grid-cols-5 xl:grid-cols-9">
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
                        type="button"
                        aria-pressed={statusFilter === v}
                        onClick={() => setStatusFilter(v)}
                        className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                            statusFilter === v ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
                        }`}
                    >
                        <span className="whitespace-nowrap leading-5">{l}</span>
                        <span className={`text-sm font-semibold tabular-nums leading-5 ${statusFilter === v ? 'text-primary-foreground' : 'text-foreground'}`}>
                            {(v === 'ALL' ? orders.length : orders.filter(order => order.status === v).length).toLocaleString('en-US')}
                        </span>
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground shadow-sm">
                    <p className="text-4xl">🧾</p>
                    <p className="mt-3">لا توجد طلبات بهذه الحالة.</p>
                    {permissions.canCreateWarehouseOrder && <Link
                        href="/dashboard/purchases/warehouse-orders/new"
                        className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                    >
                        {orders.length === 0 ? 'أنشئ طلبك الأول من مذخر' : 'إنشاء طلب جديد'}
                    </Link>}
                </div>
            ) : (
                <div className="space-y-3">
                    {visible.map((o) => (
                        <article key={o.id} className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0"><span dir="ltr" className="inline-block font-mono text-sm font-bold text-primary">{o.orderNumber ?? o.id.slice(0, 8)}</span><h3 className="mt-1 break-words font-semibold">{o.warehouse.name}</h3></div>
                                <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${o.receiptState === 'RECEIVED' ? 'bg-success/10 text-success' : STATUS_STYLE[o.status]}`}>
                                    {o.receiptState === 'RECEIVED' ? 'استُلم لدى الصيدلية' : STATUS_LABEL[o.status]}
                                </span>
                            </div>
                            <div className="my-4 flex flex-wrap items-end justify-between gap-3">
                                <div><p className="text-xs text-muted-foreground">{acceptedCredit(o) > 0 ? 'الصافي بعد المرتجعات' : 'إجمالي الطلب'}</p>
                                    <p className="mt-1 text-2xl font-bold tabular-nums">{Math.max(0, o.totalAmount - acceptedCredit(o)).toLocaleString('ar-IQ')} <span className="text-xs font-medium text-muted-foreground">د.ع</span></p>
                                    <p className="mt-1.5 text-xs text-muted-foreground">{o.items.length} أصناف <span className="mx-1.5" aria-hidden="true">·</span><time dateTime={o.createdAt} title={new Date(o.createdAt).toLocaleString('ar-IQ')}>{new Date(o.createdAt).toLocaleDateString('ar-IQ', {day:'numeric',month:'short',year:'numeric'})}</time></p>
                                </div>
                                {o.items.some(item => item.bonusQuantity > 0) && <span className="rounded-lg border border-success/20 bg-success/5 px-2.5 py-1 text-xs font-medium text-success">+ {o.items.reduce((sum,item)=>sum+(item.bonusQuantity||0),0).toLocaleString('ar-IQ')} بونص مجاني</span>}
                            </div>
                            {o.receiptState === 'RECEIVED' && o.status !== 'DELIVERED' && <p className="mb-3 text-xs text-muted-foreground">تم تسجيل الاستلام في مخزون الصيدلية. آخر حالة لدى المذخر: {STATUS_LABEL[o.status]}.</p>}
                            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                                <button onClick={() => setDetails(o)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><FileText className="h-4 w-4" aria-hidden="true" />تفاصيل الطلب</button>
                                {o.receiptState === 'RECEIVED' && <Link href="/dashboard/batches" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-muted"><Boxes className="h-4 w-4" aria-hidden="true" />عرض الدفعات</Link>}
                                {permissions.canReceivePurchase && o.receiptState === 'AWAITING_RECEIPT' && o.purchaseId && <Link href={`/dashboard/purchases/${o.purchaseId}/receive?return=warehouse-orders`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-primary hover:bg-primary/5"><PackageCheck className="h-4 w-4" aria-hidden="true" />استلام البضاعة</Link>}
                                {!!o.returnRequests?.length && <button onClick={() => setDetails(o)} className="inline-flex min-h-9 flex-wrap items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"><RotateCcw className="h-4 w-4" aria-hidden="true" />متابعة المرتجعات<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{o.returnRequests.some(r => r.status === 'PENDING') ? 'قيد المراجعة' : o.returnRequests.some(r => r.status === 'ACCEPTED') ? 'مقبول' : 'مرفوض'}</span></button>}
                                {permissions.canApproveWarehouseOrder && o.status === 'QUOTED' && <><button onClick={() => decide(o, 'APPROVED')} disabled={busy} className="h-9 rounded-lg border border-success/30 px-3 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-50">اعتماد العرض</button><button onClick={() => decide(o, 'REJECTED')} disabled={busy} className="h-9 rounded-lg border px-3 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50">رفض العرض</button></>}
                                {o.receiptState === 'PURCHASE_CANCELLED' && <span className="text-xs text-muted-foreground">فاتورة الشراء ملغاة</span>}
                                <OrderMoreActions permissions={permissions} order={o} busy={busy} onReturn={() => setReturningFor(o)} onCancel={() => decide(o, 'CANCELLED')} />
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {details && <DetailsModal canManageCustody={canManageCustody} order={details} onClose={() => setDetails(null)} />}
            {returningFor && (
                <ReturnRequestModal order={returningFor} onClose={() => setReturningFor(null)} onSubmitted={record => {
                    setOrders(current => current.map(order => order.id === returningFor.id ? { ...order, returnRequests: [...(order.returnRequests ?? []), record] } : order));
                    setReturningFor(null);
                    router.refresh();
                }} />
            )}
        </div>
    );
}

function OrderMoreActions({order, busy, onReturn, onCancel, permissions}: {permissions: UserPermissions; order: TrackOrder; busy: boolean; onReturn: () => void; onCancel: () => void}) {
    const disclosure = useRef<HTMLDetailsElement>(null);
    const canCancel = permissions.canApproveWarehouseOrder && ['SENT','UNDER_REVIEW','QUOTED','APPROVED'].includes(order.status) && order.receiptState !== 'RECEIVED' && (order.status !== 'APPROVED' || order.receiptState === 'AWAITING_RECEIPT');
    const canReturn = permissions.canReturnWarehouseOrder && ['SHIPPED','DELIVERED'].includes(order.status) && !order.returnRequests?.some(r => r.status === 'PENDING') && order.items.some(item => remainingReturn(order,item) > 0);
    useEffect(() => {
        const outside = (event: PointerEvent) => { if (event.target instanceof Node && !disclosure.current?.contains(event.target)) disclosure.current?.removeAttribute('open'); };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && disclosure.current?.open) { disclosure.current.removeAttribute('open'); disclosure.current.querySelector('summary')?.focus(); } };
        document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape);
        return () => {document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
    }, []);
    if (!canCancel && !canReturn) return null;
    const run = (action: () => void) => { disclosure.current?.removeAttribute('open'); action(); };
    return <details ref={disclosure} name="warehouse-order-actions" className="relative mr-auto">
        <summary aria-label={`المزيد من إجراءات الطلب ${order.orderNumber ?? ''}`} className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-lg border px-2.5 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">المزيد<MoreHorizontal className="h-4 w-4" aria-hidden="true" /></summary>
        <div className="absolute left-0 top-full z-20 mt-1 w-52 max-w-[80vw] space-y-1 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
            {canReturn && <button disabled={busy} onClick={() => run(onReturn)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs hover:bg-muted disabled:opacity-50"><RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />{order.returnRequests?.length ? 'إرجاع كمية إضافية' : 'طلب إرجاع'}</button>}
            {canCancel && <button disabled={busy} onClick={() => run(onCancel)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"><X className="h-4 w-4 shrink-0" aria-hidden="true" />إلغاء الطلب</button>}
        </div>
    </details>;
}

// المرحلة 5 (الصقل التجاري) §Part 4: طلب إرجاع صنف/أصناف من طلب مُسلَّم أو
// قيد التسليم. الكمية والسعر يُحسمان على الخادم (effectiveLine) — هذه الواجهة
// ترسل فقط الباركود والكمية المطلوب إرجاعها.
function ReturnRequestModal({ order, onClose, onSubmitted }: { order: TrackOrder; onClose: () => void; onSubmitted: (record: ReturnSummary) => void }) {
    const returnable = order.items.filter(it => remainingReturn(order, it) > 0);
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const sending = useRef(false);

    const maxQuantity = (it: TrackItem) => remainingReturn(order, it);

    const submit = async () => {
        if (sending.current) return;
        const items = returnable
            .map((it) => ({ barcode: it.drug.barcode, quantity: Number(quantities[it.id] || 0) }))
            .filter((it) => it.quantity > 0);
        if (items.length === 0) {
            toast.error('حدِّد كمية لصنف واحد على الأقل');
            return;
        }
        sending.current = true;
        setSaving(true);
        try {
            const res = await warehouseMutation(`/api/warehouses/orders/${order.id}/returns`, {
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
            onSubmitted(data.return);
        } catch {
            toast.error('تعذر تأكيد النتيجة. أعد المحاولة بنفس البيانات؛ لن يُسجّل الطلب مرتين.');
        } finally {
            sending.current = false;
            setSaving(false);
        }
    };

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-card p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">طلب إرجاع — {order.warehouse.name}</h3>
                    <button disabled={saving} onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">✕</button>
                </div>

                <div className="space-y-2">
                    {returnable.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                            <div>
                                <div className="font-medium">{it.drug.tradeName}</div>
                                <div className="text-xs text-muted-foreground">
                                    المتبقي القابل لطلب الإرجاع: {maxQuantity(it)}
                                </div>
                            </div>
                            <input
                                disabled={saving}
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
                    <textarea disabled={saving}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                    />
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button disabled={saving} onClick={onClose} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
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
        </div>,
        document.body
    );
}

function DetailsModal({ order, onClose, canManageCustody }: { order: TrackOrder; onClose: () => void; canManageCustody: boolean }) {
    if (typeof document === 'undefined') return null;

    return createPortal(
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
                    <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">✕</button>
                </div>

                {['SHIPPED', 'DELIVERED'].includes(order.status) && <OrderSettlement canManageCustody={canManageCustody} orderId={order.id} items={order.items} />}

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-right text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 font-medium">الصنف</th>
                                <th className="px-3 py-2 font-medium">المطلوب</th>

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
                                        {/* بعض الأصناف تحمل باركوداً طويلاً جداً (رأينا 80 خانة
                                            ست عشرية بدل 13 خانة EAN-13)، فكان يمدّ عمود «الصنف»
                                            ويكسر عرض الجدول. القصّ هنا بصري فقط عبر max-w+truncate:
                                            الباركودات الطبيعية تظهر كاملة، والطويل وحده يُختصر
                                            بثلاث نقاط، والقيمة الكاملة تبقى في title للمرور عليها. */}
                                        <div
                                            className="max-w-[16ch] truncate font-mono text-xs text-muted-foreground"
                                            title={it.drug.barcode}
                                        >
                                            {it.drug.barcode}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        {it.quotedQuantity != null && it.status === 'PARTIAL'
                                            ? `${it.quotedQuantity} من ${it.quantity}`
                                            : it.quantity}
                                    </td>

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
                    <p>إجمالي الطلب الأصلي: {order.totalAmount.toLocaleString('ar-IQ')} د.ع</p>{acceptedCredit(order) > 0 && <><p className="mt-1 text-sm text-muted-foreground">المرتجعات المقبولة: {acceptedCredit(order).toLocaleString('ar-IQ')} د.ع</p><p className="mt-1">الصافي بعد الإرجاع: {Math.max(0, order.totalAmount - acceptedCredit(order)).toLocaleString('ar-IQ')} د.ع</p></>}
                </div>

                <details className="mt-5 rounded-lg bg-muted/40 p-4">
                    <summary className="cursor-pointer text-sm font-bold">سجل الأحداث ({order.events.length})</summary>
                    <div className="space-y-2">
                        {order.events.map((ev) => (
                            <div key={ev.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                                    {EVENT_LABEL[ev.type] ?? 'تحديث على الطلب'}
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
                </details>
            </div>
        </div>,
        document.body
    );
}
