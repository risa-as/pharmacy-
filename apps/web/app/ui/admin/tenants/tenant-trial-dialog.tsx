"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import { startTrial } from '@/app/lib/actions/organization-suspension';
import { Button } from '@/components/ui/button';
import TenantDialog from './tenant-dialog';
import type { Tenant } from '@/app/lib/admin-tenants';
export default function TenantTrialDialog({ tenant, onClose, onSaved }: { tenant: Tenant; onClose: () => void; onSaved: () => void }) {
  const [days, setDays] = useState('14'), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true);
    try { const r = await startTrial(tenant.id, Number(days)); if (!r.success) throw new Error(r.error); toast.success('فُعلت الفترة التجريبية.'); onSaved(); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر التفعيل.'); } finally { setBusy(false); }
  }
  return <TenantDialog title={`فترة تجريبية — ${tenant.name}`} onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">تُفعّل المؤسسة للمدة المحددة. بعد انتهائها ومع مهلة السماح الحالية (5 أيام)، يُقفل النظام حتى التجديد.</p>
      <label className="block text-sm">عدد الأيام<input type="number" required min="1" step="1" value={days} onChange={e => setDays(e.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" dir="ltr" /></label>
      <div className="flex gap-2">{['7', '14', '30'].map(d => <Button key={d} type="button" variant={days === d ? 'default' : 'outline'} size="sm" onClick={() => setDays(d)}>{d} يوم</Button>)}</div>
      <div className="flex gap-2 border-t pt-4"><Button disabled={busy || Number(days) < 1}>{busy ? 'جارٍ التفعيل…' : 'بدء الفترة التجريبية'}</Button><Button type="button" variant="outline" onClick={onClose} disabled={busy}>إلغاء</Button></div>
    </form>
  </TenantDialog>;
}
