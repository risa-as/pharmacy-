import ContactFooter from '@/app/warehouse/print/_components/ContactFooter';
// فاتورة بيع قابلة للطباعة — الورقة التي تسافر مع البضاعة (فحص 2026-09-17،
// فجوة G2).
//
// الحراسة: canViewFinance، بنفس منطق app/warehouse/accounts/page.tsx — هذه
// الصفحة تقرأ Prisma مباشرة، فبوابة الـAPI وحدها لا تمنع من يفتح الرابط.
//
// البنود: WarehouseInvoice بلا بنود خاصة بها في المخطط (orderId فريد 1:1)،
// فتُقرأ من بنود الطلب وتُحسب حصراً عبر effectiveLine من warehouse-quote.ts —
// نفس الدالة التي حُسب بها total المخزَّن، فلا يختلف مجموع الورقة عن الفاتورة.
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { hasWarehousePermission } from '@/app/lib/warehouse-permissions';
import { effectiveLine } from '@/app/lib/warehouse-quote';
import PageHeader from '@/app/warehouse/_components/PageHeader';
import PrintFrame from '@/app/warehouse/print/_components/PrintFrame';
import DocumentHeader from '@/app/warehouse/print/_components/DocumentHeader';

export const dynamic = 'force-dynamic';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

const STATUS_LABEL: Record<string, string> = {
    UNPAID: 'غير مسددة',
    PARTIAL: 'مسددة جزئياً',
    PAID: 'مسددة',
    CANCELLED: 'ملغاة',
};

export default async function PrintInvoicePage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
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
                <PageHeader title="فاتورة" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    لا تملك صلاحية عرض الوضع المالي، فلا يمكنك طباعة الفواتير.
                </div>
            </div>
        );
    }

    // warehouseId في الشرط يمنع طباعة فاتورة مذخر آخر بتخمين المعرّف.
    const invoice = await prisma.warehouseInvoice.findFirst({
        where: { id, warehouseId: ctx.warehouseId },
        include: {
            // لا هاتف على Organization ولا على Branch في المخطط — فهوية العميل
            // على الورقة هي الاسم والفرع فقط.
            organization: { select: { name: true } },
            warehouse: { select: { name: true, city: true, phone: true, salesPhone: true, followupPhone: true, managementPhone: true } },
            payments: { orderBy: { receivedAt: 'asc' } },
        },
    });

    if (!invoice) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="فاتورة" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    الفاتورة غير موجودة ضمن هذا المذخر.
                </div>
            </div>
        );
    }

    const order = await prisma.warehouseOrder.findUnique({
        where: { id: invoice.orderId },
        include: {
            items: { include: { drug: { select: { tradeName: true, barcode: true } } } },
            branch: { select: { name: true } },
        },
    });

    const lines = (order?.items ?? [])
        .map((it) => ({
            tradeName: it.drug.tradeName,
            barcode: it.drug.barcode,
            bonusQuantity: it.bonusQuantity,
            ...effectiveLine(it),
        }))
        // الأصناف النافدة كميتها صفر — تُحجب عن الورقة: لا تُشحن ولا تُحتسب.
        .filter((l) => l.quantity > 0 || l.bonusQuantity > 0);

    const itemsTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const creditNotes = await prisma.warehouseReturn.findMany({ where: { orderId: invoice.orderId, warehouseId: ctx.warehouseId, status: 'ACCEPTED' }, include: { items: true }, orderBy: { createdAt: 'asc' } });
    const returnedTotal = creditNotes.reduce((sum, r) => sum + r.totalAmount, 0);
    const remaining = Math.max(invoice.total - invoice.paidAmount, 0);

    return (
        <PrintFrame title="الفاتورة" backHref="/warehouse/accounts" backLabel="عودة إلى الحسابات">
            <DocumentHeader
                warehouseName={invoice.warehouse.name}
                warehouseCity={invoice.warehouse.city}
                warehousePhone={invoice.warehouse.phone}
                documentType="فاتورة بيع"
                documentNumber={invoice.invoiceNumber}
                lines={[
                    { label: 'العميل', value: invoice.organization.name },
                    { label: 'الفرع', value: order?.branch?.name ?? '—' },
                    { label: 'رقم الطلب', value: order?.orderNumber ?? '—' },
                    { label: 'تاريخ الإصدار', value: day(invoice.issuedAt) },
                    { label: 'تاريخ الاستحقاق', value: day(invoice.dueAt) },
                    { label: 'الحالة', value: STATUS_LABEL[invoice.status] ?? invoice.status },
                ]}
            />

            <table className="w-full border-collapse text-xs">
                <thead>
                    <tr className="border-y border-border bg-muted/40 text-right">
                        <th className="p-2 font-bold">#</th>
                        <th className="p-2 font-bold">الصنف</th>
                        <th className="p-2 font-bold">الكمية</th>
                        <th className="p-2 font-bold">بونص</th>
                        <th className="p-2 font-bold">السعر</th>
                        <th className="p-2 font-bold">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => (
                        <tr key={`${l.barcode}-${i}`} className="border-b border-border">
                            <td className="p-2 tabular-nums text-muted-foreground">{i + 1}</td>
                            <td className="p-2">
                                <div className="font-medium text-foreground">{l.tradeName}</div>
                                <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">{l.barcode}</div>
                            </td>
                            <td className="p-2 tabular-nums">{l.quantity}</td>
                            <td className="p-2 tabular-nums">{l.bonusQuantity > 0 ? l.bonusQuantity : '—'}</td>
                            <td className="p-2 tabular-nums">{money(l.unitPrice)}</td>
                            <td className="p-2 tabular-nums font-medium">{money(l.lineTotal)}</td>
                        </tr>
                    ))}
                    {lines.length === 0 && (
                        <tr>
                            <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                لا بنود مشحونة على هذه الفاتورة.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <div className="mt-4 flex justify-end">
                <dl className="w-64 space-y-1 text-xs">
                    <div className="flex justify-between">
                        <dt className="text-muted-foreground">الفاتورة الأصلية قبل المرتجعات</dt>
                        <dd className="tabular-nums">{money(itemsTotal)} د.ع</dd>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1 font-bold">
                        <dt>صافي الفاتورة بعد المرتجعات</dt>
                        <dd className="tabular-nums">{money(invoice.total)} د.ع</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-muted-foreground">صافي المسدَّد بعد الرد النقدي</dt>
                        <dd className="tabular-nums">{money(invoice.paidAmount)} د.ع</dd>
                    </div>
                    <div className="flex justify-between font-bold">
                        <dt>المتبقي</dt>
                        <dd className="tabular-nums">{money(remaining)} د.ع</dd>
                    </div>
                </dl>
            </div>

            {/* مجموع البنود قد يختلف عن total المخزَّن لو عُدِّل الطلب بعد
                الاعتماد — يُعلَن بدل أن يُخفى، فالفاتورة سند مالي. */}
            {Math.abs(itemsTotal - returnedTotal - invoice.total) > 0.01 && (
                <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                    تنبيه: مجموع البنود ({money(itemsTotal)}) لا يطابق إجمالي الفاتورة المخزَّن
                    ({money(invoice.total)}) — راجع الطلب قبل تسليم هذه الورقة.
                </p>
            )}

            {creditNotes.length > 0 && <section className="mt-5 text-xs">
                <h2 className="font-bold">الإشعارات الدائنة — الإجمالي {money(returnedTotal)} د.ع</h2>
                {creditNotes.map(note => <div key={note.id} className="mt-2 border p-2">
                    <p>إشعار <bdi>{note.creditNoteNumber ?? 'بانتظار الترقيم'}</bdi> · {day(note.acceptedAt)} · {money(note.totalAmount)} د.ع</p>
                    <p>{note.reason ?? 'إرجاع بضاعة'}</p>
                    {note.items.map(item => <p key={item.id}>{item.barcode}: {item.quantity} × {money(item.unitPrice)} = {money(item.quantity * item.unitPrice)}</p>)}
                    <p>رصيد دائن غير مردود: {money(Math.max(note.creditBalance - note.refundedAmount, 0))} د.ع</p>
                    <p>مبلغ مردود للعميل: {money(note.refundedAmount)} د.ع</p>
                </div>)}
            </section>}

            {invoice.payments.length > 0 && (
                <div className="mt-5">
                    <p className="mb-1.5 text-xs font-bold text-foreground">الدفعات المستلمة</p>
                    <table className="w-full border-collapse text-[11px]">
                        <thead>
                            <tr className="border-y border-border bg-muted/40 text-right">
                                <th className="p-1.5 font-bold">التاريخ</th>
                                <th className="p-1.5 font-bold">المبلغ</th>
                                <th className="p-1.5 font-bold">الطريقة</th>
                                <th className="p-1.5 font-bold">المستلِم</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.payments.map((p) => (
                                <tr key={p.id} className="border-b border-border">
                                    <td className="p-1.5">{day(p.receivedAt)}</td>
                                    <td className="p-1.5 tabular-nums">{money(p.amount)}</td>
                                    <td className="p-1.5">{p.method}</td>
                                    <td className="p-1.5">{p.actorName ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {invoice.notes && (
                <p className="mt-4 text-[11px] text-muted-foreground">ملاحظات: {invoice.notes}</p>
            )}

            <div className="mt-8 flex justify-between gap-6 text-[11px] text-muted-foreground">
                <div className="flex-1 border-t border-border pt-1.5">توقيع المُستلِم</div>
                <div className="flex-1 border-t border-border pt-1.5">توقيع المذخر</div>
            </div>
            <ContactFooter phones={invoice.warehouse} />
        </PrintFrame>
    );
}
