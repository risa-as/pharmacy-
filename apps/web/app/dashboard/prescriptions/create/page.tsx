export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import CreatePrescriptionForm from "@/app/ui/prescriptions/create-form";
import { FileText } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function CreatePrescriptionPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { tenantBranchWhere } = tenantCtx;

    const [patients, drugs] = await Promise.all([
        prisma.patient.findMany({
            where: tenantBranchWhere,
            select: { id: true, name: true, phone: true },
            orderBy: { name: "asc" },
        }),
        prisma.globalDrug.findMany({
            select: { id: true, tradeName: true, barcode: true },
            where: { isActive: true },
            orderBy: { tradeName: "asc" },
            take: 100,
        }),
    ]);

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
