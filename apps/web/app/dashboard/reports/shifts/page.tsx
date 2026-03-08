export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { Suspense } from 'react';
import ShiftsTable from '@/app/ui/reports/shifts/table';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export const metadata: Metadata = {
    title: 'سجل إقفالات الورديات | Faramace',
};

// Summary Cards Component
async function ShiftSummaryCards({ query, date, tenantBranchWhere }: { query: string, date: string, tenantBranchWhere: any }) {
    // Parse Date filter
    const now = new Date();
    let startDate = new Date(0); // Epoch start
    let endDate = new Date();

    if (date === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (date === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
    } else if (date === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Fetch aggregated data
    const shifts = await prisma.shift.findMany({
        where: {
            ...tenantBranchWhere,
            status: 'CLOSED',
            createdAt: { gte: startDate, lte: endDate },
            user: {
                name: { contains: query, mode: 'insensitive' }
            }
        },
        select: {
            actualCash: true,
            expectedCash: true
        }
    });

    let totalShortage = 0;
    let totalOverage = 0;
    let totalExpected = 0;
    let totalActual = 0;

    shifts.forEach((shift: any) => {
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
    searchParams?: {
        query?: string;
        page?: string;
        date?: string;
    };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const query = searchParams?.query || '';
    const date = searchParams?.date || 'all';
    const currentPage = Number(searchParams?.page) || 1;

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between">
                <h1 className="text-2xl font-bold">سجل وإقفالات الورديات (Z-Reports)</h1>
            </div>

            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                هذه الشاشة مخصصة للمحاسب ومدير الفرع لمراجعة إقفال كل وردية (Z-Report) ومعرفة مقدار المبالغ المستلمة من الكاشير مقارنة بالمبيعات الفعلية، لاكتشاف أي عجز أو فائض بالمحاسبة.
            </p>

            <div className="mt-6 flex items-center justify-between gap-2 md:mt-8">
                <form method="GET" className="flex w-full md:w-2/3 gap-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            name="query"
                            defaultValue={query}
                            placeholder="🔍 ابحث باسم الموظف..."
                            className="peer block w-full rounded-md border border-border py-[9px] px-4 text-sm outline-2 placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="w-48">
                        <select
                            name="date"
                            defaultValue={date}
                            className="peer block w-full rounded-md border border-border py-[9px] px-2 text-sm outline-2 placeholder:text-muted-foreground bg-card"
                        >
                            <option value="today">اليوم</option>
                            <option value="week">آخر 7 أيام</option>
                            <option value="month">هذا الشهر</option>
                            <option value="all">كل الأوقات</option>
                        </select>
                    </div>
                    <button type="submit" className="rounded-md bg-primary px-6 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                        تطبيق
                    </button>
                </form>
            </div>

            <div className="mt-8">
                <Suspense fallback={<div>جاري حساب ملخص الورديات...</div>}>
                    <ShiftSummaryCards query={query} date={date} tenantBranchWhere={tenantBranchWhere} />
                </Suspense>
            </div>

            <div className="mt-4">
                <Suspense fallback={<div>جاري تحميل سجل الورديات...</div>}>
                    <ShiftsTable query={query} currentPage={currentPage} date={date} tenantBranchWhere={tenantBranchWhere} />
                </Suspense>
            </div>
        </div>
    );
}
