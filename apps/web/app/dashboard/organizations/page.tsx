import { Button } from "@faramace/ui";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { UpdateOrganization, DeleteOrganization } from "@/app/ui/organizations/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getOrganizations() {
    const orgs = await prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { branches: true } } }
    });
    return orgs;
}

export default async function Page() {
    const organizations = await getOrganizations();

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800">المنظمات</h1>
                <Button asChild className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Link href="/dashboard/organizations/create">
                        <PlusIcon className="h-4 w-4" />
                        <span className="hidden md:block font-bold">إضافة منظمة</span>
                    </Link>
                </Button>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                        <table className="min-w-full text-gray-900 table-fixed">
                            <thead className="bg-gray-50 text-right text-sm font-semibold text-gray-900 border-b border-gray-200">
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
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {organizations.map((org) => (
                                    <tr
                                        key={org.id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <div className="flex items-center gap-3">
                                                <div className="font-medium text-gray-900">{org.name}</div>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500 text-right">
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
                                        <td colSpan={3} className="px-6 py-10 text-center text-gray-500">
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
