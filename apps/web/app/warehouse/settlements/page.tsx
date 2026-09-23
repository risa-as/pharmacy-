import { NextResponse } from 'next/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import PageHeader from '../_components/PageHeader';
import EmptyState from '../_components/EmptyState';
import { FileText, ArrowRight } from 'lucide-react';
export const dynamic = 'force-dynamic';
const labels: Record<string, string> = { OPENING_PAYMENT: 'قبض رصيد سابق', RETURN_REFUND: 'رد نقدي لمرتجع', PAYMENT_MATCH: 'مطابقة غير نقدية' };
export default async function Settlements({ searchParams }: { searchParams: Promise<{ page?: string; sourceId?: string; kind?: string; search?: string }> }) {
    const ctx = await getWarehouseContext(); if (ctx instanceof NextResponse) redirect('/login');
    const gate = await requireWarehousePermission(ctx, 'canViewFinance'); if (!gate.ok) return <EmptyState title="لا تملك صلاحية عرض السندات" />;
    const query = await searchParams;
    const page = Math.max(1, Math.min(1000000, Math.floor(Number(query.page) || 1)));
    const kind = query.kind && Object.hasOwn(labels,query.kind) ? query.kind : undefined;
    const search = query.search?.trim().slice(0,200);
    const where = { warehouseId: ctx.warehouseId, ...(query.sourceId ? { sourceId: query.sourceId } : {}), ...(kind?{kind}:{}), ...(search?{reference:{contains:search,mode:'insensitive' as const}}:{}) };
    const [entries, total] = await prisma.$transaction([prisma.warehouseSettlement.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50 }), prisma.warehouseSettlement.count({ where })]);
    const actors = await prisma.user.findMany({ where: { id: { in: entries.map(e => e.actorId) } }, select: { id: true, name: true, email: true } });
    const actorNames = new Map(actors.map(a => [a.id, a.name ?? a.email]));
    const link = (n: number) => `?${new URLSearchParams({ page: String(n), ...(query.sourceId ? { sourceId: query.sourceId } : {}),...(kind?{kind}:{}),...(search?{search}:{}) })}`;
    return <div dir="rtl" className="space-y-4">
        <PageHeader title="سندات التسوية" description="سجل موثق للقبض والرد والمطابقة؛ المطابقة ليست حركة نقدية جديدة." actions={<Link href="/warehouse/accounts" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><ArrowRight className="h-4 w-4"/> الحسابات</Link>}/>
        <form className="flex flex-wrap gap-3 rounded-lg border bg-card p-3">
            {query.sourceId&&<input type="hidden" name="sourceId" value={query.sourceId}/>}
            <input aria-label="بحث بمرجع السند" name="search" defaultValue={search} placeholder="بحث بمرجع السند" maxLength={200} className="min-w-40 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"/>
            <select aria-label="نوع السند" name="kind" defaultValue={kind??''} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">كل أنواع السندات</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">تطبيق</button><Link href="/warehouse/settlements" className="px-3 py-2 text-sm text-muted-foreground">مسح الفلاتر</Link>
        </form>
        {entries.length?<div className="overflow-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{['التاريخ', 'النوع', 'المرجع', 'المبلغ (د.ع)', 'التوثيق'].map(h => <th key={h} className="p-3 text-right">{h}</th>)}</tr></thead><tbody>{entries.map(e => <tr key={e.id} className="border-t hover:bg-muted/20"><td className="whitespace-nowrap p-3">{e.createdAt.toLocaleString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad' })}</td><td className="p-3">{labels[e.kind] ?? e.kind}</td><td className="p-3"><bdi>{e.reference}</bdi></td><td className="p-3 font-semibold tabular-nums">{e.amount.toLocaleString('ar-IQ-u-nu-latn')}</td><td className="p-3"><details><summary className="cursor-pointer whitespace-nowrap text-primary">عرض السند</summary><div className="min-w-56 max-w-sm space-y-2 rounded-lg bg-muted/40 p-3 text-xs"><p className="break-all">رقم السند: {e.documentNumber}</p><p>المسجل: {actorNames.get(e.actorId) ?? 'مستخدم سابق'}</p>{e.kind === 'OPENING_PAYMENT' && <><p>الرصيد السابق: {String((e.details as any).before)}</p><p>المتبقي: {String((e.details as any).after)}</p></>}{e.kind === 'PAYMENT_MATCH' && <><p>السداد قبل المطابقة — المذخر: {String((e.details as any).invoicePaid)} / الصيدلية: {String((e.details as any).purchasePaid)}</p><p>السداد بعد المطابقة: {String((e.details as any).targetPaid)}</p><p>{String((e.details as any).pharmacyNote ?? '')}</p></>}{e.kind === 'RETURN_REFUND' && <p>رد نقدي مرتبط بإشعار دائن بمبلغ {e.amount.toLocaleString('ar-IQ-u-nu-latn')} د.ع.</p>}</div></details></td></tr>)}</tbody></table></div>:<EmptyState icon={<FileText className="h-6 w-6"/>} title="لا توجد سندات مطابقة" description="تظهر هنا سندات تسوية الرصيد الافتتاحي والمرتجعات والمطابقة عند تسجيلها."/>}
        {total>0&&<div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{total.toLocaleString('ar-IQ-u-nu-latn')} سند</span><div className="flex gap-3">{page > 1 && <Link href={link(page - 1)}>السابق</Link>}{page * 50 < total && <Link href={link(page + 1)}>التالي</Link>}</div></div>}
    </div>;
}
