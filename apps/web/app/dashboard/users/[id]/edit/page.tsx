export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { notFound } from "next/navigation";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import EditUserForm from "@/app/ui/users/edit-form";
import { getTenantContext, type TenantContext } from '@/app/lib/tenant-utils';
import { USER_SAFE_SELECT, managedUserWhere } from '@/app/lib/user-scope';
import { NextResponse } from 'next/server';


// Branch rows are filtered with branchModelWhere: tenantWhere is shaped for tables
// that carry a branchId, which Branch does not (it broke the page for branch-bound users).
async function getBranches(branchModelWhere: any) {
    return await prisma.branch.findMany({
        where: branchModelWhere,
        orderBy: { name: 'asc' },
    });
}

// Only a user the caller manages, and never the stored password: the result is passed
// to a client component, so every selected field reaches the browser.
async function getUser(id: string, tenantCtx: TenantContext) {
    return await prisma.user.findFirst({
        where: { AND: [{ id }, managedUserWhere(tenantCtx)] },
        select: USER_SAFE_SELECT,
    });
}

export default async function EditUserPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { branchModelWhere } = tenantCtx;

    const [user, branches] = await Promise.all([
        getUser(params.id, tenantCtx),
        getBranches(branchModelWhere),
    ]);

    if (!user) {
        notFound();
    }

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/users" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <h1 className="text-2xl font-bold font-cairo text-foreground">تعديل المستخدم</h1>
            </div>

            <div className="rounded-xl bg-card border border-border shadow-sm p-6">
                <EditUserForm user={user} branches={branches} />
            </div>
        </div>
    );
}
