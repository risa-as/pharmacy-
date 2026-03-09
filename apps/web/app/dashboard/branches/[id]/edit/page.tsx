export const dynamic = 'force-dynamic';

import EditForm from "@/app/ui/branches/edit-form";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";

export default async function Page({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { tenantWhere } = tenantCtx;

    const id = params.id;

    const [branch, organizations] = await Promise.all([
        prisma.branch.findFirst({
            where: { id, ...tenantWhere },
        }),
        prisma.organization.findMany({
            orderBy: { name: 'asc' },
        }),
    ]);

    if (!branch) {
        notFound();
    }

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/branches" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <h1 className="text-2xl font-bold font-cairo text-foreground">تعديل الفرع</h1>
            </div>
            <EditForm branch={branch} organizations={organizations} />
        </div>
    );
}
