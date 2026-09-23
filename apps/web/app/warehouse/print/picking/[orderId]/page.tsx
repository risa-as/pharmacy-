import ContactFooter from '@/app/warehouse/print/_components/ContactFooter';
// فاتورة الشحن — الورقة الواحدة التي تسافر مع البضاعة من المخزن إلى الصيدلية:
// عامل المخزن يُجهّز بها، والصيدلاني يستلم ويتحقق بها (فحص 2026-09-17، فجوة
// G2؛ أُعيد تصميمها 2026-09-19 لتصبح فاتورة بيع فعلية لا مجرد قائمة تجهيز).
//
// كانت هذه الصفحة قائمة تجهيز بلا أسعار ولا إجماليات، وتعليقها القديم كان
// يبرّر ذلك بأن إظهار الأسعار "يسرّب هوامش المذخر إلى أرضية المخزن" — تبرير
// خاطئ صحّحه صاحب النظام: الهامش = سعر البيع - سعر التكلفة، وسعر التكلفة لا
// يظهر على هذه الورقة إطلاقاً ولم يظهر يوماً. القرار الصحيح: هذه الورقة
// فاتورة البيع الفعلية، لا نسخة منزوعة الأسعار عنها.
//
// البنود ومجموعها: effectiveLine من warehouse-quote.ts حصراً — نفس الدالة
// التي حُسب بها WarehouseInvoice.total، فلا يختلف مجموع هذه الورقة عن الفاتورة
// المالية المخزَّنة (انظر تحذير التعارض أسفل الجدول إن اختلفا فعلاً).
//
// إرشاد "من أي دفعة تسحب" (FEFO) أُبقي عمداً — طلب صريح من صاحب النظام رغم أن
// الورقة صارت فاتورة: عامل التجهيز ما زال يحتاجه، والصيدلاني يتحقق به عند
// الاستلام. مربّع التأشير (✓) حُذف: لا معنى له على فاتورة بيع.
//
// الحراسة: canShipOrders — من يجهّز هو من يشحن، بنفس منطق النسخة القديمة.
// ملاحظة مهمة: هذه الصفحة تعرض الآن أرصدة دَين العميل (الرصيد السابق/الحالي)،
// وcanShipOrders لا تستلزم canViewFinance (دور مسؤول المخزون مثلاً يملك الأولى
// بلا الثانية) — فمن يملك صلاحية الشحن فقط صار يرى الوضع المالي للعميل أيضاً
// عبر هذه الورقة تحديداً. قرار واعٍ لا سهو: من يشحن يحتاج يعرف حالة الدَين قبل
// أن يُسلِّم بضاعة إضافية لعميل متجاوز لحدّه، وهذا بالضبط الاستخدام الذي طلبه
// صاحب النظام بضمّ الفاتورة وقائمة التجهيز في ورقة واحدة.
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { hasWarehousePermission } from '@/app/lib/warehouse-permissions';
import { effectiveLine } from '@/app/lib/warehouse-quote';
import { totalUnitsLeavingStock } from '@/app/lib/warehouse-bonus';
import { customerOutstanding } from '@/app/lib/warehouse-receivables';
import { computeInvoiceBalances, type InvoiceBalanceStatus } from '@/app/lib/invoice-balances';
import PageHeader from '@/app/warehouse/_components/PageHeader';
import PrintFrame from '@/app/warehouse/print/_components/PrintFrame';

export const dynamic = 'force-dynamic';

const PAGE_TITLE = 'فاتورة الشحن';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
// نفس تقارب day() أعلاه (UTC بلا تحويل منطقة زمنية) حفاظاً على اتساق كل
// التواريخ/الأوقات المطبوعة على مستندات هذا المسار ببعضها.
const time = (d: Date) => {
    const h = d.getUTCHours();
    const period = h < 12 ? 'ص' : 'م';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${period}`;
};

export default async function PrintShippingInvoicePage(props: {
    params: Promise<{ orderId: string }>;
}) {
    const { orderId } = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect('/dashboard');

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    if (!belongsAndActive || !hasWarehousePermission(actor!, 'canShipOrders')) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title={PAGE_TITLE} />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    لا تملك صلاحية شحن الطلبات، فلا يمكنك طباعة فواتير الشحن.
                </div>
            </div>
        );
    }

    const order = await prisma.warehouseOrder.findFirst({
        where: { id: orderId, warehouseId: ctx.warehouseId },
        include: {
            items: { include: { drug: { select: { tradeName: true, barcode: true } } } },
            branch: {
                select: {
                    name: true,
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            // لا عنوان ولا هاتف مباشرة على Organization/Branch في المخطط
                            // (نفس ما يُقرّره تعليق app/warehouse/print/invoice/[id]/page.tsx
                            // بشأن الهاتف) — لكنهما موجودان فعلاً على CompanySettings
                            // (هوية العميل التجارية التي يُدخلها بنفسه)، فتُقرآن من هناك
                            // بدل «—» مُختلَقة كسلاً. العلاقة اختيارية 1:1 وقد لا تُنشأ
                            // بعد لعميل جديد — null صالح ويُترجَم لاحقاً إلى «—».
                            companySettings: { select: { address: true, phone: true } },
                        },
                    },
                },
            },
            warehouse: { select: { name: true, city: true, phone: true, salesPhone: true, followupPhone: true, managementPhone: true } },
        },
    });

    if (!order) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title={PAGE_TITLE} />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    الطلب غير موجود ضمن هذا المذخر.
                </div>
            </div>
        );
    }

    const organizationId = order.branch?.organization?.id ?? null;

    // دفعات الأصناف المطلوبة بترتيب FEFO — تُطبَع كإرشاد «من أي دفعة تسحب»،
    // لا كحجز: الحجز الفعلي يحدث عند الشحن في مساره الخاص.
    const barcodes = order.items.map((it) => it.drug.barcode).filter(Boolean);

    const [batches, anyBatchForWarehouse, invoice, customer] = await Promise.all([
        // barcodes قد تكون فارغة (طلب بلا أصناف، دفاعي) — barcode: { in: [] }
        // صالح في Prisma ويُرجع صفوفاً فارغة، فلا حاجة لفرع شرطي منفصل هنا.
        prisma.warehouseBatch.findMany({
            where: {
                catalogItem: { warehouseId: ctx.warehouseId, drug: { barcode: { in: barcodes } } },
                quantity: { gt: 0 },
            },
            select: {
                batchNumber: true,
                expiryDate: true,
                quantity: true,
                catalogItem: { select: { drug: { select: { barcode: true } } } },
            },
            orderBy: { expiryDate: 'asc' },
        }),
        // هل يتتبّع هذا المذخر مخزونه إطلاقاً؟ (وجود أي دفعة لأي صنف، لا لهذه
        // الأصناف تحديداً) — يميّز "مذخر لا يتتبّع مخزوناً أصلاً" (لا إرشاد
        // FEFO ممكن، فلا داعٍ لتنبيه أحمر على كل سطر) عن "يتتبّع لكن هذا الصنف
        // تحديداً نافد الدفعات" (تنبيه حقيقي يستحق اللون الأحمر).
        prisma.warehouseBatch.findFirst({
            where: { catalogItem: { warehouseId: ctx.warehouseId } },
            select: { id: true },
        }),
        // WarehouseInvoice.orderId فريد — فاتورة واحدة على الأكثر لهذا الطلب،
        // موجودة عادة منذ لحظة الاعتماد (QUOTED → APPROVED)؛ null فقط في حالة
        // معاينة نادرة قبل الاعتماد.
        prisma.warehouseInvoice.findUnique({
            where: { orderId: order.id },
            select: { invoiceNumber: true, total: true, paidAmount: true, status: true, issuedAt: true, notes: true },
        }),
        organizationId
            ? prisma.warehouseCustomer.findUnique({
                  where: { warehouseId_organizationId: { warehouseId: ctx.warehouseId, organizationId } },
                  select: { paymentTermDays: true, openingBalance: true },
              })
            : Promise.resolve(null),
    ]);

    const warehouseTracksStock = !!anyBatchForWarehouse;

    // المستحق الآن على هذا العميل من كل الدفاتر (رصيد سابق + طلبات المنصة +
    // البيع الميداني المفتوحة معاً) — أساس «الرصيد الحالي/السابق» أدناه، انظر
    // app/lib/invoice-balances.ts للاشتقاق الكامل. بعد await customer أعلاه لا
    // ضمنه: customerOutstanding تحتاج openingBalance المُدخَل يدوياً على سطر
    // WarehouseCustomer (0 حين لا سطر بعد لهذا العميل، نفس تقارب باقي النظام).
    const current = organizationId
        ? await customerOutstanding(prisma, ctx.warehouseId, organizationId, customer?.openingBalance ?? 0)
        : 0;

    const batchesByBarcode = new Map<string, typeof batches>();
    for (const b of batches) {
        const key = b.catalogItem.drug.barcode;
        const list = batchesByBarcode.get(key);
        if (list) list.push(b);
        else batchesByBarcode.set(key, [b]);
    }

    const lines = order.items
        .map((it) => {
            const eff = effectiveLine(it);
            return {
                id: it.id,
                tradeName: it.drug.tradeName,
                barcode: it.drug.barcode,
                note: it.note,
                // «الكمية» المطبوعة على الفاتورة = المدفوعة فقط (eff.quantity) —
                // لا totalUnitsLeavingStock: عمود مُسعَّر يجب أن يطابق ما يدخل
                // effectiveLine/الإجمالي حرفياً، وإلا لم يتطابق مجموع هذه
                // الورقة مع WarehouseInvoice.total.
                paidQuantity: eff.quantity,
                unitPrice: eff.unitPrice,
                lineTotal: eff.lineTotal,
                bonusQuantity: it.bonusQuantity,
                // للإرشاد فقط (كم وحدة تُسحَب فعلياً من الرفّ = مدفوعة + بونص) —
                // لا يدخل أي عمود مُسعَّر، فقط النص الإرشادي أسفل عمود الدفعة.
                unitsToPick: totalUnitsLeavingStock({ soldQuantity: eff.quantity, bonusQuantity: it.bonusQuantity }),
                // القيم المُعلَنة على سطر الطلب: batchNumber صار مرجع شحنة يُصدره
                // النظام آلياً (انظر app/lib/shipment-ref.ts) لا رقم دفعة حقيقي من
                // المصنع؛ expiryDate يبقى ما أعلنه المذخر وقت التسعير فعلاً (وعدٌ
                // لا إثبات، انظر تعليق الحقلين في schema.prisma).
                declaredShipmentRef: it.batchNumber,
                declaredExpiryDate: it.expiryDate,
                fefoCandidates: batchesByBarcode.get(it.drug.barcode) ?? [],
            };
        })
        // نفس شرط app/warehouse/print/invoice/[id]/page.tsx حرفياً كي لا يختلف
        // مجموع الورقتين: صنف نافد كميته وبونصه معاً صفر لا يُشحن ولا يُحتسب.
        .filter((l) => l.paidQuantity > 0 || l.bonusQuantity > 0);

    const itemsTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const totalPaidQuantity = lines.reduce((s, l) => s + l.paidQuantity, 0);
    const totalBonusQuantity = lines.reduce((s, l) => s + l.bonusQuantity, 0);

    const balances = computeInvoiceBalances({
        current,
        invoice: invoice
            ? { total: invoice.total, paidAmount: invoice.paidAmount, status: invoice.status as InvoiceBalanceStatus }
            : null,
        sheetNetTotal: itemsTotal,
    });

    // الدفع: يُقرَأ من WarehouseCustomer.paymentTermDays إن وُجد سطر علاقة
    // تجارية لهذا العميل (0 = نقدي/بلا مهلة، أكبر من صفر = آجل) — غياب السطر
    // نفسه (عميل لم تُنشأ له علاقة بعد) ليس "عميلاً نقدياً" بل مجهول الشرط، لذا
    // «—» لا «نقد» في هذه الحالة تحديداً.
    const paymentTermsLabel = !customer ? '—' : customer.paymentTermDays > 0 ? 'آجل' : 'نقد';

    // أرقام تواصل المذخر: مصفوفة محلية بدل رقم واحد مُدرَج مباشرة في الـJSX —
    // تجهيزاً لتوسعتها لاحقاً إلى حتى أربعة أرقام مُسمّاة (مهمة منفصلة على
    // مخطط قاعدة البيانات/الإعدادات، ليست جزءاً من هذه المهمة) دون إعادة كتابة
    // قسم الترويسة. اليوم تحمل مدخلاً واحداً على الأكثر مشتقاً من
    // Warehouse.phone، وتبقى فارغة حين لا هاتف مسجَّل.
    const contactNumbers: Array<{ label: string; number: string }> = order.warehouse.phone
        ? [{ label: 'هاتف', number: order.warehouse.phone }]
        : [];

    const now = new Date();

    const infoRows: Array<Array<{ label: string; value: string }>> = [
        [
            { label: 'اسم الزبون', value: order.branch?.organization?.name ?? '—' },
            { label: 'رقم الفاتورة', value: invoice?.invoiceNumber ?? order.orderNumber ?? '—' },
            { label: 'تاريخ', value: day(invoice?.issuedAt ?? now) },
        ],
        [
            // العنوان/الهاتف الخاصّان بالعميل: من CompanySettings (هوية العميل
            // التجارية التي يُدخلها بنفسه) — قد تكون null (لم يُنشئ العميل
            // إعداداته بعد، أو لم يملأ الحقل) فتُطبَع «—» بلا اختلاق.
            { label: 'العنوان', value: order.branch?.organization?.companySettings?.address ?? '—' },
            { label: 'الهاتف', value: order.branch?.organization?.companySettings?.phone ?? '—' },
            // لا علاقة مندوب على WarehouseOrder في المخطط — لا مندوب مُختلَق.
            { label: 'المندوب', value: '—' },
        ],
        [
            { label: 'الدفع', value: paymentTermsLabel },
            { label: 'فاتورة', value: 'مبيع' },
            { label: 'عدد الأصناف', value: String(lines.length) },
        ],
        [
            // لا مفهوم "كاشير" في نظام مذاخر B2B (لا صندوق نقدي لكل فاتورة) — «—».
            { label: 'رقم الطلب', value: order.orderNumber ?? '—' },
            // اسم المستخدم الذي يطبع الورقة فعلياً (صاحب صلاحية canShipOrders) —
            // لا اسم مندوب مُختلَق؛ هذا هو المجهّز الحقيقي الوحيد المعروف.
            { label: 'المجهز', value: ctx.user.name ?? '—' },
            { label: 'الوقت', value: time(now) },
        ],
    ];

    const itemsMismatch = !!invoice && Math.abs(itemsTotal - invoice.total) > 0.01;

    return (
        <PrintFrame title={PAGE_TITLE} backHref="/warehouse/orders" backLabel="عودة إلى الطلبات">
            <div className="print-document" dir="rtl">
                {/* ترويسة هوية المذخر — مركزية، تطابق تخطيط فاتورة مذخر أدوية عراقي
                    حقيقي (اسم بارز فوق صفّ أرقام تواصل مُسمّاة). */}
                <div className="mb-4 border-b-2 border-border pb-3 text-center">
                    <h1 className="text-xl font-bold text-foreground">{order.warehouse.name}</h1>
                    {contactNumbers.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {contactNumbers.map((c) => (
                                <span key={c.label}>
                                    {c.label}: <span className="font-mono" dir="ltr">{c.number}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* شبكة معلومات الفاتورة — ثلاثة أعمدة، أربعة صفوف. */}
                <table className="mb-4 w-full border-collapse border border-border text-xs">
                    <tbody>
                        {infoRows.map((row, i) => (
                            <tr key={i}>
                                {row.map((cell) => (
                                    <td key={cell.label} className="border border-border p-1.5 align-top">
                                        <span className="text-muted-foreground">{cell.label}: </span>
                                        <span className="font-medium text-foreground">{cell.value}</span>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* جدول البنود. */}
                <table className="w-full table-fixed border-collapse border border-border text-[10px]">
                    <colgroup>
                        <col style={{ width: '3%' }} />
                        <col style={{ width: '19%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '17%' }} />
                        <col style={{ width: '20%' }} />
                    </colgroup>
                    <thead>
                        <tr className="border-y border-border bg-muted/40 text-right">
                            <th className="border border-border p-1 font-bold">ت</th>
                            <th className="border border-border p-1 font-bold">المادة</th>
                            <th className="border border-border p-1 font-bold">الكمية</th>
                            <th className="border border-border p-1 font-bold">كمية مجانية</th>
                            <th className="border border-border p-1 font-bold">الخصم</th>
                            <th className="border border-border p-1 font-bold">السعر</th>
                            <th className="border border-border p-1 font-bold">الاجمالي</th>
                            <th className="border border-border p-1 font-bold">تاريخ الصلاحية</th>
                            <th className="border border-border p-1 font-bold">مرجع الشحنة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => {
                            const fefoTop = l.fefoCandidates[0] ?? null;
                            return (
                                <tr key={l.id} className="border-b border-border align-top">
                                    <td className="border border-border p-1 tabular-nums text-muted-foreground">{i + 1}</td>
                                    <td className="border border-border p-1">
                                        <div className="break-words font-medium text-foreground">{l.tradeName}</div>
                                        <div className="truncate font-mono text-[9px] text-muted-foreground" dir="ltr">{l.barcode}</div>
                                        {l.note && (
                                            <div className="mt-0.5 truncate text-[9px] text-muted-foreground">ملاحظة: {l.note}</div>
                                        )}
                                    </td>
                                    <td className="border border-border p-1 tabular-nums">{l.paidQuantity}</td>
                                    <td className="border border-border p-1 tabular-nums">{l.bonusQuantity > 0 ? l.bonusQuantity : '—'}</td>
                                    {/* لا حقل خصم لكل سطر في المخطط (WarehouseOrderItem بلا discount) —
                                        عنصر نائب محايد كي يطابق التخطيط شكلاً، بلا اختلاق رقم. */}
                                    <td className="border border-border p-1 tabular-nums text-muted-foreground">—</td>
                                    <td className="border border-border p-1 tabular-nums">{money(l.unitPrice)}</td>
                                    <td className="border border-border p-1 tabular-nums font-medium">{money(l.lineTotal)}</td>
                                    <td className="border border-border p-1">
                                        {l.declaredExpiryDate ? (
                                            <span className="tabular-nums">{day(l.declaredExpiryDate)}</span>
                                        ) : fefoTop ? (
                                            <span className="tabular-nums text-muted-foreground">
                                                {day(fefoTop.expiryDate)} <span className="text-[8px]">(FEFO)</span>
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="border border-border p-1">
                                        <div className="truncate font-mono text-[9px]" dir="ltr">{l.declaredShipmentRef ?? '—'}</div>
                                        {l.fefoCandidates.length > 0 && (
                                            <div className="mt-1 space-y-0.5 border-t border-dashed border-border pt-1 text-[8px] text-muted-foreground">
                                                <div className="font-medium">
                                                    إرشاد FEFO — اسحب {l.unitsToPick} و. من:
                                                </div>
                                                {l.fefoCandidates.slice(0, 3).map((b) => (
                                                    <div key={b.batchNumber} className="truncate" dir="ltr">
                                                        {b.batchNumber} · {day(b.expiryDate)} · متوفر {b.quantity}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {warehouseTracksStock && l.fefoCandidates.length === 0 && (
                                            <div className="mt-1 text-[8px] font-medium text-destructive">
                                                لا دفعة مسجَّلة لهذا الصنف في المخزون
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {lines.length === 0 && (
                            <tr>
                                <td colSpan={9} className="border border-border p-4 text-center text-muted-foreground">
                                    لا أصناف مشحونة على هذا الطلب.
                                </td>
                            </tr>
                        )}
                    </tbody>
                    {lines.length > 0 && (
                        <tfoot>
                            <tr className="border-t-2 border-border bg-muted/40 font-bold">
                                <td className="border border-border p-1" colSpan={2}>الإجمالي</td>
                                <td className="border border-border p-1 tabular-nums">{totalPaidQuantity}</td>
                                <td className="border border-border p-1 tabular-nums">{totalBonusQuantity || '—'}</td>
                                <td className="border border-border p-1" />
                                <td className="border border-border p-1" />
                                <td className="border border-border p-1 tabular-nums">{money(itemsTotal)}</td>
                                <td className="border border-border p-1" colSpan={2} />
                            </tr>
                        </tfoot>
                    )}
                </table>

                <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
                    «مرجع الشحنة» مرجع شحنة يُصدره النظام آلياً لتتبّع السطر، لا رقم دفعة
                    حقيقياً من المصنع؛ «تاريخ الصلاحية» المُعلَن وعدٌ أدخله المذخر وقت
                    التسعير لا إثبات. دفعات إرشاد FEFO أسفل كل سطر لحظة الطباعة ولا تحجز
                    شيئاً — الخصم الفعلي من المخزون يحدث عند تسجيل الشحن؛ راجع الكمية
                    المتوفرة قبل السحب.
                </p>

                {itemsMismatch && (
                    <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[10px] text-warning">
                        تنبيه: مجموع البنود ({money(itemsTotal)}) لا يطابق إجمالي الفاتورة المخزَّن
                        ({money(invoice!.total)}) — راجع الطلب قبل تسليم هذه الورقة.
                    </p>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <table className="w-full border-collapse border border-border text-xs">
                        <tbody>
                            <tr>
                                <td className="border border-border p-1.5 text-muted-foreground">اجمالي الفاتورة</td>
                                <td className="border border-border p-1.5 text-left tabular-nums font-bold">{money(itemsTotal)} د.ع</td>
                            </tr>
                            <tr>
                                {/* لا حقل خصم على مستوى الفاتورة في المخطط (WarehouseInvoice بلا discount) — نفس الانضباط أعلاه. */}
                                <td className="border border-border p-1.5 text-muted-foreground">خصم الفاتورة</td>
                                <td className="border border-border p-1.5 text-left tabular-nums text-muted-foreground">—</td>
                            </tr>
                            <tr>
                                {/* صافي = اجمالي لغياب خصم معروف — لا رقم صافٍ مختلق منفصل. */}
                                <td className="border border-border p-1.5 text-muted-foreground">صافي الفاتورة</td>
                                <td className="border border-border p-1.5 text-left tabular-nums font-bold">{money(itemsTotal)} د.ع</td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full border-collapse border border-border text-xs">
                        <tbody>
                            <tr>
                                <td className="border border-border p-1.5 text-muted-foreground">الرصيد السابق</td>
                                <td className="border border-border p-1.5 text-left tabular-nums">{money(balances.previous)} د.ع</td>
                            </tr>
                            <tr>
                                <td className="border border-border p-1.5 text-muted-foreground">الرصيد الحالي</td>
                                <td className="border border-border p-1.5 text-left tabular-nums font-bold">{money(balances.current)} د.ع</td>
                            </tr>
                            <tr>
                                <td className="border border-border p-1.5 text-muted-foreground">التفاصيل</td>
                                <td className="border border-border p-1.5 text-left text-[10px]">{invoice?.notes ?? order.notes ?? '—'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* لا حقل سياسة إرجاع مُهيَّأ على Warehouse في المخطط — نص عام يطلب
                    التحقق عند الاستلام بدل ادّعاء شروط إرجاع مُحدَّدة (أيام/نسب) لم
                    يضبطها المذخر فعلياً في أي مكان. */}
                <p className="mt-5 text-[9px] leading-relaxed text-muted-foreground">
                    يُرجى مراجعة البضاعة والكميات وتواريخ الصلاحية عند الاستلام؛ المرتجعات
                    وفق سياسة المذخر المتّفق عليها. طُبعت هذه الورقة في {day(now)} — {time(now)}.
                </p>

                <div className="mt-8 flex justify-between gap-6 text-[11px] text-muted-foreground">
                    <div className="flex-1 border-t border-border pt-1.5">توقيع المستلِم</div>
                    <div className="flex-1 border-t border-border pt-1.5">توقيع المجهز</div>
                </div>
            </div>
            <ContactFooter phones={order.warehouse} />
        </PrintFrame>
    );
}
