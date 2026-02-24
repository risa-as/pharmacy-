import { notFound } from "next/navigation";
import EditForm from "@/app/ui/inventory/edit-form";
import { PrismaClient } from "@prisma/client";

import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getInventoryById(id: string) {
    const inventory = await prisma.inventory.findUnique({
        where: { id },
        include: {
            branch: { select: { name: true } },
        },
    });

    if (!inventory) return null;

    // Get drug info
    const drug = await prisma.globalDrug.findUnique({
        where: { id: inventory.drugId },
        select: { id: true, tradeName: true },
    });

    return {
        ...inventory,
        drug: drug || { id: inventory.drugId, tradeName: "دواء غير معروف" },
    };
}

export default async function Page({ params }: { params: { id: string } }) {
    const inventory = await getInventoryById(params.id);
    const branches = await prisma.branch.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });
    const drugs = await prisma.globalDrug.findMany({
        select: { id: true, tradeName: true },
        orderBy: { tradeName: "asc" },
    });

    if (!inventory) {
        notFound();
    }

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
                        <p className="text-sm text-muted-foreground">{inventory.drug.tradeName}</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <EditForm inventory={inventory} branches={branches} drugs={drugs} />
            </div>
        </div>
    );
}
