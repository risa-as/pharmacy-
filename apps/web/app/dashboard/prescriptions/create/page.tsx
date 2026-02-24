import { PrismaClient } from "@prisma/client";
import CreatePrescriptionForm from "@/app/ui/prescriptions/create-form";
import { FileText } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getPatients() {
    return await prisma.patient.findMany({
        select: { id: true, name: true, phone: true },
        orderBy: { name: "asc" },
    });
}

async function getDrugs() {
    return await prisma.globalDrug.findMany({
        select: { id: true, tradeName: true, barcode: true },
        where: { isActive: true },
        orderBy: { tradeName: "asc" },
        take: 100,
    });
}

export default async function CreatePrescriptionPage() {
    const [patients, drugs] = await Promise.all([getPatients(), getDrugs()]);

    return (
        <main className="mx-auto max-w-3xl" suppressHydrationWarning>
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">وصفة طبية جديدة</h1>
                    <p className="text-sm text-muted-foreground">أضف وصفة طبية للمريض</p>
                </div>
            </div>

            <CreatePrescriptionForm patients={patients} drugs={drugs} />
        </main>
    );
}
