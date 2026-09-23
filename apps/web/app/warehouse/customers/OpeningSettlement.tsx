"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import Modal from '../_components/Modal';
import { warehouseMutation } from '@/app/lib/warehouse-mutation-client';
export default function OpeningSettlement({ customerId, remaining, canPay, onPaid }: { customerId: string; remaining: number; canPay: boolean; onPaid: (remaining: number) => void }) {
    const [open, setOpen] = useState(false), [amount, setAmount] = useState(''), [reference, setReference] = useState(''), [busy, setBusy] = useState(false);
    async function save() {
        if (busy) return; setBusy(true);
        try {
            const r = await warehouseMutation('/api/warehouse-portal/settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'OPENING_PAYMENT', customerId, amount: Number(amount), reference }) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error);
            onPaid(d.remaining); setOpen(false); setAmount(''); setReference(''); toast.success('تم حفظ سند سداد الرصيد السابق');
        } catch (e) { toast.error(e instanceof Error ? e.message : 'تعذر السداد'); } finally { setBusy(false); }
    }
    return <div className="mt-1 flex gap-2 text-xs">
        {canPay && remaining > 0 && <button className="text-primary" onClick={() => setOpen(true)}>تسجيل سداد</button>}
        <Link className="text-primary" href={`/warehouse/settlements?sourceId=${customerId}`}>السندات</Link>
        <Modal open={open} onClose={() => !busy && setOpen(false)} title="سداد الرصيد السابق"><div className="space-y-3 rounded-lg bg-card p-5">
            <h3 className="font-bold">تسجيل سند قبض — المتبقي {remaining.toLocaleString('ar-IQ-u-nu-latn')}</h3>
            <label className="block">المبلغ<input className="mt-1 w-full rounded-md border p-2" type="number" min="0.01" max={remaining} value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <label className="block">مرجع سند القبض<input className="mt-1 w-full rounded-md border p-2" value={reference} onChange={e => setReference(e.target.value)} /></label>
            <p>سجّل السند بعد استلام المال فعليًا. المرجع نفسه لا يُسجل مرتين.</p>
            <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !amount || reference.trim().length < 3} onClick={save}>تأكيد السداد</button>
        </div></Modal>
    </div>;
}
