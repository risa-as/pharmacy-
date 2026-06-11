export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { AlertTriangle, Package, XCircle, TrendingDown, ShoppingCart, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import ShortagesTable, { ShortageRow } from "@/app/ui/inventory/shortages-table";

export default async function ShortagesPage({
    searchParams,
}: {
    searchParams?: { branch?: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, organizationId } = tenantCtx;

    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'productMovement');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    const selectedBranchId = searchParams?.branch;

    const branchFilter = selectedBranchId
        ? { ...tenantBranchWhere, branchId: selectedBranchId }
        : tenantBranchWhere;

    const inventory = await prisma.inventory.findMany({
        where: branchFilter,
        include: { drug: true, branch: true, batches: true },
        orderBy: { drug: { tradeName: "asc" } },
    });

    const shortages = inventory
        .map((item: any) => ({
            ...item,
            currentStock: item.batches.reduce((sum: number, b: any) => sum + b.quantity, 0),
        }))
        .filter((item: any) => item.currentStock < item.minStock);

    const depletedCount = shortages.filter((s: any) => s.currentStock === 0).length;
    const lowCount = shortages.length - depletedCount;

    const rows: ShortageRow[] = shortages.map((item: any) => ({
        id: item.id,
        drugName: item.drug.tradeName,
        barcode: item.drug.barcode ?? null,
        branchName: item.branch.name,
        currentStock: item.currentStock,
        minStock: item.minStock,
    }));

    const statCards = [
        { label: "أصناف ناقصة", value: shortages.length, icon: TrendingDown, tone: "text-warning", bg: "bg-warning/10" },
        { label: "نفدت بالكامل", value: depletedCount, icon: XCircle, tone: "text-destructive", bg: "bg-destructive/10" },
        { label: "أقل من الحد الأدنى", value: lowCount, icon: Package, tone: "text-warning", bg: "bg-warning/10" },
    ];

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-warning" />
                        النواقص
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        الأصناف التي انخفض مخزونها عن الحد الأدنى
                    </p>
                </div>
                <BranchFilter currentBranch={selectedBranchId} baseUrl="/dashboard/inventory/shortages" />
            </div>

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${card.tone}`} />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">{card.label}</p>
                                <p className={`text-2xl font-bold ${card.value > 0 ? card.tone : "text-foreground"}`}>
                                    {card.value}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* رابط الإجراء */}
            {shortages.length > 0 && (
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/dashboard/purchases/smart-order"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                    >
                        <ShoppingCart className="w-4 h-4" />
                        إنشاء طلب شراء ذكي
                        <ArrowLeft className="w-3.5 h-3.5" />
                    </Link>
                </div>
            )}

            {/* الجدول */}
            {shortages.length === 0 ? (
                <div className="glass-card py-16 text-center">
                    <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Package className="w-8 h-8 text-success" />
                    </div>
                    <p className="text-foreground font-medium">لا توجد نواقص حالياً</p>
                    <p className="text-sm text-muted-foreground mt-1">جميع الأصناف متوفرة بكمية كافية</p>
                </div>
            ) : (
                <ShortagesTable rows={rows} />
            )}
        </div>
    );
}
