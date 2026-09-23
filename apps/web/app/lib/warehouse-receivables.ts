/**
 * warehouse-receivables.ts
 *
 * مصدر واحد لسؤال «كم على هذا العميل / على كل العملاء؟» عند مذخر.
 *
 * سبب وجود هذا الملف (فحص 2026-09-17، فجوة G1): للمذخر **دفتران** للذمم
 * المدينة لا دفتر واحد —
 *   1. WarehouseInvoice — تُنشأ عند اعتماد الصيدلية لعرض طلب المنصة.
 *   2. WarehouseFieldSale — بيع المندوب الميداني: لا طلب سابق ولا تفاوض، وله
 *      رقم فاتورة وtotal وpaidAmount وstatus وتحصيلات (WarehouseRepCollection)
 *      مثل الأول تماماً.
 *
 * وكانت كل مواضع المال تقرأ الأول وحده: ملخّص الحسابات، أرصدة العملاء، وفحص
 * حدّ الائتمان عند اعتماد الطلب — فدَين البيع الميداني لا يُحسب على الحدّ، وصيدلية
 * بلغت حدّها فعلاً يُعتمد طلبها. الدمج هنا في موضع واحد كي لا تنحرف المواضع
 * الثلاثة عن بعضها مرة أخرى.
 *
 * طبقة غير نقيّة (تستعلم Prisma) عمداً — الحساب نفسه يبقى في
 * warehouse-accounts.ts النقيّة القابلة للاختبار بلا قاعدة بيانات.
 */

import { prisma } from '@/app/lib/prisma';
import { outstandingWithOpeningBalance, type ReceivableInvoiceInput } from '@/app/lib/warehouse-accounts';

/**
 * الفواتير «المفتوحة» فقط. PAID وCANCELLED لا شيء مستحق منهما، وsummarizeReceivables
 * تستبعدهما ثانيةً على أي حال (حزام وحمّالة مقصودان: الاستعلام أضيق، والدالة النقيّة
 * لا تعتمد على ضيقه).
 */
const OPEN_STATUSES = ['UNPAID', 'PARTIAL'] as const;

/**
 * يقبل `prisma` أو عميل معاملة (tx) — فحص حدّ الائتمان يجري داخل معاملة، ويجب
 * أن يقرأ نفس لقطة البيانات التي ستُكتب فيها الفاتورة.
 */
export type ReceivableDb = Pick<typeof prisma, 'warehouseInvoice' | 'warehouseFieldSale' | 'warehouseCustomer'>;

/**
 * كل ما هو مستحق لهذا المذخر من الدفترين، بشكل تستهلكه summarizeReceivables.
 *
 * البيع الميداني بلا dueAt في المخطط (بيع فوري بلا مهلة متّفق عليها)، فيُمرَّر
 * null — وagingBucket تصنّف null كـCURRENT دائماً، وهو التصنيف الصادق: لا يصحّ
 * وسم مبلغ بأنه «متأخر» عن مهلة لم تُتفَق أصلاً.
 *
 * بلا organizationId: إجمالي المذخر — ويشمل البيع الميداني لصيدليات خارج
 * المنصة (organizationId = null)، وهو دَين حقيقي على المذخر أن يراه.
 */
export async function loadOpenReceivables(
    db: ReceivableDb,
    warehouseId: string,
    organizationId?: string
): Promise<ReceivableInvoiceInput[]> {
    const orgFilter = organizationId ? { organizationId } : {};

    const [invoices, fieldSales, customers] = await Promise.all([
        db.warehouseInvoice.findMany({
            where: { warehouseId, status: { in: [...OPEN_STATUSES] }, ...orgFilter },
            select: { total: true, paidAmount: true, status: true, dueAt: true },
        }),
        db.warehouseFieldSale.findMany({
            where: { warehouseId, status: { in: [...OPEN_STATUSES] }, ...orgFilter },
            select: { total: true, paidAmount: true, status: true },
        }),
        db.warehouseCustomer.findMany({
            where: { warehouseId, ...orgFilter, openingBalance: { gt: 0 } },
            select: { openingBalance: true },
        }),
    ]);

    return [
        ...invoices,
        ...fieldSales.map((s) => ({ ...s, dueAt: null })),
        ...customers.map((c) => ({ total: c.openingBalance, paidAmount: 0, status: 'UNPAID', dueAt: null })),
    ];
}

/**
 * المستحق على صيدلية واحدة بعينها من الدفترين + رصيدها السابق — أساس فحص
 * حدّ الائتمان.
 *
 * `openingBalance` بارامتر إلزامي عمداً (بلا قيمة افتراضية) لا يُقرأ من قاعدة
 * البيانات هنا: المستدعي الوحيد اليوم (approveWarehouseOrder في
 * warehouse-order-approval.ts) يملك صفّ WarehouseCustomer مقفلاً بالفعل
 * (SELECT ... FOR UPDATE) قبل هذا النداء، فتمرير حقله مباشرة يقرأ نفس اللقطة
 * المُقفلة بدل استعلام ثانٍ مستقل قد يرى قيمة مختلفة نظرياً. عدم وجود قيمة
 * افتراضية هنا مقصود أيضاً: أي مستدعٍ مستقبلي لهذه الدالة يجب أن يُجبَر على
 * إحضار الرصيد السابق صراحة عبر خطأ TypeScript، لا أن ينزلق بصمت لسلوك ما قبل
 * هذا التعديل (تجاهل الرصيد السابق كلياً).
 *
 * التصفية بـorganizationId تُخرج تلقائياً البيع الميداني لصيدليات خارج المنصة:
 * لا يصحّ تحميل دَين «صيدلية النور» المكتوب نصاً على مؤسسة أخرى.
 */
export async function customerOutstanding(
    db: ReceivableDb,
    warehouseId: string,
    organizationId: string,
    openingBalance: number
): Promise<number> {
    const orgFilter = { organizationId };

    const [invoices, fieldSales] = await Promise.all([
        db.warehouseInvoice.findMany({
            where: { warehouseId, status: { in: [...OPEN_STATUSES] }, ...orgFilter },
            select: { total: true, paidAmount: true },
        }),
        db.warehouseFieldSale.findMany({
            where: { warehouseId, status: { in: [...OPEN_STATUSES] }, ...orgFilter },
            select: { total: true, paidAmount: true },
        }),
    ]);

    return outstandingWithOpeningBalance(openingBalance, [...invoices, ...fieldSales]);
}
