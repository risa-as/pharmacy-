import EditForm from "@/app/ui/organizations/edit-form";
import Breadcrumbs from "@/app/ui/dashboard/breadcrumbs";
import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";

// Use a global prisma client or create one if not exists
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function Page({ params }: { params: { id: string } }) {
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
