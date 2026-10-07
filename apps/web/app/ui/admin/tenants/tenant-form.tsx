"use client";
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Tenant, TenantPlan } from '@/app/lib/admin-tenants';
export default function TenantForm({ tenant, plans, onSaved, onCancel, onBusyChange }: {
  tenant?: Tenant; plans: TenantPlan[];
  onSaved: (result: any) => void; onCancel: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const editingId = tenant?.id;
  const initial = tenant?.plan ?? plans.find(p => p.name === 'FREE' && p.isActive) ?? plans.find(p => p.isActive) ?? plans[0];
  const [form, setForm] = useState({ name: tenant?.name ?? '', ownerName: '', ownerEmail: tenant?.ownerEmail ?? '', ownerPassword: '', phone: '',
    plan: tenant?.planId ?? initial?.id ?? '', maxBranches: tenant?.maxBranches ?? initial?.maxBranches ?? 1,
    maxUsers: tenant?.maxUsers ?? initial?.maxUsers ?? 3, maxDevices: tenant?.maxDevices ?? initial?.maxDevices ?? 1,
    maxMobileUsers: tenant?.maxMobileUsers ?? initial?.maxMobileUsers ?? 1, aiDailyLimit: tenant?.aiDailyLimit ?? 50,
    prescriptionScanDailyLimit: tenant?.prescriptionScanDailyLimit ?? 20, trialDays: 0 });
  const [showPassword, setShowPassword] = useState(false), [saving, setSaving] = useState(false);
  function handlePlanChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = plans.find(p => p.id === e.target.value);
    setForm(s => ({ ...s, plan: e.target.value, maxBranches: p?.maxBranches ?? s.maxBranches, maxUsers: p?.maxUsers ?? s.maxUsers,
      maxDevices: p?.maxDevices ?? 1, maxMobileUsers: p?.maxMobileUsers ?? 1 }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (saving) return; setSaving(true); onBusyChange?.(true);
    try {
      const { ownerName, ownerEmail, ownerPassword, phone, trialDays, ...update } = form;
      const r = await fetch(editingId ? `/api/admin/tenants/${editingId}` : '/api/admin/tenants', {
        method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? update : form) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'تعذر حفظ المؤسسة.');
      toast.success(editingId ? 'حُفظت بيانات المؤسسة.' : 'أُنشئت المؤسسة.'); onSaved(data);
    } catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر الحفظ.'); }
    finally { setSaving(false); onBusyChange?.(false); }
  }
  return <form onSubmit={submit} className="space-y-5" dir="rtl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input required placeholder="اسم المؤسسة *" aria-label="اسم المؤسسة" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        {!editingId && <>
                        <input placeholder="اسم المالك" aria-label="اسم المالك" value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" disabled={!!editingId} />
                        <input type="email" required={!editingId} placeholder="إيميل المالك *" aria-label="بريد المالك" value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted opacity-60" dir="ltr" disabled={!!editingId} />
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} required={!editingId} autoComplete="new-password" placeholder="كلمة المرور الافتراضية *" aria-label="كلمة المرور الافتراضية" value={form.ownerPassword} onChange={e => setForm({ ...form, ownerPassword: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-muted pl-10" dir="ltr" disabled={!!editingId} title={editingId ? "لا يمكن تعديل كلمة المرور من هنا" : ""} />
                            <button
                                type="button"
                                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                disabled={!!editingId}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <input placeholder="الهاتف" aria-label="الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm bg-muted" />
                        </>}
                        <select value={form.plan} onChange={handlePlanChange} aria-label="الباقة"
                            className="border rounded-lg px-3 py-2 text-sm bg-muted col-span-1 md:col-span-1">
                            {plans.map((p: any) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} - {p.price === 0 ? 'مجاني' : `${Number(p.price).toLocaleString('en-US')} IQD/شهر`}
                                </option>
                            ))}
                        </select>
                        <details className="col-span-1 md:col-span-2 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">الحدود والإعدادات المتقدمة</summary><div className="grid grid-cols-2 gap-3 pt-4">
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">حد الفروع (تجاوز)</label>
                                <input type="number" value={form.maxBranches} onChange={e => setForm({ ...form, maxBranches: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">حد المستخدمين (تجاوز)</label>
                                <input type="number" value={form.maxUsers} onChange={e => setForm({ ...form, maxUsers: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">حد الأجهزة (تجاوز، ‎-1 = غير محدود)</label>
                                <input type="number" value={form.maxDevices} onChange={e => setForm({ ...form, maxDevices: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">حد موبايل (تجاوز، ‎-1 = غير محدود)</label>
                                <input type="number" value={form.maxMobileUsers} onChange={e => setForm({ ...form, maxMobileUsers: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs text-muted-foreground mb-1">حد المساعد الذكي اليومي (رسالة/يوم)</label>
                                <input type="number" min="0" value={form.aiDailyLimit} onChange={e => setForm({ ...form, aiDailyLimit: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs text-muted-foreground mb-1">حد مسح الوصفات اليومي (مسح/يوم، لكل فرع)</label>
                                <input type="number" min="0" value={form.prescriptionScanDailyLimit} onChange={e => setForm({ ...form, prescriptionScanDailyLimit: Number(e.target.value) })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                            </div>
                            {!editingId && (
                                <div className="col-span-2">
                                    <label className="block text-xs text-muted-foreground mb-1">فترة تجريبية (أيام، 0 = بدون تجربة)</label>
                                    <input type="number" min="0" value={form.trialDays} onChange={e => setForm({ ...form, trialDays: Number(e.target.value) })}
                                        placeholder="مثال: 14" className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                                    {form.trialDays > 0 && (
                                        <p className="text-xs text-violet-600 mt-1">
                                            ستنتهي التجربة بعد {form.trialDays} يوم ثم يُقفل النظام تلقائياً (مع مهلة سماح 5 أيام).
                                        </p>
                                    )}
                                </div>
                            )}
                        </div></details>
                    </div>

    <div className="flex gap-2 border-t pt-4"><Button type="submit" disabled={saving || !form.name.trim() || (!editingId && (!form.ownerEmail || !form.ownerPassword))}>
      {saving ? 'جارٍ الحفظ…' : editingId ? 'حفظ التغييرات' : 'إنشاء المؤسسة'}
    </Button><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>إلغاء</Button></div>
  </form>;
}
