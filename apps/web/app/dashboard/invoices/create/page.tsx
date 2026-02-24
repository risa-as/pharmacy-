import Form from "@/app/ui/invoices/create-form";
import { PrismaClient } from "@prisma/client";
import { FileText } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getSuppliers() {
    return await prisma.supplier.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
}

async function getBranches() {
    return await prisma.branch.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
}

async function getDrugs() {
    return await prisma.globalDrug.findMany({
        select: { id: true, tradeName: true, barcode: true },
        where: { isActive: true },
        orderBy: { tradeName: 'asc' },
        take: 100
    });
}

export default async function Page() {
    const [suppliers, branches, drugs] = await Promise.all([
        getSuppliers(),
        getBranches(),
        getDrugs()
    ]);

    return (
        <main className="mx-auto max-w-4xl" suppressHydrationWarning>
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إنشاء فاتورة شراء</h1>
                    <p className="text-sm text-muted-foreground">أضف فاتورة شراء جديدة من المورد</p>
                </div>
            </div>

            <Form suppliers={suppliers} branches={branches} drugs={drugs} />
        </main>
    );
}
