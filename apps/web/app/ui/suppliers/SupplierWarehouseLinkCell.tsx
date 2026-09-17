'use client';

// خلية «المذخر على المنصة» في جدول الموردين: حالة الربط، وطلب ربط يرفعه مدير
// المؤسسة ويعتمده مدير المنصة. الربط يمنع إنشاء مورد مكرر عند أول طلب من المذخر.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Link2, Loader2, X, Clock, Check, AlertTriangle } from 'lucide-react';

export interface SupplierLinkState {
    id: string;
    name: string;
    warehouseName: string | null;
    latestRequest: {
        id: string;
        status: string;
        warehouseName: string;
        decisionNote: string | null;
    } | null;
}

interface TargetWarehouse {
    id: string;
    name: string;
    city?: string | null;
    linkedSupplier?: { id: string; name: string } | null;
    possibleDuplicates?: Array<{ supplierId: string; supplierName: string; reason: 'PHONE' | 'NAME' }>;
}

export default function SupplierWarehouseLinkCell({ supplier, canRequest }: { supplier: SupplierLinkState; canRequest: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    if (supplier.warehouseName) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-xs text-success">
                <Check className="h-3.5 w-3.5" /> مربوط: {supplier.warehouseName}
            </span>
        );
    }

    const req = supplier.latestRequest;
    if (req?.status === 'PENDING') {
        const cancel = async () => {
            setCancelling(true);
            try {
                const res = await fetch(`/api/suppliers/link-requests/${req.id}`, { method: 'DELETE' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    toast.error(data.error ?? 'فشل إلغاء الطلب');
                    return;
                }
                toast.success('أُلغي طلب الربط.');
                router.refresh();
            } finally {
                setCancelling(false);
            }
        };
        return (
            <div className="flex flex-col items-start gap-1">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-600">
                    <Clock className="h-3.5 w-3.5" /> طلب ربط مع «{req.warehouseName}» قيد المراجعة
                </span>
                {canRequest && (
                    <button onClick={cancel} disabled={cancelling} className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50">
                        {cancelling ? 'جارٍ الإلغاء…' : 'إلغاء الطلب'}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-start gap-1">
            <span className="text-xs text-muted-foreground">غير مربوط — طلب يدوي</span>
            {req?.status === 'REJECTED' && (
                <span className="text-[11px] text-destructive" title={req.decisionNote ?? undefined}>
                    رُفض طلب الربط مع «{req.warehouseName}»{req.decisionNote ? `: ${req.decisionNote}` : ''}
                </span>
            )}
            {canRequest && (
                <button
                    onClick={() => setOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                    <Link2 className="h-3.5 w-3.5" /> طلب ربط بمذخر
                </button>
            )}
            {open && (
                <RequestLinkModal
                    supplier={supplier}
                    onClose={() => setOpen(false)}
                    onDone={() => {
                        setOpen(false);
                        router.refresh();
                    }}
                />
            )}
        </div>
    );
}

function RequestLinkModal({ supplier, onClose, onDone }: { supplier: SupplierLinkState; onClose: () => void; onDone: () => void }) {
    const [warehouses, setWarehouses] = useState<TargetWarehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const [warehouseId, setWarehouseId] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/purchases/order-targets', { cache: 'no-store' })
            .then(async (r) => {
                const d = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(d.error ?? 'تعذر جلب المذاخر');
                setWarehouses(d.warehouses ?? []);
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'تعذر جلب المذاخر'))
            .finally(() => setLoading(false));
    }, []);

    // مذاخر يُحتمل أنها نفس هذا المورد (اسم/هاتف) تُقترح أولاً؛ والمربوطة بمورد آخر لا تُعرض.
    const { suggested, rest } = useMemo(() => {
        const available = warehouses.filter((w) => !w.linkedSupplier);
        const isSuggested = (w: TargetWarehouse) => !!w.possibleDuplicates?.some((d) => d.supplierId === supplier.id);
        return { suggested: available.filter(isSuggested), rest: available.filter((w) => !isSuggested(w)) };
    }, [warehouses, supplier.id]);

    const submit = async () => {
        if (!warehouseId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/suppliers/link-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ supplierId: supplier.id, warehouseId, note }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error ?? 'فشل رفع الطلب');
                return;
            }
            toast.success('رُفع طلب الربط إلى إدارة المنصة.');
            onDone();
        } finally {
            setSaving(false);
        }
    };

    if (typeof document === 'undefined') return null;
    const picked = warehouses.find((w) => w.id === warehouseId);

    return createPortal(
        <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
            <div className="w-full max-w-lg rounded-md border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                            <Link2 className="h-4 w-4 text-primary" /> طلب ربط «{supplier.name}» بمذخر
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            اطلب الربط إن كان هذا المورد هو نفسه مذخراً مسجلاً على المنصة. بعد موافقة إدارة المنصة
                            تُسجَّل فواتير طلباتك من المذخر على هذا المورد نفسه، فيبقى رصيده وتاريخ أسعاره في سجل
                            واحد. <b>لا يُنقل رصيد ولا تتغير أي فاتورة قائمة.</b>
                        </p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex h-24 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-bold text-foreground">المذخر</label>
                            <select
                                value={warehouseId}
                                onChange={(e) => setWarehouseId(e.target.value)}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            >
                                <option value="">— اختر المذخر —</option>
                                {suggested.length > 0 && (
                                    <optgroup label="مقترح (اسم أو هاتف مشابه)">
                                        {suggested.map((w) => (
                                            <option key={w.id} value={w.id}>{w.name}{w.city ? ` — ${w.city}` : ''}</option>
                                        ))}
                                    </optgroup>
                                )}
                                <optgroup label="كل مذاخر المنصة">
                                    {rest.map((w) => (
                                        <option key={w.id} value={w.id}>{w.name}{w.city ? ` — ${w.city}` : ''}</option>
                                    ))}
                                </optgroup>
                            </select>
                            {picked && !picked.possibleDuplicates?.some((d) => d.supplierId === supplier.id) && (
                                <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                    اسم هذا المذخر وهاتفه لا يشبهان المورد — تأكد أنها نفس الجهة.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-bold text-foreground">ملاحظة لإدارة المنصة (اختياري)</label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={500}
                                rows={2}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                placeholder="مثلاً: نفس المكتب، تغيّر اسمه على المنصة"
                            />
                        </div>
                        {error && (
                            <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} disabled={saving} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                                إلغاء
                            </button>
                            <button
                                onClick={submit}
                                disabled={saving || !warehouseId}
                                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />} رفع الطلب
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
