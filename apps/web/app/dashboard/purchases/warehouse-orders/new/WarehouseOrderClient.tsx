'use client';

// المرحلة 4 من ميزة المذاخر: عميل «طلب جديد من مذخر».
// التدفق: اختر مذخراً → ابحث كتالوجه (سعر/توفر لحظي) → جمّع الطلب → أرسل (SENT).
// الأصناف تُرسل بالباركود — المسار يطابق الصف العالمي فيفهمه الطرفان (§4.1-أ).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Package, Search, ShoppingCart, Loader2 } from 'lucide-react';

interface WarehouseCard {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    phone: string | null;
    _count: { catalogItems: number };
}

interface CatalogItem {
    id: string;
    barcode: string;
    price: number;
    drug: { tradeName: string; scientificName: string | null };
}

interface CartLine {
    barcode: string;
    tradeName: string;
    price: number;
    quantity: number;
}

export default function WarehouseOrderClient() {
    const idempotencyKey = useRef(crypto.randomUUID());
    const router = useRouter();
    const [warehouses, setWarehouses] = useState<WarehouseCard[]>([]);
    const [selected, setSelected] = useState<WarehouseCard | null>(null);
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetch('/api/warehouses/directory')
            .then((r) => r.json())
            .then((d) => setWarehouses(d.warehouses || []))
            .catch(() => toast.error('فشل في جلب دليل المذاخر'));
    }, []);

    const loadCatalog = async (wh: WarehouseCard, q?: string) => {
        const url = new URL('/api/warehouses/directory', window.location.origin);
        url.searchParams.set('warehouseId', wh.id);
        if (q) url.searchParams.set('search', q);
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!res.ok) {
            toast.error(data.error ?? 'فشل في جلب الكتالوج');
            return;
        }
        setCatalog(data.items || []);
    };

    const pickWarehouse = (wh: WarehouseCard) => {
        setSelected(wh);
        setCart([]);
        setSearch('');
        loadCatalog(wh);
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return catalog;
        return catalog.filter(
            (c) =>
                c.drug.tradeName.toLowerCase().includes(q) ||
                c.barcode.toLowerCase().includes(q)
        );
    }, [catalog, search]);

    const addToCart = (item: CatalogItem) => {
        setCart((prev) => {
            const found = prev.find((l) => l.barcode === item.barcode);
            if (found) {
                return prev.map((l) => (l.barcode === item.barcode ? { ...l, quantity: l.quantity + 1 } : l));
            }
            return [...prev, { barcode: item.barcode, tradeName: item.drug.tradeName, price: item.price, quantity: 1 }];
        });
    };

    const total = cart.reduce((s, l) => s + l.price * l.quantity, 0);

    const submit = async () => {
        if (!selected) return;
        if (cart.length === 0) {
            toast.error('أضف صنفاً واحداً على الأقل');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/warehouses/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    warehouseId: selected.id,
                    idempotencyKey: idempotencyKey.current,
                    items: cart.map((l) => ({ barcode: l.barcode, quantity: l.quantity, unitPrice: l.price })),
                    notes: notes || null,
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
            toast.success(`أُرسل الطلب ${data.order.orderNumber ?? ''} للمذخر`);
            router.push('/dashboard/purchases/warehouse-orders');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div>
                <h1 className="text-2xl font-bold">طلب جديد من مذخر</h1>
                <p className="text-sm text-muted-foreground">
                    اختر مذخراً على المنصة، جمّع طلبك من كتالوجه بأسعاره المعلنة، وسيصل الطلب للمذخر فوراً.
                </p>
            </div>

            {!selected ? (
                warehouses.length === 0 ? (
                    <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground shadow-sm">
                        <p className="text-4xl">🏭</p>
                        <p className="mt-3">لا توجد مذاخر مفعّلة على المنصة بعد.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {warehouses.map((wh) => (
                            <button
                                key={wh.id}
                                onClick={() => pickWarehouse(wh)}
                                className="rounded-xl border bg-card p-5 text-right shadow-sm transition hover:shadow-md"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                        <Building2 className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold">{wh.name}</h3>
                                        {wh.city && <p className="text-xs text-muted-foreground">{wh.city}</p>}
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-1 text-sm text-primary">
                                    <Package className="h-3.5 w-3.5" />
                                    {wh._count.catalogItems} صنف متوفر
                                </div>
                            </button>
                        ))}
                    </div>
                )
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                        <button onClick={() => setSelected(null)} className="text-sm text-primary hover:underline">
                            ← تغيير المذخر
                        </button>
                        <span className="font-bold">{selected.name}</span>
                        <div className="relative mr-auto w-64">
                            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="بحث في كتالوج المذخر…"
                                className="w-full rounded-lg border bg-muted py-2 pr-9 pl-3 text-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            {filtered.length === 0 ? (
                                <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground shadow-sm">
                                    لا أصناف مطابقة في كتالوج هذا المذخر.
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 text-right text-muted-foreground">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">الدواء</th>
                                                <th className="px-4 py-3 font-medium">السعر</th>
                                                <th className="px-4 py-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map((item) => (
                                                <tr key={item.id} className="border-t">
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium">{item.drug.tradeName}</div>
                                                        {item.drug.scientificName && (
                                                            <div className="text-xs text-muted-foreground">{item.drug.scientificName}</div>
                                                        )}
                                                        <div className="font-mono text-xs text-muted-foreground">{item.barcode}</div>
                                                    </td>
                                                    <td className="px-4 py-3 font-medium">{item.price.toLocaleString('ar-IQ')}</td>
                                                    <td className="px-4 py-3 text-left">
                                                        <button
                                                            onClick={() => addToCart(item)}
                                                            className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                                                        >
                                                            + إضافة
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="rounded-xl border bg-card p-4 shadow-sm">
                                <h3 className="flex items-center gap-2 font-bold">
                                    <ShoppingCart className="h-4 w-4" /> طلبك ({cart.length})
                                </h3>
                                {cart.length === 0 ? (
                                    <p className="mt-3 text-sm text-muted-foreground">السلة فارغة — أضف أصنافاً من الكتالوج.</p>
                                ) : (
                                    <div className="mt-3 space-y-2">
                                        {cart.map((l) => (
                                            <div key={l.barcode} className="flex items-center gap-2 text-sm">
                                                <span className="flex-1 truncate">{l.tradeName}</span>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={l.quantity}
                                                    onChange={(e) =>
                                                        setCart((prev) =>
                                                            prev.map((x) =>
                                                                x.barcode === l.barcode
                                                                    ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) }
                                                                    : x
                                                            )
                                                        )
                                                    }
                                                    className="w-16 rounded border bg-muted px-2 py-1 text-center"
                                                />
                                                <button
                                                    onClick={() => setCart((prev) => prev.filter((x) => x.barcode !== l.barcode))}
                                                    className="text-xs text-destructive hover:underline"
                                                >
                                                    حذف
                                                </button>
                                            </div>
                                        ))}
                                        <div className="border-t pt-2 font-bold">
                                            الإجمالي المقدّر: {total.toLocaleString('ar-IQ')} د.ع
                                        </div>
                                    </div>
                                )}
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="ملاحظات للمذخر (اختياري)"
                                    rows={2}
                                    className="mt-3 w-full rounded-lg border bg-muted px-3 py-2 text-sm"
                                />
                                <button
                                    onClick={submit}
                                    disabled={submitting || cart.length === 0}
                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    إرسال الطلب للمذخر
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
