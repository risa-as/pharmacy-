export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { Suspense } from 'react';
import ShiftsTable from '@/app/ui/reports/shifts/table';
import DateRangeFilter from '@/app/ui/reports/date-range-filter';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export const metadata: Metadata = {
    title: 'سجل إقفالات الورديات | Faramace',
};

// Baghdad is UTC+3 — all date inputs are Baghdad local dates, convert to UTC for DB queries
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

function parseDateRange(from?: string, to?: string) {
    const now = new Date();

    let startDate: Date;
    if (from) {
        // Baghdad midnight → UTC = subtract 3h
        startDate = new Date(new Date(`${from}T00:00:00.000Z`).getTime() - BAGHDAD_OFFSET_MS);
    } else {
        // Today's midnight in Baghdad time
        const baghdadNow = new Date(now.getTime() + BAGHDAD_OFFSET_MS);
        startDate = new Date(
            Date.UTC(baghdadNow.getUTCFullYear(), baghdadNow.getUTCMonth(), baghdadNow.getUTCDate()) - BAGHDAD_OFFSET_MS
        );
    }

    const endDate = to
        ? new Date(new Date(`${to}T23:59:59.000Z`).getTime() - BAGHDAD_OFFSET_MS)
        : now;

    return { startDate, endDate };
}

function ShiftSummaryCards({ shifts }: { shifts: any[] }) {
    let totalShortage = 0, totalOverage = 0, totalExpected = 0, totalActual = 0;

    shifts.filter((s: any) => s.status === 'CLOSED').forEach((shift: any) => {
        const expected = shift.expectedCash || 0;
        const actual = shift.actualCash || 0;
        const variance = actual - expected;
        totalExpected += expected;
        totalActual += actual;
        if (variance < 0) totalShortage += Math.abs(variance);
        if (variance > 0) totalOverage += variance;
    });

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="rounded-xl bg-card p-4 shadow-sm border border-border">
                <div className="flex p-4">
                    <h3 className="ml-2 text-sm font-medium text-muted-foreground">إجمالي المبيعات (المتوقع)</h3>
                </div>
                <p className="truncate rounded-xl bg-card px-4 py-2 text-2xl font-bold">
                    {totalExpected.toLocaleString()} د.ع
                </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-sm border border-border">
                <div className="flex p-4">
                    <h3 className="ml-2 text-sm font-medium text-muted-foreground">إجمالي المستلم (الفعلي)</h3>
                </div>
                <p className="truncate rounded-xl bg-card px-4 py-2 text-2xl font-bold">
                    {totalActual.toLocaleString()} د.ع
                </p>
            </div>
            <div className="rounded-xl bg-destructive/10 p-4 shadow-sm border border-red-100">
                <div className="flex p-4">
                    <h3 className="ml-2 text-sm font-bold text-destructive">عجز الأدراج (نواقص)</h3>
                </div>
                <p className="truncate rounded-xl bg-card px-4 py-2 text-2xl font-bold text-destructive">
                    {totalShortage.toLocaleString()} د.ع
                </p>
            </div>
            <div className="rounded-xl bg-success/10 p-4 shadow-sm border border-green-100">
                <div className="flex p-4">
                    <h3 className="ml-2 text-sm font-bold text-success">فائض الأدراج (زيادات)</h3>
                </div>
                <p className="truncate rounded-xl bg-card px-4 py-2 text-2xl font-bold text-success">
                    {totalOverage.toLocaleString()} د.ع
                </p>
            </div>
        </div>
    );
}

export default async function Page({
    searchParams,
}: {
    searchParams?: { query?: string; page?: string; from?: string; to?: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const query = searchParams?.query || '';
    const from = searchParams?.from;
    const to = searchParams?.to;
    const currentPage = Number(searchParams?.page) || 1;

    const ITEMS_PER_PAGE = 20;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;
    const { startDate, endDate } = parseDateRange(from, to);

    const dateWhere = { createdAt: { gte: startDate, lte: endDate } };
    const userWhere = query ? { user: { name: { contains: query, mode: 'insensitive' as const } } } : {};

    // Single query — used for both summary cards and table
    const [shifts, creditSales] = await Promise.all([
        prisma.shift.findMany({
            where: { ...tenantBranchWhere, ...dateWhere, ...userWhere },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' },
            take: ITEMS_PER_PAGE,
            skip: offset,
        }),
        prisma.sale.findMany({
            where: {
                ...tenantBranchWhere,   // scoped to tenant
                ...dateWhere,
                payment: { method: 'CREDIT' },
            },
            select: { userId: true, total: true, createdAt: true },
        }),
    ]);

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between">
                <h1 className="text-2xl font-bold">سجل وإقفالات الورديات (Z-Reports)</h1>
            </div>

            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                هذه الشاشة مخصصة للمحاسب ومدير الفرع لمراجعة إقفال كل وردية (Z-Report) ومعرفة مقدار المبالغ المستلمة من الكاشير مقارنة بالمبيعات الفعلية، لاكتشاف أي عجز أو فائض بالمحاسبة.
            </p>

            {/* Search */}
            <div className="mt-6 flex items-center gap-2 md:mt-8">
                <form method="GET" className="flex w-full md:w-1/2 gap-3">
                    {from && <input type="hidden" name="from" value={from} />}
                    {to && <input type="hidden" name="to" value={to} />}
                    <input
                        type="text"
                        name="query"
                        defaultValue={query}
                        placeholder="🔍 ابحث باسم الموظف..."
                        className="peer block w-full rounded-md border border-border py-[9px] px-4 text-sm outline-2 placeholder:text-muted-foreground"
                    />
                    <button type="submit" className="rounded-md bg-primary px-6 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary">
                        بحث
                    </button>
                </form>
            </div>

            {/* Date Range Filter */}
            <div className="mt-4">
                <DateRangeFilter
                    baseUrl="/dashboard/reports/shifts"
                    currentFrom={from}
                    currentTo={to}
                    extraParams={query ? { query } : undefined}
                    allowedPresets={["today", "yesterday", "last7", "custom"]}
                />
            </div>

            {/* Summary Cards — no async, data already fetched */}
            <div className="mt-6">
                <ShiftSummaryCards shifts={shifts} />
            </div>

            {/* Table */}
            <div className="mt-4">
                <Suspense fallback={<div>جاري تحميل سجل الورديات...</div>}>
                    <ShiftsTable shifts={shifts} creditSales={creditSales} />
                </Suspense>
            </div>
        </div>
    );
}
