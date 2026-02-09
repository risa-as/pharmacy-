import { notFound } from "next/navigation";
import EditForm from "@/app/ui/prescriptions/edit-form";
import { getPrescriptionById } from "@/app/lib/actions/prescription";
import { PrismaClient } from "@prisma/client";
import { Button } from "@faramace/ui";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function Page({ params }: { params: { id: string } }) {
    const prescription = await getPrescriptionById(params.id);
    const patients = await prisma.patient.findMany({
        select: { id: true, name: true, phone: true },
        orderBy: { name: "asc" },
    });

    if (!prescription) {
        notFound();
    }

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/prescriptions">
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                        <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">تعديل الوصفة</h1>
                        <p className="text-sm text-gray-500">{prescription.patient.name}</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <EditForm prescription={prescription} patients={patients} />
            </div>
        </div>
    );
}
