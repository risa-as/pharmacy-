export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { Package, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import InventoryTable from "@/app/ui/inventory/inventory-table";
import QuickBarcodeEntry from "@/app/ui/inventory/quick-barcode-entry";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { BranchFilter } from "@/app/ui/reports/branch-filter";


const ITEMS_PER_PAGE = 50;

async function getInventory(page: number, query: string, tenantBranchWhere: any, branchId?: string) {
    const skip = (page - 1) * ITEMS_PER_PAGE;

    const baseWhere = query ? {
        drug: {
            OR: [
                { tradeName: { contains: query, mode: 'insensitive' as const } },
                { barcode: { contains: query } }
            ]
        }
    } : {};

    const branchFilter = branchId ? { branchId } : {};
    const where = { ...baseWhere, ...tenantBranchWhere, ...branchFilter };

    const [total, inventory] = await Promise.all([
        prisma.inventory.count({ where }),
        prisma.inventory.findMany({
            where,
            orderBy: { drug: { tradeName: 'asc' } },
            take: ITEMS_PER_PAGE,
            skip,
            include: {
                batches: true,
                branch: true,
                drug: true
            }
        })
    ]);

    return {
        items: inventory.map((item: any) => ({
            ...item,
            currentStock: item.batches.reduce((acc: any, b: any) => acc + b.quantity, 0)
        })),
        total,
        totalPages: Math.ceil(total / ITEMS_PER_PAGE)
    };
}

async function getBranches(tenantWhere: any) {
    return await prisma.branch.findMany({
        where: tenantWhere,
        select: { id: true, name: true }
    });
}

export default async function Page({
    searchParams,
}: {
    searchParams?: {
        query?: string;
        page?: string;
        branch?: string;
    };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, tenantWhere } = tenantCtx;

    const query = searchParams?.query || "";
    const currentPage = Number(searchParams?.page) || 1;
    const branchId = searchParams?.branch;

    const { items, totalPages } = await getInventory(currentPage, query, tenantBranchWhere, branchId);
    const branches = await getBranches(tenantWhere);

    const buildPageUrl = (page: number) => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        if (query) params.set("query", query);
        if (branchId) params.set("branch", branchId);
        return `/dashboard/inventory?${params.toString()}`;
    };

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Package className="w-7 h-7 text-primary" />
                    جرد المخزون
                </h1>
                <Link
                    href="/dashboard/inventory/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <Plus className="h-5 w-5" />
                    إضافة للمخزون
                </Link>
            </div>

            {/* Branch Filter */}
            <div className="mb-4">
                <BranchFilter
                    currentBranch={branchId}
                    baseUrl="/dashboard/inventory"
                    extraParams={query ? `query=${query}` : undefined}
                />
            </div>

            <QuickBarcodeEntry branches={branches} />

            <div className="mt-4 flow-root">
                <div className="overflow-x-auto">
                    <InventoryTable items={items} />

                    {/* Pagination Controls */}
                    <div className="flex justify-center items-center gap-4 mt-6">
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
            </div>
        </div>
    );
}
