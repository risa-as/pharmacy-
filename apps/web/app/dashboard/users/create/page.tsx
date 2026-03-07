import { prisma } from "@/app/lib/prisma";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CreateUserForm from "@/app/ui/users/create-form";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';


async function getBranches(tenantWhere: any) {
    return await prisma.branch.findMany({
        where: tenantWhere,
        orderBy: { name: 'asc' },
    });
}

export default async function CreateUserPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantWhere } = tenantCtx;

    const branches = await getBranches(tenantWhere);

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/users" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <h1 className="text-2xl font-bold font-cairo text-foreground">إضافة مستخدم جديد</h1>
            </div>

            <div className="rounded-xl bg-card border border-border shadow-sm p-6">
                <CreateUserForm branches={branches} />
            </div>
        </div>
    );
}
