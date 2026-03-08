export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { notFound } from "next/navigation";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import EditUserForm from "@/app/ui/users/edit-form";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';


async function getBranches(tenantWhere: any) {
    return await prisma.branch.findMany({
        where: tenantWhere,
        orderBy: { name: 'asc' },
    });
}

async function getUser(id: string, tenantBranchWhere: any) {
    return await prisma.user.findUnique({
        where: { id, ...tenantBranchWhere },
        include: { branch: true },
    });
}

export default async function EditUserPage({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantWhere, tenantBranchWhere } = tenantCtx;

    const [user, branches] = await Promise.all([
        getUser(params.id, tenantBranchWhere),
        getBranches(tenantWhere),
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
