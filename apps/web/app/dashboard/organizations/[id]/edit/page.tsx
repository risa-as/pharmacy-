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
