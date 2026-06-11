export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { Package, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import InventoryTable from "@/app/ui/inventory/inventory-table";
import InventoryFilters from "@/app/ui/inventory/inventory-filters";
import QuickBarcodeEntry from "@/app/ui/inventory/quick-barcode-entry";
import { getTenantContext } from '@/app/lib/tenant-utils';
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
    const searchWhere = query ? {
        drug: {
            OR: [
                { tradeName: { contains: query, mode: 'insensitive' as const } },
                { scientificName: { contains: query, mode: 'insensitive' as const } },
                { barcode: { contains: query } },
            ]
        }
    } : {};

    const where = { ...searchWhere, ...tenantBranchWhere, ...(branchId ? { branchId } : {}) };

    // Fetch all items (minimal) for counts + status filter
    const allMinimal = await prisma.inventory.findMany({
        where,
        orderBy: { drug: { tradeName: 'asc' } },
        select: {
            id: true,
            minStock: true,
            maxStock: true,
            batches: { select: { quantity: true } },
        },
    });

    const withStock = allMinimal.map((item) => ({
        id: item.id,
        stock: item.batches.reduce((sum, b) => sum + b.quantity, 0),
        minStock: item.minStock,
        maxStock: item.maxStock,
    }));

    const counts = {
        total: withStock.length,
        shortage: withStock.filter((i) => i.stock === 0).length,
        low: withStock.filter((i) => i.stock > 0 && i.stock < i.minStock).length,
        good: withStock.filter((i) => i.stock >= i.minStock && i.stock <= i.maxStock).length,
        surplus: withStock.filter((i) => i.stock > i.maxStock).length,
    };

    let filtered = withStock;
    if (status === 'shortage') filtered = withStock.filter((i) => i.stock === 0);
    else if (status === 'low') filtered = withStock.filter((i) => i.stock > 0 && i.stock < i.minStock);
    else if (status === 'good') filtered = withStock.filter((i) => i.stock >= i.minStock && i.stock <= i.maxStock);
    else if (status === 'surplus') filtered = withStock.filter((i) => i.stock > i.maxStock);

    const skip = (page - 1) * ITEMS_PER_PAGE;
    const pageIds = filtered.slice(skip, skip + ITEMS_PER_PAGE).map((i) => i.id);

    // Fetch full data for the current page IDs
    const inventory = await prisma.inventory.findMany({
        where: { id: { in: pageIds } },
        orderBy: { drug: { tradeName: 'asc' } },
        include: { batches: true, branch: true, drug: true },
    });

    // Maintain order from pageIds
    const inventoryMap = new Map(inventory.map((i) => [i.id, i]));
    const ordered = pageIds.map((id) => inventoryMap.get(id)).filter(Boolean) as typeof inventory;

    return {
        items: ordered.map((item) => ({
            ...item,
            currentStock: item.batches.reduce((acc, b) => acc + b.quantity, 0),
        })),
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / ITEMS_PER_PAGE),
        counts,
    };
}

async function getBranches(branchModelWhere: any) {
    return await prisma.branch.findMany({
        where: branchModelWhere,
        select: { id: true, name: true },
    });
}

export default async function Page({
    searchParams,
}: {
    searchParams?: {
        query?: string;
        page?: string;
        branch?: string;
        status?: string;
    };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, branchModelWhere } = tenantCtx;

    const query = searchParams?.query || "";
    const currentPage = Number(searchParams?.page) || 1;
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
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <Package className="w-6 h-6 text-primary" />
                        جرد المخزون
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        إدارة الأصناف والكميات ومتابعة حالة المخزون
                    </p>
                </div>
                {canAddDrug && (
                    <Link
                        href="/dashboard/inventory/create"
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        إضافة للمخزون
                    </Link>
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
