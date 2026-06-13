export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { Suspense } from 'react';
import ShiftsTable from '@/app/ui/reports/shifts/table';
import DateRangeFilter from '@/app/ui/reports/date-range-filter';
import { BranchFilter } from '@/app/ui/reports/branch-filter';
import { ExportExcelButton } from '@/app/ui/reports/export-buttons';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { ClipboardCheck, DollarSign, Banknote, TrendingDown, TrendingUp, Search, Loader2 } from 'lucide-react';

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

    const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
    const cards = [
        { label: 'المتوقع بالأدراج', value: fmt(totalExpected), icon: DollarSign, tone: 'text-info', bg: 'bg-info/10' },
        { label: 'المستلم الفعلي', value: fmt(totalActual), icon: Banknote, tone: 'text-primary', bg: 'bg-primary/10' },
        { label: 'عجز الأدراج (نواقص)', value: fmt(totalShortage), icon: TrendingDown, tone: 'text-destructive', bg: 'bg-destructive/10' },
        { label: 'فائض الأدراج (زيادات)', value: fmt(totalOverage), icon: TrendingUp, tone: 'text-success', bg: 'bg-success/10' },
    ];

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => {
                const Icon = card.icon;
                return (
                    <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`w-6 h-6 ${card.tone}`} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm text-muted-foreground truncate">{card.label}</p>
                            <p className={`text-xl font-bold ${card.tone} whitespace-nowrap`} dir="ltr">{card.value} <span className="text-xs font-normal text-muted-foreground">د.ع</span></p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default async function Page({
    searchParams,
}: {
    searchParams?: { query?: string; page?: string; from?: string; to?: string; branch?: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere } = tenantCtx;

    const query = searchParams?.query || '';
    const from = searchParams?.from;
    const to = searchParams?.to;
    const branchId = searchParams?.branch;

    const { startDate, endDate } = parseDateRange(from, to);

    const dateWhere = { createdAt: { gte: startDate, lte: endDate } };
    const userWhere = query ? { user: { name: { contains: query, mode: 'insensitive' as const } } } : {};
    const branchWhere = branchId ? { branchId } : {};

    // Fetch ALL shifts in the date range — the period bounds the result set, so
    // the summary cards and export reflect the WHOLE period (not just one page).
    const [shifts, creditSales] = await Promise.all([
        prisma.shift.findMany({
            where: { ...tenantBranchWhere, ...branchWhere, ...dateWhere, ...userWhere },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' },
            take: 1000,
        }),
        prisma.sale.findMany({
            where: {
                ...tenantBranchWhere,   // scoped to tenant
                ...branchWhere,
                ...dateWhere,
                payment: { method: 'CREDIT' },
            },
            select: { userId: true, total: true, createdAt: true },
        }),
    ]);

    // Export rows (whole filtered set)
    const exportData = shifts.map((s: any) => {
        const expected = s.expectedCash || 0;
        const actual = s.actualCash || 0;
        const closed = s.status === 'CLOSED';
        return [
            s.user?.name || 'غير معروف',
            new Date(s.startTime).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }),
            s.endTime ? new Date(s.endTime).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : '-',
            (s.startingCash || 0).toString(),
            expected.toString(),
            closed ? actual.toString() : '-',
            closed ? (actual - expected).toString() : '-',
            closed ? 'مغلقة' : 'مفتوحة',
        ];
    });

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <ClipboardCheck className="w-6 h-6 text-primary" />
                        سجل وإقفالات الورديات (Z-Reports)
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        مراجعة إقفال كل وردية ومقارنة المستلم من الكاشير بالمبيعات الفعلية لاكتشاف أي عجز أو فائض.
                    </p>
                </div>
                <ExportExcelButton
                    filename="shifts-z-report"
                    headers={["الموظف", "بداية الوردية", "نهاية الوردية", "الرصيد الافتتاحي", "المتوقع", "الفعلي المستلم", "الفرق", "الحالة"]}
                    data={exportData}
                />
            </div>

            {/* الفلاتر */}
            <div className="space-y-3">
                <DateRangeFilter
                    baseUrl="/dashboard/reports/shifts"
                    currentFrom={from}
                    currentTo={to}
                    extraParams={{ ...(query ? { query } : {}), ...(branchId ? { branch: branchId } : {}) }}
                    allowedPresets={["today", "yesterday", "last7", "custom"]}
                    defaultPreset="last7"
                />
                <BranchFilter
                    currentBranch={branchId}
                    baseUrl="/dashboard/reports/shifts"
                    extraParams={[
                        from ? `from=${from}` : "",
                        to ? `to=${to}` : "",
                        query ? `query=${encodeURIComponent(query)}` : "",
                    ].filter(Boolean).join("&") || undefined}
                />
                <form method="GET" className="relative max-w-sm">
                    {from && <input type="hidden" name="from" value={from} />}
                    {to && <input type="hidden" name="to" value={to} />}
                    {branchId && <input type="hidden" name="branch" value={branchId} />}
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        name="query"
                        defaultValue={query}
                        placeholder="ابحث باسم الموظف..."
                        className="w-full pr-10 pl-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                </form>
            </div>

            {/* بطاقات الملخص */}
            <ShiftSummaryCards shifts={shifts} />

            {/* الجدول */}
            <Suspense fallback={
                <div className="glass-card flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            }>
                <ShiftsTable shifts={shifts} creditSales={creditSales} />
            </Suspense>
        </div>
    );
}
