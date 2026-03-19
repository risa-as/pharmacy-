export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { BarChart3, TrendingUp, AlertOctagon } from "lucide-react";
import BestSellingChart from "@/app/ui/dashboard/reports/best-selling-chart";
import StagnantItemsTable from "@/app/ui/dashboard/reports/stagnant-items-table";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, tenantWhere, organizationId, user } = tenantCtx;

    // Fix #4: Staff users (no organizationId) must look up their org via branchId
    let resolvedOrgId = organizationId;
    if (!resolvedOrgId && user.branchId) {
        const branch = await prisma.branch.findUnique({
            where: { id: user.branchId },
            select: { organizationId: true }
        });
        resolvedOrgId = branch?.organizationId ?? undefined;
    }

    if (resolvedOrgId) {
        const upgrade = await requireFeature(resolvedOrgId, 'advancedReports');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const stagnantPeriod = typeof searchParams.stagnantPeriod === 'string' ? parseInt(searchParams.stagnantPeriod) : 90;

    // --- 1. Best Selling Items (Last 30 Days) ---
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const bestSellingRaw = await prisma.saleItem.groupBy({
        by: ['drugId'],
        where: {
            sale: {
                createdAt: { gte: thirtyDaysAgo },
                ...tenantBranchWhere
            }
        },
        _sum: { quantity: true, price: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
    });

    const bestSellingDrugs = bestSellingRaw.length > 0
        ? await prisma.globalDrug.findMany({
            where: { id: { in: bestSellingRaw.map(d => d.drugId) } },
            select: { id: true, tradeName: true }
        })
        : [];

    // Map to BestSellingChart expected shape: { name, quantity, total }
    const bestSelling = bestSellingRaw.map(item => {
        const drug = bestSellingDrugs.find((d: any) => d.id === item.drugId);
        return {
            name: drug?.tradeName || 'غير معروف',
            quantity: item._sum.quantity || 0,
            total: Math.round((item._sum.price || 0) * (item._sum.quantity || 0)),
        };
    });

    // --- 2. Stagnant / Slow Moving Items ---
    const stagnantCutoffDate = new Date();
    stagnantCutoffDate.setDate(stagnantCutoffDate.getDate() - stagnantPeriod);
    const now = new Date();

    const recentlySoldDrugIds = (await prisma.saleItem.findMany({
        where: {
            sale: {
                createdAt: { gte: stagnantCutoffDate },
                ...tenantBranchWhere
            }
        },
        select: { drugId: true },
        distinct: ['drugId'],
    })).map((s: any) => s.drugId);

    const stagnantInventories = await prisma.inventory.findMany({
        where: {
            ...tenantBranchWhere,
            drugId: { notIn: recentlySoldDrugIds.length > 0 ? recentlySoldDrugIds : ['__none__'] },
            batches: { some: { quantity: { gt: 0 } } }
        },
        include: {
            drug: { select: { id: true, tradeName: true } },
            batches: {
                where: { quantity: { gt: 0 } },
                select: { quantity: true },
                orderBy: { expiryDate: 'asc' }
            },
        },
        take: 50,
    });

    // Find last sale date per drug
    const stagnantDrugIds = stagnantInventories.map((inv: any) => inv.drugId);
    const lastSalesPerDrug = stagnantDrugIds.length > 0
        ? await prisma.saleItem.findMany({
            where: { drugId: { in: stagnantDrugIds }, sale: tenantBranchWhere },
            select: { drugId: true, sale: { select: { createdAt: true } } },
            orderBy: { sale: { createdAt: 'desc' } },
            distinct: ['drugId'],
        })
        : [];

    // Map to StagnantItemsTable expected shape: { id, tradeName, stock, lastSaleDate, daysSinceLastSale }
    const stagnantItems = stagnantInventories.map((inv: any) => {
        const totalStock = inv.batches.reduce((s: number, b: any) => s + b.quantity, 0);
        const lastSaleEntry = lastSalesPerDrug.find((ls: any) => ls.drugId === inv.drugId);
        const lastSaleDate = lastSaleEntry?.sale?.createdAt ?? null;
        const daysSinceLastSale = lastSaleDate
            ? Math.floor((now.getTime() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24))
            : stagnantPeriod;
        return {
            id: inv.drugId,
            tradeName: inv.drug.tradeName,
            stock: totalStock,
            lastSaleDate,
            daysSinceLastSale,
        };
    });

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
                    <BarChart3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">تقارير التحليل المتقدم</h1>
                    <p className="text-sm text-muted-foreground">الأصناف الأكثر مبيعاً والراكدة</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-success" />
                        <h2 className="text-lg font-bold">الأكثر مبيعاً (30 يوم)</h2>
                    </div>
                    {bestSelling.length > 0
                        ? <BestSellingChart data={bestSelling} />
                        : <p className="text-center text-muted-foreground py-10">لا توجد مبيعات في الفترة المحددة</p>
                    }
                </div>

                <div className="glass-card p-6">
                    {stagnantItems.length > 0
                        ? <StagnantItemsTable items={stagnantItems} currentPeriod={stagnantPeriod} />
                        : (
                            <div className="flex items-center gap-2 mb-4">
                                <AlertOctagon className="w-5 h-5 text-warning" />
                                <p className="text-muted-foreground py-10">✅ لا توجد أصناف راكدة خلال {stagnantPeriod} يوم</p>
                            </div>
                        )
                    }
                </div>
            </div>
        </div>
    );
}
