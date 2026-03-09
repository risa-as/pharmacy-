export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import ProfitReportClient from '@/app/ui/reports/profit-report-client';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function ProfitReportPage({
    searchParams
}: {
    searchParams?: { period?: string; from?: string; to?: string; branchId?: string }
}) {
    const session = await auth();
    const defaultBranchId = searchParams?.branchId || session?.user?.branchId || '';

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantWhere } = tenantCtx;

    // Fetch branches for filter dropdown
    const branches = await prisma.branch.findMany({
        where: tenantWhere,
        select: { id: true, name: true }
    });

    return (
        <div className="glass-card p-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground mb-6">📊 تقرير الأرباح والخسائر</h1>
            <Suspense fallback={
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            }>
                <ProfitReportClient
                    branches={branches}
                    defaultBranchId={defaultBranchId}
                    defaultPeriod={searchParams?.period || 'daily'}
                />
            </Suspense>
        </div>
    );
}
