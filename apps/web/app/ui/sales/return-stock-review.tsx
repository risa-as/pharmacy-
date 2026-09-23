"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function ReturnStockReview({ id, batches }: { id: string; batches: { id: string; label: string }[] }) {
    const [batchId, setBatch] = useState(''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [batchNumber, setNumber] = useState(''), [expiryDate, setExpiry] = useState('');
    const router = useRouter();
    async function submit(action: 'RESTOCKED' | 'DISPOSED') {
        if (busy) return; setBusy(true); setError('');
        try { const r = await fetch(`/api/returns/items/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, batchId: batchId === '__new' ? undefined : batchId, newBatch: batchId === '__new' && action === 'RESTOCKED' ? { batchNumber, expiryDate: new Date(expiryDate + 'T00:00:00+03:00').toISOString() } : undefined, note, confirmed }) }); const body = await r.json(); if (!r.ok) throw new Error(body.message); router.refresh(); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }
    return <details className="mt-2 rounded-md border border-warning/30 bg-warning/5 p-3 min-w-64">
        <summary className="cursor-pointer font-medium text-warning">بانتظار فحص المخزون — لم يُضف للبيع</summary>
        <p className="my-2 text-xs">اعزل المرتجع. طابق رقم الدفعة والصلاحية المكتوبين على العبوة وافحص سلامتها وظروف التخزين. هذا القرار لا يكرر رد المبلغ. تسجيل التالف يحتسب تكلفته كمصروف مرة واحدة.</p>
        <select aria-label="دفعة العبوة المرتجعة" className="w-full border rounded-md p-2 bg-background" value={batchId} onChange={e => setBatch(e.target.value)}><option value="">اختر الدفعة المطابقة فعليًا</option><option value="__new">الدفعة غير موجودة — توثيقها من العبوة</option>{batches.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
        {batchId === "__new" && <div className="grid grid-cols-2 gap-2 mt-2"><input aria-label="رقم الدفعة على العبوة" placeholder="رقم الدفعة على العبوة" className="min-w-0 border rounded-md p-2 bg-background" value={batchNumber} onChange={e => setNumber(e.target.value)} /><input aria-label="الصلاحية على العبوة" type="date" className="min-w-0 border rounded-md p-2 bg-background" value={expiryDate} onChange={e => setExpiry(e.target.value)} /><p className="col-span-2 text-xs">أدخل بيانات العبوة الفعلية فقط. تُحفظ تكلفة البيع الأصلية ولا يُنشأ شراء أو التزام للمورد.</p></div>}
        <textarea aria-label="نتيجة فحص المرتجع" className="mt-2 w-full border rounded-md p-2 bg-background" placeholder="نتيجة الفحص ودليل مطابقة الدفعة" value={note} onChange={e => setNote(e.target.value)} />
        <label className="flex gap-2 my-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />أؤكد فحص المرتجع وتوثيق القرار.</label>
        <div className="flex gap-2"><button disabled={busy || !confirmed || note.trim().length < 5 || !batchId || (batchId === "__new" && (!batchNumber.trim() || !expiryDate))} onClick={() => submit('RESTOCKED')} className="rounded-md border px-3 py-1.5 disabled:opacity-40">{busy ? 'جارٍ الحفظ…' : 'اعتماد وإعادة للمخزون'}</button><button disabled={busy || !confirmed || note.trim().length < 5} onClick={() => submit('DISPOSED')} className="rounded-md border px-3 py-1.5 text-destructive disabled:opacity-40">تسجيل تالف</button></div>
        {error && <p role="alert" className="text-destructive mt-2">{error}</p>}
    </details>;
}
