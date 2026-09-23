"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import Modal from '../_components/Modal';
import { warehouseMutation } from '@/app/lib/warehouse-mutation-client';
export default function PaymentMatch({ invoiceId }: { invoiceId: string }) {
    const [open, setOpen] = useState(false), [reference, setReference] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
    async function send() {
        if (busy) return; setBusy(true);
        try {
            const r = await warehouseMutation(`/api/warehouse-portal/invoices/${invoiceId}/reconciliation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, note }) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error); toast.success(d.message); setOpen(false);
        } catch (e) { toast.error(e instanceof Error ? e.message : 'تعذرت المطابقة'); } finally { setBusy(false); }
    }
    return <><button onClick={() => setOpen(true)} className="rounded-md border px-2 py-1 text-xs">مطابقة السداد</button>
        <Modal open={open} onClose={() => !busy && setOpen(false)} title="طلب مطابقة السداد"><div className="space-y-3 rounded-lg bg-card p-5">
            <h3 className="font-bold">مطابقة السداد مع الصيدلية</h3><p className="text-sm">يراجع مدير الصيدلية قيم السداد في الطرفين ويؤكد المستند. لن يتغير أي رصيد قبل موافقته، ولن تُسجل دفعة نقدية جديدة.</p>
            <label className="block">مرجع مستند السداد<input value={reference} onChange={e => setReference(e.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
            <label className="block">مصدر المطابقة وتفسير الفرق<textarea value={note} onChange={e => setNote(e.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
            <button disabled={busy || reference.trim().length < 3 || note.trim().length < 5} onClick={send} className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">إرسال للمراجعة</button>
        </div></Modal></>;
}
