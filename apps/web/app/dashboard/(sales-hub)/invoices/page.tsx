export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { PlusIcon, Receipt, TrendingUp, Package, Wallet } from "lucide-react";
import Link from "next/link";
import { DeleteInvoice, ViewInvoice } from "@/app/ui/invoices/buttons";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DateRangeFilter from "@/app/ui/reports/date-range-filter";
import TableSearch from "@/app/ui/table-search";
import TablePagination from "@/app/ui/table-pagination";
import { formatCurrency } from "@/app/lib/utils/currency";

const pill = "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold";

function buildDateRange(from: string, to: string) {
    const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    const start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
    const end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
    return { start, end };
}

export default async function Page(
    props: {
        searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
    }
) {
    const searchParams = await props.searchParams;
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;
    const PAGE_SIZE = 100;
    const page = typeof searchParams.page === 'string' ? Math.max(1, parseInt(searchParams.page) || 1) : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search.trim() : undefined;
    const fromParam = typeof searchParams.from === 'string' ? searchParams.from : undefined;
    const toParam = typeof searchParams.to === 'string' ? searchParams.to : undefined;

    // فلتر الفترة الزمنية (يُطبّق فقط عند اختيار المستخدم لتاريخ)
    const dateWhere: Prisma.PurchaseWhereInput = {};
    if (fromParam && toParam) {
        const { start, end } = buildDateRange(fromParam, toParam);
        dateWhere.createdAt = { gte: start, lte: end };
    }

    // بناء شرط البحث (اسم المورد أو رقم الفاتورة)
    const searchWhere: Prisma.PurchaseWhereInput = {};
    if (search) {
        searchWhere.OR = [
            { supplier: { name: { contains: search, mode: 'insensitive' } } },
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
        ];
    }

    const baseWhere = branchId ? { AND: [tenantBranchWhere, { branchId }] } : tenantBranchWhere;
    const finalWhere = { ...baseWhere, ...searchWhere, ...dateWhere };

    const [invoices, totalCount, statsRaw] = await Promise.all([
        prisma.purchase.findMany({
            where: finalWhere,
            orderBy: { createdAt: 'desc' },
            include: {
                supplier: true,
                branch: true,
                _count: { select: { items: true } },
            },
            take: PAGE_SIZE,
            skip: (page - 1) * PAGE_SIZE,
        }),
        prisma.purchase.count({ where: finalWhere }),
        // استعلام خفيف لإحصائيات كامل الفترة المفلترة (لا يتأثر بترقيم الصفحات)
        prisma.purchase.findMany({
            where: finalWhere,
            select: { total: true, paidAmount: true, _count: { select: { items: true } } },
        }),
    ]);

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    // معاملات الفلاتر للحفاظ عليها عبر روابط الفرع والترقيم
    const filterParams = new URLSearchParams();
    if (branchId) filterParams.set("branch", branchId);
    if (fromParam) filterParams.set("from", fromParam);
    if (toParam) filterParams.set("to", toParam);
    if (search) filterParams.set("search", search);
    const branchExtraParams = filterParams.toString();
    const buildPageUrl = (p: number) => {
        const params = new URLSearchParams(filterParams);
        params.set("page", String(p));
        return `/dashboard/invoices?${params.toString()}`;
    };

    // إحصائيات الفترة المفلترة — محسوبة من كامل النتائج
    const periodCount = statsRaw.length;
    const periodTotal = statsRaw.reduce((acc, p) => acc + p.total, 0);
    const periodItems = statsRaw.reduce((acc, p) => acc + p._count.items, 0);
    const periodDue = statsRaw.reduce((acc, p) => acc + Math.max(0, p.total - p.paidAmount), 0);
    const hasDateFilter = !!(fromParam && toParam);
    const periodLabel = hasDateFilter ? "الفترة المحددة" : "كل الفواتير";
    const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

    const statCards = [
        { label: "إجمالي المشتريات (د.ع)", value: fmt(periodTotal), sub: periodLabel, icon: TrendingUp, tone: "text-success", bg: "bg-success/10" },
        { label: "عدد الفواتير", value: periodCount.toLocaleString("en-US"), sub: "فاتورة شراء", icon: Receipt, tone: "text-warning", bg: "bg-warning/10" },
        { label: "الأصناف المشتراة", value: periodItems.toLocaleString("en-US"), sub: "صنف", icon: Package, tone: "text-info", bg: "bg-info/10" },
        { label: "المبلغ المستحق (د.ع)", value: fmt(periodDue), sub: "غير مدفوع", icon: Wallet, tone: "text-primary", bg: "bg-primary/10" },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <Receipt className="w-6 h-6 text-primary" />
                        فواتير الشراء
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">سجل فواتير الشراء من الموردين مع الفلترة والبحث</p>
                </div>
                <Link
                    href="/dashboard/invoices/create"
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shadow-sm shrink-0"
                >
                    <PlusIcon className="h-4 w-4" />
                    <span className="hidden md:block">إنشاء فاتورة</span>
                </Link>
            </div>

            {/* الفلاتر */}
            <div className="space-y-3">
                <DateRangeFilter
                    baseUrl="/dashboard/invoices"
                    currentFrom={fromParam}
                    currentTo={toParam}
                    extraParams={branchId ? { branch: branchId } : {}}
                />
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/invoices" extraParams={branchExtraParams} />
            </div>

            {/* بطاقات الإحصائيات — تعكس الفترة المختارة */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${card.tone}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">{card.label}</p>
                                <p className={`text-2xl font-bold ${card.tone}`} dir="ltr">{card.value}</p>
                                <p className="text-xs text-muted-foreground truncate">{card.sub}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* جدول الفواتير — بنفس تصميم جدول الدفعات وسلوكه */}
            <div className="glass-card overflow-hidden">
                {/* البحث */}
                <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
                    <TableSearch currentQuery={search ?? ""} param="search" placeholder="بحث باسم المورد أو رقم الفاتورة..." />
                    <span className="text-sm text-muted-foreground">
                        {search ? (
                            <>
                                {totalCount.toLocaleString("en-US")} نتيجة لـ &quot;<span className="font-bold text-foreground">{search}</span>&quot;
                            </>
                        ) : (
                            <>{totalCount.toLocaleString("en-US")} فاتورة</>
                        )}
                    </span>
                </div>

                {invoices.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Receipt className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-foreground font-medium">
                            {search ? "لا توجد نتائج للبحث" : "لا توجد فواتير شراء"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {search ? "جرّب كلمة بحث أخرى" : hasDateFilter ? "لا توجد فواتير في الفترة المحددة" : "ستظهر فواتير الشراء هنا عند إنشائها"}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide">
                                <tr>
                                    <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">المورد</th>
                                    <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الفرع</th>
                                    <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الأصناف</th>
                                    <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الإجمالي</th>
                                    <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">التاريخ</th>
                                    <th className="px-3 py-3 text-right font-medium font-cairo whitespace-nowrap">الحالة</th>
                                    <th className="px-3 py-3 text-center font-medium font-cairo whitespace-nowrap">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                                {invoices.map((invoice) => {
                                    const due = Math.max(0, invoice.total - invoice.paidAmount);
                                    const createdAt = new Date(invoice.createdAt);
                                    let payText = "مدفوعة";
                                    let payClass = "bg-success/10 text-success border-success/20";
                                    if (due > 0 && invoice.paidAmount > 0) {
                                        payText = "مدفوعة جزئياً";
                                        payClass = "bg-warning/10 text-warning border-warning/20";
                                    } else if (due > 0) {
                                        payText = "غير مدفوعة";
                                        payClass = "bg-destructive/10 text-destructive border-destructive/20";
                                    }
                                    return (
                                        <tr key={invoice.id} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-3 py-3">
                                                <div className="max-w-[200px]">
                                                    <p className="font-semibold text-foreground truncate" title={invoice.supplier.name}>
                                                        {invoice.supplier.name}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground font-mono truncate text-right" dir="ltr">
                                                        {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : invoice.documentNumber}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-muted-foreground">
                                                <span className="block max-w-[160px] truncate" title={invoice.branch.name}>
                                                    {invoice.branch.name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                                                <span className="font-bold text-foreground">{invoice._count.items}</span> صنف
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                <div className="font-bold text-foreground" dir="ltr">{formatCurrency(invoice.total)}</div>
                                                {due > 0 && (
                                                    <div className="text-[10px] text-muted-foreground" dir="ltr">
                                                        مستحق {formatCurrency(due)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3" suppressHydrationWarning>
                                                <div className="text-xs text-muted-foreground leading-tight whitespace-nowrap" dir="ltr">
                                                    <div>{createdAt.toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}</div>
                                                    <div className="text-[10px] text-muted-foreground/60">
                                                        {createdAt.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex flex-wrap items-center gap-1">
                                                    {invoice.status === "CANCELLED" ? (
                                                        <span className={`${pill} bg-muted text-muted-foreground border-border`}>ملغاة</span>
                                                    ) : (
                                                        <>
                                                            <span className={`${pill} ${payClass}`}>{payText}</span>
                                                            {invoice.status === "PENDING" && (
                                                                <span className={`${pill} bg-info/10 text-info border-info/20`}>بانتظار الاستلام</span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <ViewInvoice id={invoice.id} />
                                                    <DeleteInvoice id={invoice.id} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* الترقيم */}
                <TablePagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalCount={totalCount}
                    unit="فاتورة"
                    hrefFor={buildPageUrl}
                />
            </div>
        </div>
    );
}
