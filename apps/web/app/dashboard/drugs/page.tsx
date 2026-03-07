import { PlusIcon, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { UpdateDrug, DeleteDrug } from "@/app/ui/drugs/buttons";
import GlobalDrugSearch from "@/app/ui/drugs/global-search";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

const ITEMS_PER_PAGE = 50;

async function getDrugs(query: string, currentPage: number, organizationId: string | undefined) {
    const searchFilter = query ? {
        OR: [
            { tradeName: { contains: query } },
            { scientificName: { contains: query } },
            { barcode: { contains: query } },
        ],
    } : {};

    const where = {
        AND: [
            {
                OR: [
                    { organizationId: null },
                    ...(organizationId ? [{ organizationId }] : [])
                ]
            },
            searchFilter
        ]
    };

    const [drugs, total] = await Promise.all([
        prisma.globalDrug.findMany({
            where,
            orderBy: { tradeName: 'asc' },
            skip: (currentPage - 1) * ITEMS_PER_PAGE,
            take: ITEMS_PER_PAGE,
        }),
        prisma.globalDrug.count({ where })
    ]);

    return { drugs, total };
}

export default async function Page({
    searchParams,
}: {
    searchParams?: {
        query?: string;
        page?: string;
    };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");

    const organizationId = tenantCtx.organizationId;
    const query = searchParams?.query || "";
    const currentPage = Number(searchParams?.page) || 1;
    const { drugs, total } = await getDrugs(query, currentPage, organizationId);
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;



    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-4">
                <h1 className="text-2xl font-bold font-cairo text-foreground">قاعدة الأدوية</h1>
                <div className="flex items-center gap-2">
                    {/* Moved from sidebar per MVP navigation audit */}
                    <Link
                        href="/dashboard/drugs/import"
                        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold border border-border/60 bg-card hover:bg-muted text-foreground transition-colors"
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span className="hidden md:block">استيراد أدوية</span>
                    </Link>
                    <Link href="/dashboard/drugs/create" className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
                        <PlusIcon className="h-4 w-4" />
                        <span className="hidden md:block">إضافة دواء جديد</span>
                    </Link>
                </div>
            </div>

            <div className="flex w-full max-w-md mb-8">
                <GlobalDrugSearch placeholder="ابحث عن دواء بالاسم التجاري أو المادة الفعالة أو الباركود..." />
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                        <table className="min-w-full text-foreground table-fixed">
                            <thead className="bg-muted text-right text-sm font-semibold text-foreground border-b border-border">
                                <tr>
                                    <th scope="col" className="px-4 py-4 font-cairo text-right w-16">
                                        #
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right w-36">
                                        الباركود
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right w-1/4">
                                        الاسم التجاري
                                    </th>
                                    <th scope="col" className="px-3 py-5 font-bold w-1/4">
                                        الاسم العلمي
                                    </th>
                                    <th scope="col" className="px-3 py-5 font-bold">
                                        المصدر
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo text-right">
                                        الحالة
                                    </th>
                                    <th scope="col" className="px-3 py-5 font-bold">
                                        الإجراءات
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-card">
                                {drugs.map((drug, index) => (
                                    <tr
                                        key={drug.id}
                                        className="w-full border-b text-sm last-of-type:border-none hover:bg-muted transition-colors"
                                    >
                                        <td className="px-4 py-4 font-mono text-muted-foreground text-right">
                                            {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 font-mono text-muted-foreground text-right" dir="ltr">
                                            {drug.barcode}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-foreground whitespace-normal break-words">
                                            {drug.tradeName}
                                        </td>
                                        <td className="px-3 py-4 text-muted-foreground whitespace-normal break-words">
                                            {drug.scientificName}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">
                                            {drug.origin || '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right">
                                            {drug.isActive ? (
                                                <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success ring-1 ring-inset ring-green-600/20">نشط</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive ring-1 ring-inset ring-red-600/20">غير نشط</span>
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
                                        <td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">
                                            لا توجد أدوية مطابقة للبحث.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3 sm:px-6 mt-auto">
                                <div className="flex flex-1 justify-between sm:hidden">
                                    <Link
                                        href={`/dashboard/drugs?page=${currentPage - 1}${query ? `&query=${query}` : ''}`}
                                        className={`relative inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium ${currentPage <= 1 ? 'pointer-events-none text-muted-foreground/40' : 'text-foreground hover:bg-muted'}`}
                                    >
                                        السابق
                                    </Link>
                                    <Link
                                        href={`/dashboard/drugs?page=${currentPage + 1}${query ? `&query=${query}` : ''}`}
                                        className={`relative ml-3 inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium ${currentPage >= totalPages ? 'pointer-events-none text-muted-foreground/40' : 'text-foreground hover:bg-muted'}`}
                                    >
                                        التالي
                                    </Link>
                                </div>
                                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm text-foreground font-cairo">
                                            إظهار <span className="font-medium font-mono">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> إلى <span className="font-medium font-mono">{Math.min(currentPage * ITEMS_PER_PAGE, total)}</span> من أصل <span className="font-medium font-mono">{total}</span> دواء
                                        </p>
                                    </div>
                                    <div>
                                        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination" dir="ltr">
                                            <Link
                                                href={`/dashboard/drugs?page=${currentPage - 1}${query ? `&query=${query}` : ''}`}
                                                className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-muted-foreground ring-1 ring-inset ring-gray-300 hover:bg-muted focus:z-20 focus:outline-offset-0 ${currentPage <= 1 ? 'pointer-events-none opacity-50' : ''}`}
                                            >
                                                <span className="sr-only">Previous</span>
                                                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                                </svg>
                                            </Link>
                                            <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
                                                صفحة {currentPage} من {totalPages}
                                            </span>
                                            <Link
                                                href={`/dashboard/drugs?page=${currentPage + 1}${query ? `&query=${query}` : ''}`}
                                                className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-muted-foreground ring-1 ring-inset ring-gray-300 hover:bg-muted focus:z-20 focus:outline-offset-0 ${currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}`}
                                            >
                                                <span className="sr-only">Next</span>
                                                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                                </svg>
                                            </Link>
                                        </nav>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
