"use client";
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, ShieldCheck, ShieldOff, RefreshCw, Package, Users, Receipt, Banknote, Calendar, Hourglass } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import StatCard from '@/app/ui/dashboard/stat-card';
import { useConfirm } from '@/app/ui/confirm-dialog';
import { suspendOrganization, reactivateOrganization } from '@/app/lib/actions/organization-suspension';
import { TENANT_TABS, tenantHref, tenantDate, type TenantDetailData, type TenantTab } from '@/app/lib/admin-tenants';
import TenantPaymentDialog from './tenant-payment-dialog';
import TenantTrialDialog from './tenant-trial-dialog';
import TenantDialog from './tenant-dialog';
import TenantForm from './tenant-form';
const WhatsAppConnectionPanel = dynamic(() => import('../whatsapp-connection-panel'), { loading: () => <p className="p-6 text-muted-foreground">جارٍ تحميل إعدادات WhatsApp…</p> });
const PlanOverridesPanel = dynamic(() => import('../PlanOverridesPanel'), { loading: () => <p className="p-6 text-muted-foreground">جارٍ تحميل إعدادات الخطة…</p> });
const number = (n: number) => n.toLocaleString('en-US');

export default function TenantDetail({ data, tab }: { data: TenantDetailData; tab: TenantTab }) {
  const router = useRouter(), tenant = data.tenant;
  const [renew, setRenew] = useState(false), [trial, setTrial] = useState(false), [edit, setEdit] = useState(false), [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false), [formBusy, setFormBusy] = useState(false), [confirmationName, setConfirmationName] = useState('');
  const { confirm, dialog } = useConfirm();
  async function toggle() {
    if (tenant.isActive && !await confirm({ variant: 'warning', title: 'تعليق المؤسسة', message: `سيُوقف العمل على الأجهزة المرتبطة بمؤسسة «${tenant.name}».`, confirmText: 'تعليق المؤسسة', cancelText: 'إلغاء' })) return;
    setBusy(true);
    try { const r = await (tenant.isActive ? suspendOrganization(tenant.id) : reactivateOrganization(tenant.id)); if (!r.success) throw new Error(r.error); toast.success(tenant.isActive ? 'عُلقت المؤسسة.' : 'فُعلت المؤسسة.'); router.refresh(); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر تغيير الحالة.'); } finally { setBusy(false); }
  }
  async function remove(e: React.FormEvent) {
    e.preventDefault(); if (busy || confirmationName !== tenant.name) return; setBusy(true);
    try { const r = await fetch(`/api/admin/tenants/${tenant.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationName }) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error || 'تعذر حذف المؤسسة.'); toast.success('حُذفت المؤسسة.'); router.push('/dashboard/admin/tenants'); router.refresh();
    } catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر الحذف.'); } finally { setBusy(false); }
  }
  return <div className="space-y-6" dir="rtl">
    {dialog}
    <Link href="/dashboard/admin/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" />العودة إلى المؤسسات</Link>
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
      <div><div className="flex flex-wrap items-center gap-3"><Building2 className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">{tenant.name}</h1><span className={`rounded-full px-2.5 py-1 text-xs ${tenant.isActive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{tenant.isActive ? 'فعالة' : 'معلّقة'}</span></div>
        <p className="mt-2 text-sm text-muted-foreground"><bdi>{tenant.ownerEmail}</bdi></p><p className="mt-1 text-xs text-muted-foreground">{tenant.plan?.name ?? 'بدون خطة'} · انتهاء الاشتراك: {tenantDate(tenant.subscriptionEndsAt)}{tenant.isTrial ? ' · فترة تجريبية' : ''}</p>
      </div>
      <div className="flex gap-2"><Button variant="outline" aria-label="تحديث بيانات المؤسسة" onClick={() => router.refresh()} disabled={busy}><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="outline" onClick={() => void toggle()} disabled={busy}>{tenant.isActive ? <ShieldOff className="ml-2 h-4 w-4" /> : <ShieldCheck className="ml-2 h-4 w-4" />}{busy ? 'جارٍ التنفيذ…' : tenant.isActive ? 'تعليق المؤسسة' : 'تفعيل المؤسسة'}</Button></div>
    </header>
    <nav aria-label="أقسام المؤسسة" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5">
      {TENANT_TABS.map(t => <Link key={t.id} href={tenantHref(tenant.id, t.id)} prefetch={false} aria-current={tab === t.id ? 'page' : undefined}
        className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{t.label}</Link>)}
    </nav>
    {tab === 'overview' && data.stats && <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="الفروع" value={data.stats.branchCount} icon={Building2} tone="primary" />
        <StatCard label="المستخدمون" value={data.stats.userCount} icon={Users} tone="info" />
        <StatCard label="أصناف المخزون" value={number(data.stats.productCount)} icon={Package} tone="success" />
        <StatCard label="فواتير المبيعات" value={number(data.stats.salesCount)} icon={Receipt} tone="primary" />
        <StatCard label="إجمالي مبالغ فواتير المبيعات" value={number(data.stats.salesTotal)} unit="د.ع" icon={Banknote} tone="success" />
        <StatCard label="آخر عملية بيع" value={data.stats.lastSaleAt ? tenantDate(data.stats.lastSaleAt) : 'لا توجد مبيعات'} icon={Calendar} tone="muted" valueClassName="text-xl" />
      </div><p className="text-xs text-muted-foreground">الإحصاءات تخص كامل سجل المؤسسة؛ إجمالي الفواتير هنا ليس صافي المبيعات أو الأرباح.</p>
    </>}
    {tab === 'subscription' && <>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"><div><h2 className="font-bold">اشتراك فاراماس</h2><p className="mt-1 text-sm text-muted-foreground">{tenant.plan?.name ?? 'غير محدد'} · {number(tenant.monthlyPrice)} د.ع / شهر</p><p className="mt-1 text-sm">ينتهي في {tenantDate(tenant.subscriptionEndsAt)}</p></div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => setRenew(true)}><Banknote className="ml-2 h-4 w-4" />تسجيل دفعة وتجديد</Button><Button variant="outline" onClick={() => setTrial(true)}><Hourglass className="ml-2 h-4 w-4" />فترة تجريبية</Button></div></section>
      <section className="overflow-hidden rounded-xl border bg-card"><h2 className="border-b px-5 py-4 font-bold">آخر 50 عملية دفع للاشتراك</h2><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-right text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr>{['التاريخ', 'المبلغ', 'الطريقة', 'الحالة', 'مدة التجديد'].map(h => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.payments?.map(p => <tr key={p.id} className="border-t"><td className="px-5 py-3">{tenantDate(p.createdAt)}</td><td className="px-5 py-3">{number(p.amount)} {p.currency}</td><td className="px-5 py-3">{{ MANUAL: 'نقدي / يدوي', BANK_TRANSFER: 'تحويل بنكي', ZAINCASH: 'ZainCash' }[p.gateway] ?? p.gateway}</td><td className="px-5 py-3">{{ COMPLETED: 'مكتملة', PENDING: 'منتظرة', FAILED: 'فشلت', EXPIRED: 'منتهية' }[p.status] ?? p.status}</td><td className="px-5 py-3">{p.renewalMonths} شهر</td></tr>)}</tbody></table></div>{!data.payments?.length && <p className="p-8 text-center text-sm text-muted-foreground">لا توجد دفعات اشتراك مسجلة.</p>}</section>
    </>}
    {tab === 'limits' && <section className="space-y-5 rounded-xl border bg-card p-5"><div><h2 className="font-bold">الحدود والميزات</h2><p className="mt-1 text-sm text-muted-foreground">اضبط حدود المؤسسة وتجاوزات خطتها.</p></div><PlanOverridesPanel organizationId={tenant.id} organizationName={tenant.name} plans={data.plans ?? []} />
      <DailyLimits key={`${tenant.aiDailyLimit}:${tenant.prescriptionScanDailyLimit}`} tenant={tenant} onSaved={() => router.refresh()} />
    </section>}
    {tab === 'whatsapp' && <div className="space-y-3"><p className="text-sm text-muted-foreground">إدارة الاتصال والمشاركة ومحفظة الرسائل لهذه المؤسسة. <Link href="/dashboard/admin/whatsapp-pricing" className="text-primary underline">أسعار المنصة العامة</Link></p><WhatsAppConnectionPanel organizationId={tenant.id} organizationName={tenant.name} /></div>}
    {tab === 'settings' && <>
      <section className="flex items-center justify-between gap-4 rounded-xl border bg-card p-5"><div><h2 className="font-bold">بيانات المؤسسة</h2><p className="mt-1 text-sm text-muted-foreground">تعديل الاسم والإعدادات الحالية. حدود الخطة متاحة أيضًا في تبويبها.</p></div><Button variant="outline" onClick={() => setEdit(true)}>تعديل البيانات</Button></section>
      <section className="space-y-3 rounded-xl border border-destructive/25 bg-card p-5"><h2 className="font-bold text-destructive">منطقة الخطر</h2><p className="text-sm text-muted-foreground">الحذف نهائي. لتعليق العمل مؤقتًا استخدم زر التعليق في رأس الصفحة.</p><Button variant="destructive" onClick={() => { setConfirmationName(''); setDeleting(true); }}>حذف المؤسسة نهائيًا</Button></section>
    </>}
    {renew && <TenantPaymentDialog tenant={tenant} onClose={() => setRenew(false)} onSaved={() => { setRenew(false); router.refresh(); }} />}
    {trial && <TenantTrialDialog tenant={tenant} onClose={() => setTrial(false)} onSaved={() => { setTrial(false); router.refresh(); }} />}
    {edit && <TenantDialog title={`تعديل ${tenant.name}`} busy={formBusy} onClose={() => setEdit(false)} wide><TenantForm onBusyChange={setFormBusy} tenant={tenant} plans={data.plans ?? []} onCancel={() => setEdit(false)} onSaved={() => { setEdit(false); router.refresh(); }} /></TenantDialog>}
    {deleting && <TenantDialog title="تأكيد الحذف النهائي" busy={busy} onClose={() => setDeleting(false)}><form onSubmit={remove} className="space-y-4"><p className="text-sm text-muted-foreground">سيُحذف السجل وما يسمح النظام بحذفه من بياناته المرتبطة. لا يمكن التراجع عن هذا الإجراء.</p><label className="block text-sm">اكتب اسم المؤسسة: <strong>{tenant.name}</strong><input autoComplete="off" value={confirmationName} onChange={e => setConfirmationName(e.target.value)} disabled={busy} className="mt-2 w-full rounded-lg border bg-background px-3 py-2" /></label><div className="flex gap-2"><Button variant="destructive" disabled={busy || confirmationName !== tenant.name}>{busy ? 'جارٍ الحذف…' : 'حذف نهائيًا'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDeleting(false)}>إلغاء</Button></div></form></TenantDialog>}
  </div>;
}
function DailyLimits({ tenant, onSaved }: { tenant: TenantDetailData['tenant']; onSaved: () => void }) {
  const [ai, setAi] = useState(tenant.aiDailyLimit), [scan, setScan] = useState(tenant.prescriptionScanDailyLimit), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); try {
    const r = await fetch(`/api/admin/tenants/${tenant.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiDailyLimit: ai, prescriptionScanDailyLimit: scan }) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'تعذر الحفظ.'); toast.success('حُفظت الحدود اليومية.'); onSaved();
  } catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر الحفظ.'); } finally { setBusy(false); } }
  return <form onSubmit={submit} className="space-y-4 border-t pt-5"><h3 className="text-sm font-bold">حدود الاستخدام اليومية</h3><div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm">رسائل المساعد الذكي / يوم<input type="number" min="0" step="1" required value={ai} onChange={e => setAi(Number(e.target.value))} className="mt-1 block w-full rounded-lg border bg-background p-2" dir="ltr" /></label>
    <label className="text-sm">مسح الوصفات / يوم لكل فرع<input type="number" min="0" step="1" required value={scan} onChange={e => setScan(Number(e.target.value))} className="mt-1 block w-full rounded-lg border bg-background p-2" dir="ltr" /></label></div><Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الحدود اليومية'}</Button></form>;
}
