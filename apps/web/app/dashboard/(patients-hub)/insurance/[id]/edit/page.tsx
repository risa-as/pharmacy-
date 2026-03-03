import { notFound } from "next/navigation";
import EditForm from "@/app/ui/insurance/edit-form";
import { PrismaClient } from "@prisma/client";

import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getInsuranceCompanyById(id: string) {
    return await prisma.insuranceCompany.findUnique({
        where: { id },
    });
}

export default async function Page({ params }: { params: { id: string } }) {
    const company = await getInsuranceCompanyById(params.id);

    if (!company) {
        notFound();
    }

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/insurance" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">تعديل شركة التأمين</h1>
                        <p className="text-sm text-muted-foreground">{company.name}</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <EditForm company={company} />
            </div>
        </div>
    );
}
