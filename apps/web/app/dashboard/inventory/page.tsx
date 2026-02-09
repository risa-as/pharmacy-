import { PrismaClient } from "@prisma/client";
import { Package, Plus } from "lucide-react";
import Link from "next/link";
import InventoryTable from "@/app/ui/inventory/inventory-table";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getInventory() {
    const inventory = await prisma.inventory.findMany({
        orderBy: { drugId: 'asc' },
        include: {
            batches: true,
            branch: true,
        }
    });

    // Get drugs separately
    const drugIds = [...new Set(inventory.map(i => i.drugId))];
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: drugIds } },
        select: { id: true, tradeName: true, barcode: true }
    });
    const drugMap = new Map(drugs.map(d => [d.id, d]));

    return inventory.map(item => ({
        ...item,
        drug: drugMap.get(item.drugId) || { tradeName: 'دواء غير معروف', barcode: '???' },
        currentStock: item.batches.reduce((acc, b) => acc + b.quantity, 0)
    }));
}

export default async function Page() {
    const inventoryItems = await getInventory();

    return (
        <div className="w-full">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800 flex items-center gap-3">
                    <Package className="w-7 h-7 text-blue-600" />
                    جرد المخزون
                </h1>
                <Link
                    href="/dashboard/inventory/create"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                >
                    <Plus className="h-5 w-5" />
                    إضافة للمخزون
                </Link>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <InventoryTable items={inventoryItems} />
                </div>
            </div>
        </div>
    );
}
