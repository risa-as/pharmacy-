export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { PlusIcon, Receipt, TrendingUp, Package, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DeleteInvoice, ViewInvoice } from "@/app/ui/invoices/buttons";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import DateRangeFilter from "@/app/ui/reports/date-range-filter";
import InvoicesSearch from "@/app/ui/invoices/invoices-search";

function buildDateRange(from: string, to: string) {
    const IRAQ_OFFSET = 3 * 60 * 60 * 1000;
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    const start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0) - IRAQ_OFFSET);
    const end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IRAQ_OFFSET);
    return { start, end };
}

export default async function Page({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
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

    const baseWhere = branchId ? { ...tenantBranchWhere, branchId } : tenantBranchWhere;
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

            {/* جدول الفواتير */}
            <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* Title */}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                                <h2 className="font-bold text-foreground font-cairo leading-tight">سجل فواتير الشراء</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {search
                                        ? `${totalCount.toLocaleString()} نتيجة بحث`
                                        : `${totalCount.toLocaleString()} فاتورة${totalPages > 1 ? ` — صفحة ${page} من ${totalPages}` : ''}`}
                                </p>
                            </div>
                        </div>
                        {/* Search */}
                        <Suspense fallback={<div className="h-10 w-full sm:w-80 rounded-lg bg-muted/80 animate-pulse" />}>
                            <InvoicesSearch />
                        </Suspense>
                    </div>
                </div>

                {invoices.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد فواتير{search ? ' مطابقة للبحث' : ' حتى الآن'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-card/50 text-muted-foreground text-sm">
                                <tr>
                                    <th className="px-4 py-3 text-right font-bold">المورد</th>
                                    <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                    <th className="px-4 py-3 text-right font-bold">الأصناف</th>
                                    <th className="px-4 py-3 text-right font-bold">الإجمالي</th>
                                    <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                                    <th className="px-4 py-3 text-center font-bold">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {invoices.map((invoice) => {
                                    const due = Math.max(0, invoice.total - invoice.paidAmount);
                                    return (
                                        <tr key={invoice.id} className="hover:bg-muted/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-foreground">{invoice.supplier.name}</span>
                                                    {invoice.invoiceNumber && (
                                                        <span className="font-mono text-xs text-muted-foreground">#{invoice.invoiceNumber}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">{invoice.branch.name}</td>
                                            <td className="px-4 py-3">
                                                <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-sm">
                                                    {invoice._count.items} صنف
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-bold text-foreground">
                                                <div className="flex flex-col">
                                                    <span dir="ltr" className="text-right">{invoice.total.toLocaleString()} د.ع</span>
                                                    {due > 0 && (
                                                        <span className="text-[10px] w-fit px-2 py-0.5 rounded-full mt-1 bg-warning/10 text-warning font-bold">
                                                            مستحق {fmt(due)}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3" suppressHydrationWarning>
                                                <div className="text-foreground">
                                                    {new Date(invoice.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {new Date(invoice.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-2">
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

                {/* Pagination */}
                {totalPages > 1 && !search && (
                    <div className="flex items-center justify-center gap-2 p-4 border-t border-border">
                        {page > 1 && (
                            <Link
                                href={buildPageUrl(page - 1)}
                                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                                السابق
                            </Link>
                        )}
                        <span className="text-sm text-muted-foreground px-2">{page} / {totalPages}</span>
                        {page < totalPages && (
                            <Link
                                href={buildPageUrl(page + 1)}
                                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                                التالي
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
