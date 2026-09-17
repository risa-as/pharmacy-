// المرحلة 4 من ميزة المذاخر: مربع «إرسال لمذخر» من الطلب الذكي.
// يستقبل البنود المختارة (باركود/اسم/كمية)، يعرض دليل المذاخر، ويضبط كميات كل
// مذخر حسب توفره في كتالوجه (فقط المتوفر)، ثم يرسل الطلبات دفعة واحدة.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';

interface SmartLine {
    barcode?: string;
    tradeName: string;
    quantity: number;
}

interface WarehouseCard {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    phone: string | null;
    _count: { catalogItems: number };
}

interface AvailabilityRow {
    barcode: string;
    price: number;
}

export default function WarehouseOrderFromSmart({
    items,
    onClose,
}: {
    items: SmartLine[];
    onClose: () => void;
}) {
    const idempotencyKey = useRef(crypto.randomUUID());
    const router = useRouter();
    const [warehouses, setWarehouses] = useState<WarehouseCard[]>([]);
    const [selected, setSelected] = useState<WarehouseCard | null>(null);
    const [availability, setAvailability] = useState<Map<string, AvailabilityRow>>(new Map());
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [quantities, setQuantities] = useState<Record<string, number>>(() =>
        Object.fromEntries(items.map((i) => [i.barcode!, i.quantity]))
    );

    useEffect(() => {
        fetch('/api/warehouses/directory')
            .then((r) => r.json())
            .then((d) => setWarehouses(d.warehouses || []))
            .catch(() => toast.error('فشل في جلب دليل المذاخر'));
    }, []);

    const pickWarehouse = async (wh: WarehouseCard) => {
        setSelected(wh);
        setLoading(true);
        try {
            // نجلب كتالوج المذخر كاملاً مرة واحدة ونفلتر محلياً على باركودات البنود.
            const url = new URL('/api/warehouses/directory', window.location.origin);
            url.searchParams.set('warehouseId', wh.id);
            const res = await fetch(url.toString());
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error ?? 'فشل في جلب الكتالوج');
                return;
            }
            const wanted = new Set(items.map((i) => i.barcode!));
            const map = new Map<string, AvailabilityRow>();
            for (const it of data.items ?? []) {
                if (wanted.has(it.barcode)) {
                    map.set(it.barcode, { barcode: it.barcode, price: it.price });
                }
            }
            setAvailability(map);
        } finally {
            setLoading(false);
        }
    };

    const availableLines = useMemo(
        () => items.filter((i) => i.barcode && availability.has(i.barcode)),
        [items, availability]
    );
    const missingLines = useMemo(
        () => items.filter((i) => !i.barcode || !availability.has(i.barcode)),
        [items, availability]
    );

    const total = availableLines.reduce(
        (s, l) => s + (quantities[l.barcode!] ?? l.quantity) * availability.get(l.barcode!)!.price,
        0
    );

    const send = async () => {
        if (!selected || availableLines.length === 0) return;
        setSending(true);
        try {
            const res = await fetch('/api/warehouses/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    warehouseId: selected.id,
                    idempotencyKey: idempotencyKey.current,
                    items: availableLines.map((l) => ({
                        barcode: l.barcode,
                        quantity: quantities[l.barcode!] ?? l.quantity,
                        unitPrice: availability.get(l.barcode!)!.price,
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.details && Array.isArray(data.details)) {
                    toast.error(data.details[0]?.message ?? 'بعض الأصناف غير قابلة للطلب');
                } else {
                    toast.error(data.error ?? 'فشل في إرسال الطلب');
                }
                return;
            }
            toast.success(`أُرسل الطلب ${data.order.orderNumber ?? ''} إلى ${selected.name}`);
            router.push('/dashboard/purchases/warehouse-orders');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-card p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold">إرسال الطلب لمذخر على المنصة</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {!selected ? (
                    warehouses.length === 0 ? (
                        <p className="py-8 text-center text-muted-foreground">لا توجد مذاخر مفعّلة بعد.</p>
                    ) : (
                        <div className="space-y-2">
                            {warehouses.map((wh) => (
                                <button
                                    key={wh.id}
                                    onClick={() => pickWarehouse(wh)}
                                    className="flex w-full items-center justify-between rounded-xl border p-4 text-right hover:bg-muted"
                                >
                                    <div>
                                        <div className="font-bold">{wh.name}</div>
                                        {wh.city && <div className="text-xs text-muted-foreground">{wh.city}</div>}
                                    </div>
                                    <div className="text-sm text-primary">{wh._count.catalogItems} صنف</div>
                                </button>
                            ))}
                        </div>
                    )
                ) : (
                    <>
                        <button onClick={() => setSelected(null)} className="mb-3 text-sm text-primary hover:underline">
                            ← تغيير المذخر
                        </button>

                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : (
                            <>
                                {missingLines.length > 0 && (
                                    <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                                        {missingLines.length} صنف غير متوفر في كتالوج هذا المذخر
                                        (أو بلا باركود) وسيُستثنى من الطلب:
                                        <span className="mt-1 block text-xs">
                                            {missingLines.map((m) => m.tradeName).join('، ')}
                                        </span>
                                    </div>
                                )}

                                {availableLines.length === 0 ? (
                                    <p className="py-6 text-center text-muted-foreground">
                                        لا يوجد أي صنف من مختاراتك متوفراً لدى هذا المذخر.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {availableLines.map((l) => (
                                            <div key={l.barcode} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                                                <span className="flex-1 font-medium">{l.tradeName}</span>
                                                <span className="text-muted-foreground">
                                                    {availability.get(l.barcode!)!.price.toLocaleString('ar-IQ')} د.ع
                                                </span>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={quantities[l.barcode!] ?? l.quantity}
                                                    onChange={(e) =>
                                                        setQuantities((prev) => ({
                                                            ...prev,
                                                            [l.barcode!]: Math.max(1, Number(e.target.value) || 1),
                                                        }))
                                                    }
                                                    className="w-16 rounded border bg-muted px-2 py-1 text-center"
                                                />
                                            </div>
                                        ))}
                                        <div className="pt-2 text-left font-bold">
                                            الإجمالي: {total.toLocaleString('ar-IQ')} د.ع
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={send}
                                    disabled={sending || availableLines.length === 0}
                                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                                    إرسال الطلب إلى {selected.name}
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
