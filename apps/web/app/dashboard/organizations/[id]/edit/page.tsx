export const dynamic = 'force-dynamic';

import EditForm from "@/app/ui/organizations/edit-form";
import Breadcrumbs from "@/app/ui/dashboard/breadcrumbs";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";

export default async function Page({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");

    const id = params.id;
    // Scope: non-SUPER_ADMIN may only edit their own org
    const allowedId = tenantCtx.user.role === 'SUPER_ADMIN' ? id : tenantCtx.organizationId;
    if (allowedId !== id) notFound();
    const organization = await prisma.organization.findUnique({
        where: { id },
    });

    if (!organization) {
        notFound();
    }

    return (
        <main>
            <Breadcrumbs
                breadcrumbs={[
                    { label: "المنظمات", href: "/dashboard/organizations" },
                    {
                        label: "تعديل المنظمة",
                        href: `/dashboard/organizations/${id}/edit`,
                        active: true,
                    },
                ]}
            />
            <EditForm organization={organization} />
        </main>
    );
}
