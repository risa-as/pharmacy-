import ContactFooter from '@/app/warehouse/print/_components/ContactFooter';
// كشف حساب عميل قابل للطباعة (فحص 2026-09-17، فجوة G2).
//
// يقرأ **دفترَي** الذمم معاً — فواتير طلبات المنصة وفواتير البيع الميداني
// (فجوة G1) — وإلا كان الكشف المطبوع يُسلَّم للصيدلية برصيد أقلّ من الحقيقة،
// وهو أسوأ موضع يظهر فيه ذلك الخلل لأنه يصير سنداً بين الطرفين.
//
// الحراسة: canViewFinance، بنفس منطق app/warehouse/accounts/page.tsx.
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { hasWarehousePermission } from '@/app/lib/warehouse-permissions';
import { agingBucket, sumOutstanding } from '@/app/lib/warehouse-accounts';
import PageHeader from '@/app/warehouse/_components/PageHeader';
import PrintFrame from '@/app/warehouse/print/_components/PrintFrame';
import DocumentHeader from '@/app/warehouse/print/_components/DocumentHeader';

export const dynamic = 'force-dynamic';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

const AGING_LABEL: Record<string, string> = {
    CURRENT: 'غير مستحق',
    D30: 'متأخر ≤30 يوم',
    D60: 'متأخر ≤60 يوم',
    D90: 'متأخر ≤90 يوم',
    D90_PLUS: 'متأخر >90 يوم',
};

export default async function PrintStatementPage(props: {
    params: Promise<{ organizationId: string }>;
}) {
    const { organizationId } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect('/dashboard');

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    if (!belongsAndActive || !hasWarehousePermission(actor!, 'canViewFinance')) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="كشف حساب" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    لا تملك صلاحية عرض الوضع المالي، فلا يمكنك طباعة كشوف الحسابات.
                </div>
            </div>
        );
    }

    const [warehouse, organization, invoices, fieldSales, customer, settlements] = await Promise.all([
        prisma.warehouse.findUnique({
            where: { id: ctx.warehouseId },
            select: { name: true, city: true, phone: true, salesPhone: true, followupPhone: true, managementPhone: true },
        }),
        prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
        // كل الفواتير لا المفتوحة فقط: الكشف سجل حركة، والمسدَّدة جزء من السجل.
        // الملغاة وحدها تُستبعد — لا تمثل حركة قائمة.
        prisma.warehouseInvoice.findMany({
            where: { warehouseId: ctx.warehouseId, organizationId, status: { not: 'CANCELLED' } },
            select: {
                invoiceNumber: true, total: true, paidAmount: true,
                status: true, issuedAt: true, dueAt: true,
            },
            orderBy: { issuedAt: 'asc' },
        }),
        prisma.warehouseFieldSale.findMany({
            where: { warehouseId: ctx.warehouseId, organizationId, status: { not: 'CANCELLED' } },
            select: {
                invoiceNumber: true, total: true, paidAmount: true,
                status: true, soldAt: true, rep: { select: { name: true } },
            },
            orderBy: { soldAt: 'asc' },
        }),
        prisma.warehouseCustomer.findUnique({ where: { warehouseId_organizationId: { warehouseId: ctx.warehouseId, organizationId } } }),
        prisma.warehouseSettlement.findMany({ where: { warehouseId: ctx.warehouseId, organizationId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);

    if (!organization || !warehouse) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="كشف حساب" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    العميل غير موجود.
                </div>
            </div>
        );
    }

    type Row = {
        date: Date;
        number: string;
        source: string;
        total: number;
        paid: number;
        dueAt: Date | null;
    };

    const rows: Row[] = [
        ...(customer && customer.openingBalance > 0 ? [{ date: customer.createdAt, number: 'OPENING', source: 'الرصيد الافتتاحي', total: customer.openingBalance, paid: 0, dueAt: null }] : []),
        ...invoices.map((i) => ({
            date: i.issuedAt,
            number: i.invoiceNumber,
            source: 'طلب منصة',
            total: i.total,
            paid: i.paidAmount,
            dueAt: i.dueAt,
        })),
        ...fieldSales.map((s) => ({
            date: s.soldAt,
            number: s.invoiceNumber,
            // البيع الميداني بلا dueAt في المخطط (بيع فوري) — فيبقى «غير مستحق»
            // في التقادم، ويُسمّى مندوبه كي يعرف العميل مصدر الحركة.
            source: `بيع ميداني${s.rep?.name ? ` — ${s.rep.name}` : ''}`,
            total: s.total,
            paid: s.paidAmount,
            dueAt: null as Date | null,
        })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    const totalBilled = rows.reduce((s, r) => s + r.total, 0);
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
    const outstanding = sumOutstanding(rows.map((r) => ({ total: r.total, paidAmount: r.paid })));
    const creditBalance = rows.reduce((sum, r) => sum + Math.max(r.paid - r.total, 0), 0);
    const now = new Date();

    // رصيد جارٍ تصاعدي — العمود الذي يقرأه العميل أولاً في أي كشف.
    let running = 0;
    const withRunning = rows.map((r) => {
        running += Math.max(r.total - r.paid, 0);
        return { ...r, running };
    });

    return (
        <PrintFrame title="كشف الحساب" backHref="/warehouse/customers" backLabel="عودة إلى العملاء">
            <DocumentHeader
                warehouseName={warehouse.name}
                warehouseCity={warehouse.city}
                warehousePhone={warehouse.phone}
                documentType="كشف حساب"
                documentNumber={null}
                lines={[
                    { label: 'العميل', value: organization.name },
                    { label: 'تاريخ الكشف', value: day(now) },
                    { label: 'عدد الحركات', value: String(rows.length) },
                    { label: 'إجمالي المفوتر', value: `${money(totalBilled)} د.ع` },
                    { label: 'إجمالي المسدَّد', value: `${money(totalPaid)} د.ع` },
                    { label: 'الرصيد المستحق', value: `${money(outstanding)} د.ع` },
                    { label: 'رصيد دائن لصالح العميل', value: `${money(creditBalance)} د.ع` },
                ]}
            />

            <table className="w-full border-collapse text-xs">
                <thead>
                    <tr className="border-y border-border bg-muted/40 text-right">
                        <th className="p-2 font-bold">التاريخ</th>
                        <th className="p-2 font-bold">الرقم</th>
                        <th className="p-2 font-bold">المصدر</th>
                        <th className="p-2 font-bold">المبلغ</th>
                        <th className="p-2 font-bold">المسدَّد</th>
                        <th className="p-2 font-bold">المتبقي</th>
                        <th className="p-2 font-bold">الاستحقاق</th>
                        <th className="p-2 font-bold">الرصيد الجاري</th>
                    </tr>
                </thead>
                <tbody>
                    {withRunning.map((r, i) => {
                        const remaining = Math.max(r.total - r.paid, 0);
                        const bucket = agingBucket(r.dueAt, now);
                        return (
                            <tr key={`${r.number}-${i}`} className="border-b border-border">
                                <td className="p-2">{day(r.date)}</td>
                                <td className="p-2 font-mono text-[10px]" dir="ltr">{r.number}</td>
                                <td className="p-2 text-muted-foreground">{r.source}</td>
                                <td className="p-2 tabular-nums">{money(r.total)}</td>
                                <td className="p-2 tabular-nums">{money(r.paid)}</td>
                                <td className="p-2 tabular-nums font-medium">{money(remaining)}</td>
                                <td className="p-2 text-muted-foreground">
                                    {r.dueAt ? day(r.dueAt) : '—'}
                                    {remaining > 0.01 && bucket !== 'CURRENT' && (
                                        <span className="mr-1 font-medium text-destructive">
                                            {AGING_LABEL[bucket]}
                                        </span>
                                    )}
                                </td>
                                <td className="p-2 tabular-nums font-bold">{money(r.running)}</td>
                            </tr>
                        );
                    })}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={8} className="p-4 text-center text-muted-foreground">
                                لا حركات على هذا العميل.
                            </td>
                        </tr>
                    )}
                </tbody>
                {rows.length > 0 && (
                    <tfoot>
                        <tr className="border-t-2 border-border font-bold">
                            <td className="p-2" colSpan={3}>الإجمالي</td>
                            <td className="p-2 tabular-nums">{money(totalBilled)}</td>
                            <td className="p-2 tabular-nums">{money(totalPaid)}</td>
                            <td className="p-2 tabular-nums">{money(outstanding)}</td>
                            <td className="p-2" />
                            <td className="p-2 tabular-nums">{money(outstanding)}</td>
                        </tr>
                    </tfoot>
                )}
            </table>

            {settlements.length > 0 && <section className="mt-5"><h2 className="mb-2 font-bold">سندات السداد والرد والمطابقة</h2><p className="mb-2 text-xs">هذه السندات تفسر الأرصدة أعلاه؛ لا تُضاف مبالغها مرة ثانية إلى الإجمالي. المطابقة ليست دفعًا نقديًا جديدًا.</p><table className="w-full text-xs"><thead><tr><th>التاريخ</th><th>النوع</th><th>المرجع</th><th>المبلغ</th></tr></thead><tbody>{settlements.map(e => <tr key={e.id} className="border-t"><td className="p-2">{day(e.createdAt)}</td><td>{e.kind === 'OPENING_PAYMENT' ? 'سداد رصيد سابق' : e.kind === 'RETURN_REFUND' ? 'رد نقدي' : 'مطابقة'}</td><td>{e.reference}</td><td>{money(e.amount)}</td></tr>)}</tbody></table></section>}
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                يشمل هذا الكشف فواتير طلبات المنصة ومبيعات المندوبين الميدانية المسجَّلة على هذا
                العميل. مبيعات ميدانية سُجِّلت باسم نصّي بلا ربط بالمؤسسة لا تظهر هنا.
            </p>

            <div className="mt-8 flex justify-between gap-6 text-[11px] text-muted-foreground">
                <div className="flex-1 border-t border-border pt-1.5">توقيع العميل</div>
                <div className="flex-1 border-t border-border pt-1.5">توقيع المذخر</div>
            </div>
            <ContactFooter phones={warehouse} />
        </PrintFrame>
    );
}
