export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { FileSpreadsheet, TrendingUp } from "lucide-react";
import SalesChart from "@/app/ui/dashboard/sales-chart";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';


export default async function PurchasesReportPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    // Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const purchases = await prisma.purchase.findMany({
        where: {
            ...tenantBranchWhere,
            createdAt: { gte: thirtyDaysAgo },
            status: 'COMPLETED' // Only completed purchases count as actual spending? Or all? Let's say Completed.
        },
        include: { supplier: true },
        orderBy: { createdAt: 'asc' }
    });

    const totalPurchases = purchases.reduce((sum: any, p: any) => sum + p.total, 0);

    // Chart Data
    const spendingByDay = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        spendingByDay.set(d.toLocaleDateString('en-GB', { timeZone: "Asia/Baghdad" }), 0);
    }

    purchases.forEach((p: any) => {
        const key = new Date(p.createdAt).toLocaleDateString('en-GB', { timeZone: "Asia/Baghdad" });
        spendingByDay.set(key, (spendingByDay.get(key) || 0) + p.total);
    });

    const chartData = Array.from(spendingByDay.entries()).map(([day, amount]: any) => ({
        day: day.slice(0, 5),
        amount
    }));

    return (
        <div className="glass-card w-full p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold font-cairo flex items-center gap-2">
                <FileSpreadsheet className="w-8 h-8 text-info" />
                تقرير المشتريات (آخر 30 يوم)
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-info/10 p-6 rounded-xl border border-info/20">
                    <div className="text-sm text-info mb-1">إجمالي مشتريات المواد</div>
                    <div className="text-3xl font-bold text-info">{totalPurchases.toLocaleString()} د.ع</div>
                    <div className="text-sm mt-2 text-info">عدد الفواتير: {purchases.length}</div>
                </div>
            </div>

            <div className="bg-card p-6 rounded-xl border shadow-sm">
                <h3 className="font-bold mb-4">اتجاه المشتريات اليومي</h3>
                <SalesChart data={chartData} title="المشتريات اليومية" />
            </div>
        </div>
    );
}
