'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { privacyStatusLabel, type PrivacyStatus } from '@/app/lib/privacy-request-labels';
type Row = { id: string; userName: string; organizationId: string | null; status: PrivacyStatus; response: string; createdAt: string };
export default function PrivacyRequestsPage() {
    const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [page, setPage] = useState(1), [total, setTotal] = useState(0);
    async function load() { const r = await fetch(`/api/admin/privacy-requests?page=${page}`, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'تعذر تحميل الطلبات'); setRows(d.requests); setTotal(d.total); }
    useEffect(() => { void load().catch(e => setError(e.message)); }, [page]);
    async function save(row: Row) { setBusy(true); setError(''); try { const r = await fetch('/api/admin/privacy-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, status: row.status, response: row.response }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'تعذر الحفظ'); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ'); } finally { setBusy(false); } }
    return <div dir="rtl" className="space-y-6">
        <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">طلبات الخصوصية وحذف الحساب</h1><p className="mt-2 text-sm text-muted-foreground">تحقق من هوية الطالب وصلاحيته، ودوّن مدة المعالجة والسجلات المحتفظ بها. تغيير الحالة لا يحذف أي حساب أو بيانات تلقائياً.</p></div><Button variant="outline" disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>تحديث</Button></div>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">{error}</p>}
        {!rows.length && !error && <p className="rounded-xl border bg-card p-8 text-muted-foreground">لا توجد طلبات في هذه الصفحة.</p>}
        {rows.map(row => <section key={row.id} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{row.userName}</h2><span className="text-sm text-muted-foreground">{new Date(row.createdAt).toLocaleString('ar-IQ')}</span></div>
            <p className="break-all text-xs text-muted-foreground">رقم الطلب: {row.id} · المؤسسة: {row.organizationId ?? 'حساب منصة'}</p>
            <label className="block space-y-2 text-sm"><span>حالة الطلب</span><select className="block w-full rounded-lg border bg-background p-3" value={row.status} disabled={busy} onChange={e => setRows(old => old.map(r => r.id === row.id ? { ...r, status: e.target.value as PrivacyStatus } : r))}>{Object.entries(privacyStatusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="block space-y-2 text-sm"><span>رد يظهر لصاحب الطلب</span><textarea className="block min-h-28 w-full rounded-lg border bg-background p-3" maxLength={2000} value={row.response} disabled={busy} placeholder="وضح التحقق والمدة المتوقعة والنتيجة والبيانات التي يلزم الاحتفاظ بها وسبب ذلك، دون تفاصيل مرضى." onChange={e => setRows(old => old.map(r => r.id === row.id ? { ...r, response: e.target.value } : r))} /></label>
            <Button disabled={busy || row.response.trim().length < 10} onClick={() => void save(row)}>حفظ الحالة والرد</Button>
        </section>)}
        <div className="flex items-center justify-between"><Button variant="outline" disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>السابق</Button><span className="text-sm text-muted-foreground">{total} طلب · الصفحة {page}</span><Button variant="outline" disabled={page * 30 >= total || busy} onClick={() => setPage(p => p + 1)}>التالي</Button></div>
    </div>;
}
