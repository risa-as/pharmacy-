'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type Lot = { id: string; barcode: string; batchNumber: string; expiryDate: string; quantity: number };
export default function ReturnInspection({ returnId, items, canRelease, canDispose, onSaved }: {
    returnId: string; items: { id: string; barcode: string; drugName?: string | null; quantity: number }[]; canRelease: boolean; canDispose: boolean;
    onSaved: (items: {id: string; disposition: string}[]) => void;
}) {
    const [lots, setLots] = useState<Lot[]>([]);
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const sending = useRef(false);
    const [loading, setLoading] = useState(true);
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [error, setError] = useState('');
    useEffect(() => {
        let alive = true;
        fetch(`/api/warehouse-portal/returns/${returnId}/inspection`).then(async res => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (alive) setLots(Array.from(new Map<string, Lot>((data.batches as Lot[]).map(b => [b.id, b])).values()));
        }).catch(e => { if (alive) setError(e.message ?? 'تعذر جلب الدفعات'); }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [returnId]);
    const itemLots = (item: typeof items[number]) => lots.filter(lot => lot.barcode === item.barcode && new Date(lot.expiryDate) > new Date());
    const allocations = (item: typeof items[number]) => itemLots(item).map(b => ({batchId: b.id, quantity: Number(quantities[item.id + ':' + b.id] || 0)})).filter(a => a.quantity > 0);
    const ready = (item: typeof items[number]) => checked[item.id] && allocations(item).reduce((sum, a) => sum + a.quantity, 0) === item.quantity && allocations(item).every(a => Number.isSafeInteger(a.quantity));
    async function save(action: 'RELEASED' | 'DISPOSED', selected: typeof items) {
        if (sending.current || !selected.length) return;
        sending.current = true;
        setBusy(true);
        try {
            const res = await fetch(`/api/warehouse-portal/returns/${returnId}/inspection`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, note, items: selected.map(item => ({itemId: item.id, allocations: allocations(item)})) }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onSaved(data.items);
            toast.success('حُفظ الفحص وحركة المخزون');
        } catch (e) { toast.error(e instanceof Error ? e.message : 'تعذر الحفظ'); }
        finally { sending.current = false; setBusy(false); }
    }
    return <section className="mt-4 space-y-3 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">فحص الأصناف المحجوزة</h3>
            {canRelease && <button disabled={busy || loading || !!error || note.trim().length < 5 || !items.every(ready)} className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50" onClick={() => save('RELEASED', items)}>اعتماد جميع الأدوية وإعادتها للمخزون ({items.length})</button>}
        </div>
        <p className="text-xs leading-6 text-muted-foreground">أدخل كمية كل دفعة، وأكّد فحص العبوة والتخزين والصلاحية لكل دواء. تُحفظ عملية الاعتماد الجماعي كاملة أو لا يُحفظ أي صنف منها.</p>
        {loading && <p role="status">جارٍ تحميل دفعات الشحن…</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {items.map(item => <details key={item.id} open className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium"><bdi>{item.drugName || 'دواء غير مسمى'}</bdi> · {item.quantity} باكيت في الحجر</summary>
            {!loading && !error && !itemLots(item).length && <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs leading-6 text-amber-900">لا توجد دفعة شحن أصلية صالحة مرتبطة بهذا الصنف. يلزم تدقيق وربط سجل الشحن القديم قبل الإعادة للمخزون؛ كتابة ملاحظة وحدها لا تكفي.</p>}
            {canRelease && itemLots(item).map(lot => <label key={lot.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span><bdi>{lot.batchNumber}</bdi> · الصلاحية {lot.expiryDate.slice(0,10)}</span>
                <input disabled={busy} aria-label={`كمية ${item.drugName} في الدفعة ${lot.batchNumber}`} className="w-20 rounded-md border p-2" type="number" min="0" step="1" max={Math.min(item.quantity,lot.quantity)} value={quantities[item.id + ':' + lot.id] ?? ''} onChange={e => setQuantities(prev => ({ ...prev, [item.id + ':' + lot.id]: e.target.value }))} />
            </label>)}
            {canRelease && itemLots(item).length > 0 && <label className="mt-3 flex items-center gap-2 text-xs"><input disabled={busy} type="checkbox" checked={!!checked[item.id]} onChange={e => setChecked(prev => ({...prev,[item.id]:e.target.checked}))} />فحصت العبوة والتخزين ورقم الدفعة والصلاحية وهي مناسبة للبيع</label>}
            <div className="mt-3 flex flex-wrap gap-2">
                {canRelease && <button disabled={busy || loading || !!error || !ready(item) || note.trim().length < 5} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50" onClick={() => save('RELEASED',[item])}>اعتماد الصلاحية وإعادة للمخزون</button>}
                {canDispose && <button disabled={busy || note.trim().length < 5} className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-50" onClick={() => save('DISPOSED',[item])}>تسجيل الإتلاف من الحجر</button>}
            </div>
        </details>)}
        <label className="block text-xs font-medium">نتيجة الفحص وسبب القرار (5 أحرف على الأقل)
            <textarea disabled={busy} placeholder="اكتب نتيجة الفحص للأصناف المراد اعتمادها" className="mt-2 w-full rounded-lg border bg-background p-3 text-sm" value={note} onChange={e => setNote(e.target.value)} />
        </label>
    </section>;
}
