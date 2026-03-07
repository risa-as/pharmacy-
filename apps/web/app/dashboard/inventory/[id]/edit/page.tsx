import { notFound, redirect } from "next/navigation";
import EditForm from "@/app/ui/inventory/edit-form";
import { prisma } from "@/app/lib/prisma";

import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";

export default async function Page({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { tenantWhere, tenantBranchWhere } = tenantCtx;

    const inventory = await prisma.inventory.findFirst({
        where: { id: params.id, ...tenantBranchWhere },
        include: {
            branch: { select: { name: true } },
        },
    });

    if (!inventory) notFound();

    const drug = await prisma.globalDrug.findUnique({
        where: { id: inventory.drugId },
        select: { id: true, tradeName: true },
    });

    const inventoryWithDrug = {
        ...inventory,
        drug: drug || { id: inventory.drugId, tradeName: "دواء غير معروف" },
    };

    const branches = await prisma.branch.findMany({
        where: tenantWhere,
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
    const drugs = await prisma.globalDrug.findMany({
        select: { id: true, tradeName: true },
        orderBy: { tradeName: "asc" },
    });

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/inventory" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Package className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">تعديل المخزون</h1>
                        <p className="text-sm text-muted-foreground">{inventoryWithDrug.drug.tradeName}</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <EditForm inventory={inventoryWithDrug} branches={branches} drugs={drugs} />
            </div>
        </div>
    );
}
