export const dynamic = 'force-dynamic';

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { UpdateOrganization, DeleteOrganization } from "@/app/ui/organizations/buttons";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function Page() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");

    // Scope: SUPER_ADMIN sees all orgs; ADMIN sees only their own org
    const orgWhere = tenantCtx.user.role === 'SUPER_ADMIN' ? {} : { id: tenantCtx.organizationId };
    const organizations = await prisma.organization.findMany({
        where: orgWhere,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { branches: true } } }
    });

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground">المنظمات</h1>
                <Link href="/dashboard/organizations/create" className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
                    <PlusIcon className="h-4 w-4" />
                    <span className="hidden md:block">إضافة منظمة</span>
                </Link>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                        <table className="min-w-full text-foreground table-fixed">
                            <thead className="bg-muted text-right text-sm font-semibold text-foreground border-b border-border">
                                <tr>
                                    <th scope="col" className="w-1/2 px-6 py-4 font-cairo text-right">
                                        الاسم
                                    </th>
                                    <th scope="col" className="w-1/4 px-6 py-4 font-cairo text-right">
                                        الفروع
                                    </th>
                                    <th scope="col" className="w-1/4 px-6 py-4 font-cairo text-right">
                                        الإجراءات
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-card">
                                {organizations.map((org: any) => (
                                    <tr
                                        key={org.id}
                                        className="hover:bg-muted transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <div className="flex items-center gap-3">
                                                <div className="font-medium text-foreground">{org.name}</div>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground text-right">
                                            {org._count.branches} فرع
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <div className="flex gap-2">
                                                <UpdateOrganization id={org.id} />
                                                <DeleteOrganization id={org.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {organizations.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-10 text-center text-muted-foreground">
                                            لا توجد منظمات حتى الآن.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
