export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { Package, Plus, ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import InventoryTable from "@/app/ui/inventory/inventory-table";
import InventoryFilters from "@/app/ui/inventory/inventory-filters";
import QuickBarcodeEntry from "@/app/ui/inventory/quick-barcode-entry";
import { getTenantContext } from '@/app/lib/tenant-utils';
import {
    buildInventoryCountsQuery,
    buildInventoryPageIdsQuery,
    normalizeInventoryDashboardPage,
    type InventoryCountsRow,
    type InventoryPageIdRow,
} from "@/app/lib/inventory-dashboard-query";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { BranchFilter } from "@/app/ui/reports/branch-filter";

const ITEMS_PER_PAGE = 50;

async function getInventory(
    page: number,
    query: string,
    status: string,
    tenantBranchWhere: any,
    branchId?: string
) {
    const [countRows, pageRows] = await Promise.all([
        prisma.$queryRaw<InventoryCountsRow[]>(
            buildInventoryCountsQuery({ query, tenantBranchWhere, branchId })
        ),
        prisma.$queryRaw<InventoryPageIdRow[]>(
            buildInventoryPageIdsQuery({
                page,
                query,
                status,
                tenantBranchWhere,
                branchId,
                pageSize: ITEMS_PER_PAGE,
            })
        ),
    ]);

    const counts = countRows[0] ?? {
        total: 0,
        shortage: 0,
        low: 0,
        good: 0,
        surplus: 0,
    };
    const filteredTotal =
        status === "shortage" || status === "low" || status === "good" || status === "surplus"
            ? counts[status]
            : counts.total;
    const pageIds = pageRows.map((row) => row.id);

    // Fetch full data for the current page IDs
    const inventory = pageIds.length
        ? await prisma.inventory.findMany({
            where: {
                AND: [
                    tenantBranchWhere,
                    branchId ? { branchId } : {},
                    { id: { in: pageIds } },
                ],
            },
            include: { batches: true, branch: true, drug: true },
        })
        : [];

    // Maintain order from pageIds
    const inventoryMap = new Map(inventory.map((i) => [i.id, i]));
    const ordered = pageIds.map((id) => inventoryMap.get(id)).filter(Boolean) as typeof inventory;

    return {
        items: ordered.map((item) => ({
            ...item,
            currentStock: item.batches.reduce((acc, b) => acc + b.quantity, 0),
        })),
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / ITEMS_PER_PAGE),
        counts,
    };
}

async function getBranches(branchModelWhere: any) {
    return await prisma.branch.findMany({
        where: branchModelWhere,
        select: { id: true, name: true },
    });
}

export default async function Page(
    props: {
        searchParams?: Promise<{
            query?: string;
            page?: string;
            branch?: string;
            status?: string;
        }>;
    }
) {
    const searchParams = await props.searchParams;
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, branchModelWhere } = tenantCtx;

    const query = searchParams?.query || "";
    const currentPage = normalizeInventoryDashboardPage(searchParams?.page);
    const branchId = searchParams?.branch;
    const status = searchParams?.status || "";

    const { canAddDrug, canEditDrug, canDeleteDrug } = tenantCtx.userPermissions;

    const [{ items, totalPages, counts }, branches] = await Promise.all([
        getInventory(currentPage, query, status, tenantBranchWhere, branchId),
        getBranches(branchModelWhere),
    ]);

    const buildPageUrl = (page: number) => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        if (query) params.set("query", query);
        if (branchId) params.set("branch", branchId);
        if (status) params.set("status", status);
        return `/dashboard/inventory?${params.toString()}`;
    };

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <Package className="w-6 h-6 text-primary shrink-0" />
                        جرد المخزون
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        إدارة الأصناف والكميات ومتابعة حالة المخزون
                    </p>
                </div>
                {canAddDrug && (
                    <div className="flex items-center gap-2 shrink-0">
                        <Link
                            href="/dashboard/inventory/import"
                            title="استيراد Excel"
                            className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 sm:px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted shadow-sm"
                        >
                            <FileSpreadsheet className="h-4 w-4 text-success shrink-0" />
                            <span className="hidden sm:block">استيراد Excel</span>
                        </Link>
                        <Link
                            href="/dashboard/inventory/create"
                            title="إضافة للمخزون"
                            className="flex items-center gap-2 rounded-lg bg-primary px-3 sm:px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
                        >
                            <Plus className="h-4 w-4 shrink-0" />
                            <span className="hidden sm:block">إضافة للمخزون</span>
                        </Link>
                    </div>
                )}
            </div>

            {/* فلتر الفرع */}
            <BranchFilter
                currentBranch={branchId}
                baseUrl="/dashboard/inventory"
                extraParams={query ? `query=${query}` : undefined}
            />

            {/* البحث + تبويبات الحالة + العدّاد */}
            <div className="glass-card p-4">
                <InventoryFilters
                    counts={counts}
                    currentStatus={status}
                    currentQuery={query}
                />
            </div>

            {/* الإدخال السريع بالباركود */}
            <QuickBarcodeEntry branches={branches} />

            {/* الجدول */}
            <InventoryTable items={items} canEditDrug={canEditDrug} canDeleteDrug={canDeleteDrug} canAddDrug={canAddDrug} />

            {/* الترقيم */}
            <div className="flex justify-center items-center gap-4">
                <Link
                    href={buildPageUrl(Math.max(1, currentPage - 1))}
                    className={`p-2 rounded-lg border border-border ${currentPage <= 1 ? 'pointer-events-none opacity-50 bg-muted' : 'hover:bg-muted/50'}`}
                >
                    <ChevronRight className="w-5 h-5" />
                </Link>
                <span className="text-sm text-muted-foreground font-bold">
                    صفحة {currentPage} من {totalPages}
                </span>
                <Link
                    href={buildPageUrl(Math.min(totalPages, currentPage + 1))}
                    className={`p-2 rounded-lg border border-border ${currentPage >= totalPages ? 'pointer-events-none opacity-50 bg-muted' : 'hover:bg-muted/50'}`}
                >
                    <ChevronLeft className="w-5 h-5" />
                </Link>
            </div>
        </div>
    );
}
