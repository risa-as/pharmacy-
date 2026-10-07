"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import { recordManualPayment } from '@/app/lib/actions/billing';
import { Button } from '@/components/ui/button';
import TenantDialog from './tenant-dialog';
import type { Tenant } from '@/app/lib/admin-tenants';

export default function TenantPaymentDialog({ tenant, onClose, onSaved }: { tenant: Tenant; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ amount: String(tenant.monthlyPrice || ''), months: '1', method: 'BANK_TRANSFER', reference: '', note: '' });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true);
    try {
      const r = await recordManualPayment(tenant.id, Number(form.amount), Number(form.months), form.method as 'MANUAL' | 'BANK_TRANSFER', form.reference || undefined, form.note || undefined);
      if (!r.success) throw new Error(r.error); toast.success('سُجلت الدفعة وجُدد الاشتراك.'); onSaved();
    } catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر تسجيل الدفعة.'); }
    finally { setBusy(false); }
  }
  const input = 'mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm';
  return <TenantDialog title={`تجديد الاشتراك — ${tenant.name}`} onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">سجّل دفعة استُلمت خارج النظام. هذه دفعة اشتراك فاراماس، وليست شحن محفظة WhatsApp.</p>
      <label className="block text-sm">المبلغ (د.ع)<input required min="1" type="number" dir="ltr" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={input} /></label>
      <label className="block text-sm">مدة التجديد<select value={form.months} onChange={e => setForm({ ...form, months: e.target.value })} className={input}>
        <option value="1">شهر واحد</option><option value="3">3 أشهر</option><option value="6">6 أشهر</option><option value="12">سنة كاملة</option>
      </select></label>
      <label className="block text-sm">طريقة الدفع<select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className={input}>
        <option value="BANK_TRANSFER">تحويل بنكي</option><option value="MANUAL">نقدًا / يدوي</option>
      </select></label>
      <label className="block text-sm">رقم الوصل أو الحوالة (اختياري)<input dir="ltr" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className={input} /></label>
      <label className="block text-sm">ملاحظات<input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className={input} /></label>
      <div className="flex gap-2 border-t pt-4"><Button disabled={busy || !(Number(form.amount) > 0)}>{busy ? 'جارٍ التسجيل…' : 'تأكيد استلام الدفعة'}</Button>
        <Button variant="outline" type="button" onClick={onClose} disabled={busy}>إلغاء</Button></div>
    </form>
  </TenantDialog>;
}
