import { Button } from "@faramace/ui";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { UpdateDrug, DeleteDrug } from "@/app/ui/drugs/buttons";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getDrugs(query: string) {
    const drugs = await prisma.globalDrug.findMany({
        where: query ? {
            OR: [
                { tradeName: { contains: query } },
                { barcode: { contains: query } },
            ],
        } : undefined,
        orderBy: { tradeName: 'asc' },
        take: 50
    });
    return drugs;
}

export default async function Page({
    searchParams,
}: {
    searchParams?: {
        query?: string;
        page?: string;
    };
}) {
    const query = searchParams?.query || "";
    const drugs = await getDrugs(query);

    return (
        <div className="w-full" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-gray-800">قاعدة الأدوية</h1>
                <Button asChild className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Link href="/dashboard/drugs/create">
                        <PlusIcon className="h-4 w-4" />
                        <span className="hidden md:block font-bold">إضافة دواء جديد</span>
                    </Link>
                </Button>
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
                        <table className="min-w-full text-gray-900">
                            <thead className="bg-gray-50 text-right text-sm font-semibold text-gray-900 border-b border-gray-200">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الباركود
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الاسم التجاري
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الاسم العلمي
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        المصدر
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الحالة
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الإجراءات
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {drugs.map((drug) => (
                                    <tr
                                        key={drug.id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4 font-mono text-gray-600 text-right" dir="ltr">
                                            {drug.barcode}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900 text-right">
                                            {drug.tradeName}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500 text-right">
                                            {drug.scientificName}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-gray-500 text-right">
                                            {drug.origin || '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            {drug.isActive ? (
                                                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">نشط</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">غير نشط</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            <div className="flex gap-2">
                                                <UpdateDrug id={drug.id} />
                                                <DeleteDrug id={drug.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {drugs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                                            لا توجد أدوية مطابقة للبحث.
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
