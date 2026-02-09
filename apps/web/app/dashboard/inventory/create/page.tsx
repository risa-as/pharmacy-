import { PrismaClient } from "@prisma/client";
import CreateInventoryForm from "@/app/ui/inventory/create-form";
import { Package } from "lucide-react";

const prisma = new PrismaClient();

export default async function CreateInventoryPage() {
    const branches = await prisma.branch.findMany({
        orderBy: { name: "asc" },
    });

    const drugs = await prisma.globalDrug.findMany({
        where: { isActive: true },
        orderBy: { tradeName: "asc" },
    });

    return (
        <main className="mx-auto max-w-2xl">
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                    <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">إضافة للمخزون</h1>
                    <p className="text-sm text-gray-500">أضف دواء جديد لمخزون الفرع</p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <CreateInventoryForm branches={branches} drugs={drugs} />
            </div>
        </main>
    );
}
