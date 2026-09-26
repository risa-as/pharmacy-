"use client";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { warehouseMutation } from '@/app/lib/warehouse-mutation-client';
type Item = { id: string; status: string; drug: { tradeName: string; barcode: string } };
export default function OrderSettlement({ orderId, items, canManageCustody }: { orderId: string; items: Item[]; canManageCustody: boolean }) {
    const [data, setData] = useState<any>(null), [returns, setReturns] = useState<any[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [purchaseId, setPurchaseId] = useState(''), [lines, setLines] = useState<Record<string, { purchaseItemId: string; unitsPerPack: string; batchIds: string[] }>>({});
    const [pharmacyPaymentSource, setPharmacyPaymentSource] = useState(''), [supplierPaymentId, setSupplierPaymentId] = useState('');
    const [reference, setReference] = useState(''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false);
    const base = `/api/warehouses/orders/${orderId}`;
    async function load() {
        const [a, b] = await Promise.all([fetch(`${base}/reconciliation`), fetch(`${base}/returns`)]);
        const [ad, bd] = await Promise.all([a.json(), b.json()]);
        if (!b.ok) throw new Error(bd.error);
        if (!a.ok && a.status !== 403) throw new Error(ad.error);
        setData(a.ok ? {...ad, canReconcile: true} : {canReconcile: false, receiptLinked: null, purchases: [], batches: [], proposals: [], supplierPayments: []}); setReturns(bd.returns); setError('');
    }
    useEffect(() => { load().catch(e => setError(e.message)); }, [orderId]);
    async function save(path: string, body: object, method = 'POST') {
        if (busy) return; setBusy(true);
        try {
            const r = await warehouseMutation(`${base}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error);
            toast.success('تم تسجيل العملية'); setConfirmed(false); await load();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'تعذر الحفظ'); } finally { setBusy(false); }
    }
    const purchase = data?.purchases.find((p: any) => p.id === purchaseId);
    const needsDocuments = data?.canReconcile && (!data.receiptLinked || data.proposals.length > 0);
    const needsCustody = canManageCustody && returns.some(r => (r.status === 'PENDING' && !r.dispatched) || (r.status === 'REJECTED' && !r.restored));
    return <details open className="my-4 rounded-lg border p-3"><summary className="cursor-pointer font-medium">المرتجعات والإشعارات الدائنة</summary>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : !data ? <p>جارٍ التحميل…</p> : <div className="mt-3 space-y-4 text-sm">
            {data.receiptLinked && <p className="text-xs text-muted-foreground">فاتورة الشراء ودفعات الاستلام مرتبطة بالطلب.</p>}
            {(needsDocuments || needsCustody) && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">بيانات تأكيد العملية</summary>
                {needsDocuments && <label className="mt-3 block">مرجع المستند<input className="mt-1 w-full rounded-md border p-2" value={reference} onChange={e => setReference(e.target.value)} /></label>}
                <label className="mt-3 block">مرجع التسليم / نتيجة الفحص<textarea className="mt-1 w-full rounded-md border p-2" value={note} onChange={e => setNote(e.target.value)} /></label>
                <label className="mt-2 flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />أؤكد صحة المستندات؛ وإعادة المرتجع المرفوض تتطلب وجوده فعليًا وفحص صلاحيته.</label>
            </details>}
            {!returns.length && <p className="text-muted-foreground">لا توجد طلبات إرجاع لهذا الطلب.</p>}
            {returns.map(r => <div key={r.id} className="rounded-md border p-3"><p>مرتجع {new Date(r.createdAt).toLocaleDateString('ar-IQ')} — {r.status === 'REJECTED' ? 'مرفوض' : r.status === 'ACCEPTED' ? 'مقبول' : 'بانتظار القرار'}</p>
                <div className="mt-3 divide-y">{r.items.map((i: any) => <div key={i.id ?? i.barcode} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="font-medium"><bdi>{items.find(item => item.drug.barcode === i.barcode)?.drug.tradeName ?? 'صنف من الطلب'}</bdi></p><bdi dir="ltr" title={i.barcode} className="block max-w-[22ch] truncate font-mono text-xs text-muted-foreground">{i.barcode}</bdi></div><span className="shrink-0">{i.quantity} باكيت</span></div>)}</div>
                <div className="mt-2 border-t pt-2 font-medium">قيمة المرتجع: {Number(r.totalAmount).toLocaleString('ar-IQ')} د.ع {r.creditNoteNumber && <span className="text-xs text-muted-foreground">· إشعار <bdi>{r.creditNoteNumber}</bdi></span>}</div>
                {r.status === 'ACCEPTED' && <p className="mt-2 text-xs text-success">قَبِل المذخر المرتجع وخُصمت قيمته من الفاتورة. لا يلزم إجراء إضافي هنا.</p>}
                {r.restored ? <p>أُعيدت الكمية إلى مخزون الصيدلية.</p> : r.status === 'REJECTED' && canManageCustody ? <><p className="my-2">تبقى الكمية محجوزة حتى تأكيد وجود البضاعة وفحصها. لا تؤكد قبل رجوعها فعليًا.</p><button disabled={busy || !confirmed || note.trim().length < 5} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={() => save('returns', { action: 'RESTORE', returnId: r.id, note, confirmedPresentAndSaleable: confirmed }, 'PATCH')}>تأكيد الاستلام والفحص وإعادة المخزون</button></> : r.status === 'PENDING' && !r.dispatched && canManageCustody ? <button disabled={busy || note.trim().length < 5} className="mt-2 rounded-lg border px-3 py-2 disabled:opacity-50" onClick={() => save('returns', { action: 'DISPATCH', returnId: r.id, note }, 'PATCH')}>تسجيل إرسال البضاعة للمذخر</button> : r.dispatched ? <p>سُجل إرسال البضاعة.</p> : null}
            </div>)}
            {data.proposals.map((p: any) => <div key={p.id} className="space-y-2 rounded-md border p-3"><h4 className="font-bold">مطابقة السداد — {p.reference}</h4><p>المذخر: {p.invoicePaid.toLocaleString('ar-IQ')} — الصيدلية: {p.purchasePaid.toLocaleString('ar-IQ')}</p><p>السداد بعد المطابقة: {p.targetPaid.toLocaleString('ar-IQ')} د.ع (لا يمثل دفعة نقدية جديدة).</p><p>{p.note}</p>{p.targetPaid > p.purchasePaid && <div className="space-y-2"><label className="block">هل السداد مسجل في دفتر المورد؟<select className="mt-1 w-full rounded-md border p-2" value={pharmacyPaymentSource} onChange={e => setPharmacyPaymentSource(e.target.value)}><option value="">اختر بعد مراجعة دفتر المورد</option><option value="EXISTING">نعم — تخصيص سند موجود دون خصم الرصيد مرة ثانية</option><option value="UNRECORDED">لا — إثبات سداد سابق غير مسجل وتخفيض رصيد المورد</option></select></label>{pharmacyPaymentSource === 'EXISTING' && <select aria-label="سند المورد" className="w-full rounded-md border p-2" value={supplierPaymentId} onChange={e => setSupplierPaymentId(e.target.value)}><option value="">اختر سند المورد الأصلي</option>{data.supplierPayments.map((v: any) => <option key={v.id} value={v.id}>{v.reference ?? v.id} — {v.amount} — {new Date(v.date).toLocaleDateString('ar-IQ')}</option>)}</select>}</div>}<button disabled={busy || !confirmed || reference.trim() !== p.reference || note.trim().length < 5} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={() => save('reconciliation', { action: 'CONFIRM_PAYMENT', proposalId: p.id, reference, note, confirmed, pharmacyPaymentSource, supplierPaymentId })}>اعتماد المطابقة بعد مراجعة السند</button></div>)}
            {data.canReconcile && !data.receiptLinked && <details className="rounded-md border p-3"><summary>إكمال ربط استلام قديم</summary><p className="my-2 text-muted-foreground">استخدم مستند الاستلام الأصلي. اختيار الدفعة تشابهًا بالاسم غير كافٍ. الخادم يتحقق من الفرع والمورد والدواء والكميات والتكلفة، ويسجل الربط باسمك.</p>
                <select className="w-full rounded-md border p-2" value={purchaseId} onChange={e => { setPurchaseId(e.target.value); setLines({}); }}><option value="">اختر فاتورة الاستلام</option>{data.purchases.map((p: any) => <option key={p.id} value={p.id}>{p.invoiceNumber ?? p.documentNumber} — {new Date(p.createdAt).toLocaleDateString('ar-IQ')} — {p.total}</option>)}</select>
                {purchase && items.filter(i => i.status !== 'OUT_OF_STOCK').map(item => {
                    const line = lines[item.id] ?? { purchaseItemId: '', unitsPerPack: '', batchIds: [] };
                    const patch = (value: Partial<typeof line>) => setLines(prev => ({ ...prev, [item.id]: { ...line, ...value } }));
                    const receipt = purchase.items.find((i: any) => i.id === line.purchaseItemId);
                    return <div className="my-2 space-y-2 rounded-md border p-2" key={item.id}><strong>{item.drug.tradeName}</strong>
                        <select aria-label="بند الاستلام" className="w-full rounded-md border p-2" value={line.purchaseItemId} onChange={e => patch({ purchaseItemId: e.target.value, batchIds: [] })}><option value="">اختر بند الاستلام المطابق</option>{purchase.items.filter((i: any) => i.cost > 0).map((i: any) => <option value={i.id} key={i.id}>{i.drug.tradeName} — {i.quantity} شريط — كلفة {i.cost}</option>)}</select>
                        <label className="block">عدد الأشرطة في العبوة<input type="number" min="1" className="mx-2 w-24 rounded-md border p-2" value={line.unitsPerPack} onChange={e => patch({ unitsPerPack: e.target.value })} /></label>
                        {receipt && data.batches.filter((b: any) => b.inventory.drugId === (receipt.receivedDrugId || receipt.drugId) && (!b.purchaseItemId || b.purchaseItemId === receipt.id)).map((b: any) => <label className="flex gap-2" key={b.id}><input type="checkbox" checked={line.batchIds.includes(b.id)} onChange={e => patch({ batchIds: e.target.checked ? [...line.batchIds, b.id] : line.batchIds.filter(id => id !== b.id) })} />{b.batchNumber} — صلاحية {new Date(b.expiryDate).toLocaleDateString('ar-IQ')} — كمية الاستلام {b.initialQuantity} — متبقي {b.quantity}</label>)}
                    </div>;
                })}
                <button disabled={busy || !confirmed || !purchase || reference.trim().length < 3 || note.trim().length < 5} className="mt-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" onClick={() => save('reconciliation', { action: 'LINK_RECEIPT', purchaseId, reference, note, confirmed, lines: Object.entries(lines).map(([orderItemId, l]) => ({ ...l, orderItemId, unitsPerPack: Number(l.unitsPerPack) })) })}>حفظ الربط الموثق</button>
            </details>}
        </div>}
    </details>;
}
