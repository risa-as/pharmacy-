import CreatePolicyForm from "@/app/ui/insurance/create-policy-form";
import { prisma } from "@/app/lib/prisma";

import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function Page() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { tenantBranchWhere } = tenantCtx;

    const patients = await prisma.patient.findMany({
        where: tenantBranchWhere,
        select: { id: true, name: true, phone: true },
        orderBy: { name: "asc" },
    });
    const companies = await prisma.insuranceCompany.findMany({
        select: { id: true, name: true },
        where: { isActive: true },
        orderBy: { name: "asc" },
    });

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/insurance/policies" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">إضافة بوليصة تأمين</h1>
                        <p className="text-sm text-muted-foreground">ربط مريض بشركة تأمين</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <CreatePolicyForm patients={patients} companies={companies} />
            </div>
        </div>
    );
}
