// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: لوحة الذمم المدينة —
// قراءة الخادم الأولية (نفس استعلامات GET /api/warehouse-portal/invoices و
// /accounts/summary) ثم عميل تفاعلي للفلاتر وتسجيل الدفعات (OWNER فقط).
import { prisma } from "@/app/lib/prisma";
import { getWarehouseContext } from "@/app/lib/warehouse-context";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasWarehousePermission } from "@/app/lib/warehouse-permissions";
import { agingBucket, summarizeReceivables } from "@/app/lib/warehouse-accounts";
import PageHeader from "@/app/warehouse/_components/PageHeader";
import AccountsClient from "./AccountsClient";
import { loadOpenReceivables } from '@/app/lib/warehouse-receivables';

export const dynamic = "force-dynamic";

export default async function WarehouseAccountsPage() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) redirect("/dashboard");

    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { warehouseUserType: true, permissions: true, isActive: true, warehouseId: true },
    });
    const belongsAndActive = !!actor && actor.isActive !== false && actor.warehouseId === ctx.warehouseId;
    // تسجيل الدفعات يُقاس بصلاحية canRecordPayment لا بكون المستخدم مالكاً:
    // مسار الـ API (invoices/[id]/payments) يفحص canRecordPayment، والمحاسب
    // (ACCOUNTANT) يملكها افتراضياً. ربط الزر بـ isOwner كان يُخفي الزر عن
    // المحاسب رغم قبول الخادم لطلبه — أي أن دور المحاسب كان بلا وظيفة عملياً.
    const canRecordPayment =
        belongsAndActive && hasWarehousePermission(actor!, 'canRecordPayment');

    // Phase 3 (الأدوار والصلاحيات): هذه الصفحة تقرأ عبر Prisma مباشرة (لا عبر
    // GET /api/warehouse-portal/invoices أو /accounts/summary)، فبوابة الـ API
    // وحدها لا تكفي لمنع من لا يملك canViewFinance من الوصول لهذه البيانات
    // المالية بفتح الرابط مباشرة — إخفاء التبويب في layout.tsx واجهة فقط.
    const canView = belongsAndActive && hasWarehousePermission(actor!, 'canViewFinance');
    if (!canView) {
        return (
            <div className="space-y-4" dir="rtl">
                <PageHeader title="الحسابات" />
                <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                    عرض الحسابات يتطلب صلاحية "عرض الوضع المالي" — راجع مالك المذخر.
                </div>
            </div>
        );
    }

    // القائمة المعروضة تُقصَّر بـ take لأداء الجدول، لكن ملخّص الذمم (البطاقات
    // العلوية وشريط التقادم) يجب أن يطابق GET /accounts/summary بالضبط —
    // فيُحسب من استعلام غير مقصوص لكل الفواتير UNPAID/PARTIAL، لا من rows
    // المقصوصة، وإلا يقلّ الرقم المعروض زوراً عند تجاوز مذخر 300 فاتورة.
    const [invoices, openInvoicesForSummary] = await Promise.all([
        prisma.warehouseInvoice.findMany({
            where: { warehouseId: ctx.warehouseId },
            include: {
                organization: { select: { name: true } },
                _count: { select: { payments: true } },
            },
            orderBy: { issuedAt: "desc" },
            take: 50,
        }),
        loadOpenReceivables(prisma, ctx.warehouseId),
    ]);

    const now = new Date();
    const rows = invoices.map((inv) => ({
        id: inv.id,
        organizationId: inv.organizationId,
        organizationName: inv.organization.name,
        orderId: inv.orderId,
        invoiceNumber: inv.invoiceNumber,
        total: inv.total,
        paidAmount: inv.paidAmount,
        remaining: Math.max(inv.total - inv.paidAmount, 0),
        status: inv.status,
        issuedAt: inv.issuedAt.toISOString(),
        dueAt: inv.dueAt ? inv.dueAt.toISOString() : null,
        aging: agingBucket(inv.dueAt, now),
        paymentsCount: inv._count.payments,
    }));

    const summary = summarizeReceivables(openInvoicesForSummary, now);

    return <AccountsClient initialInvoices={rows} initialSummary={summary} canRecordPayment={canRecordPayment} />;
}
