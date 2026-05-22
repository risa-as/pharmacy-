export const dynamic = 'force-dynamic';

import Link from "next/link";
import { PlusIcon, Pencil, Globe } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { DeleteDrug } from "@/app/ui/drugs/buttons";
import GlobalDrugSearch from "@/app/ui/drugs/global-search";

const ITEMS_PER_PAGE = 50;

async function getGlobalDrugs(query: string, currentPage: number) {
    const searchFilter = query ? {
        OR: [
            { tradeName: { contains: query, mode: 'insensitive' as const } },
            { scientificName: { contains: query, mode: 'insensitive' as const } },
            { barcode: { contains: query } },
        ],
    } : {};

    const where = { AND: [{ organizationId: null }, searchFilter] };

    const [drugs, total] = await Promise.all([
        prisma.globalDrug.findMany({
            where,
            orderBy: { tradeName: 'asc' },
            skip: (currentPage - 1) * ITEMS_PER_PAGE,
            take: ITEMS_PER_PAGE,
            include: { _count: { select: { saleItems: true, inventories: true } } },
        }),
        prisma.globalDrug.count({ where }),
    ]);

    return { drugs, total };
}

export default async function AdminDrugsPage({
    searchParams,
}: {
    searchParams?: { query?: string; page?: string };
}) {
    const query = searchParams?.query || "";
    const currentPage = Number(searchParams?.page) || 1;
    const { drugs, total } = await getGlobalDrugs(query, currentPage);
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;

    return (
        <div className="glass-card w-full p-6" suppressHydrationWarning>
            {/* Header */}
            <div className="flex w-full items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10">
                        <Globe className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold font-cairo text-foreground">قاعدة الأدوية العالمية</h1>
                        <p className="text-sm text-muted-foreground">الأدوية المشتركة بين جميع المنظمات — للقراءة فقط للعملاء</p>
                    </div>
                </div>
                <Link
                    href="/dashboard/admin/drugs/create"
                    className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                >
                    <PlusIcon className="h-4 w-4" />
                    <span>إضافة دواء عالمي</span>
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-3">
                <div className="rounded-xl bg-card border border-border p-4">
                    <p className="text-xs text-muted-foreground font-cairo">إجمالي الأدوية العالمية</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{total.toLocaleString('ar-SA')}</p>
                </div>
                <div className="rounded-xl bg-card border border-border p-4">
                    <p className="text-xs text-muted-foreground font-cairo">النتائج الحالية</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{drugs.length.toLocaleString('ar-SA')}</p>
                </div>
                <div className="rounded-xl bg-card border border-border p-4">
                    <p className="text-xs text-muted-foreground font-cairo">الصفحة</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{currentPage} / {totalPages}</p>
                </div>
            </div>

            {/* Search */}
            <div className="flex w-full max-w-md mb-6">
                <GlobalDrugSearch placeholder="ابحث بالاسم التجاري أو الاسم العلمي أو الباركود..." />
            </div>

            {/* Table */}
            <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                <table className="min-w-full text-foreground">
                    <thead className="bg-muted text-right text-sm font-semibold text-foreground border-b border-border">
                        <tr>
                            <th className="px-4 py-4 font-cairo text-right w-12">#</th>
                            <th className="px-6 py-4 font-cairo text-right w-36">الباركود</th>
                            <th className="px-6 py-4 font-cairo text-right">الاسم التجاري</th>
                            <th className="px-4 py-4 font-cairo text-right hidden md:table-cell">الاسم العلمي</th>
                            <th className="px-4 py-4 font-cairo text-right hidden lg:table-cell">المصدر</th>
                            <th className="px-4 py-4 font-cairo text-center hidden md:table-cell">استخدام</th>
                            <th className="px-4 py-4 font-cairo text-right">الحالة</th>
                            <th className="px-4 py-4 font-cairo text-right">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {drugs.map((drug, index) => (
                            <tr
                                key={drug.id}
                                className="hover:bg-muted/50 transition-colors text-sm"
                            >
                                <td className="px-4 py-4 font-mono text-muted-foreground text-right">
                                    {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                                </td>
                                <td className="px-6 py-4 font-mono text-muted-foreground text-right" dir="ltr">
                                    {drug.barcode}
                                </td>
                                <td className="px-6 py-4 font-bold text-foreground">
                                    {drug.tradeName}
                                </td>
                                <td className="px-4 py-4 text-muted-foreground hidden md:table-cell">
                                    {drug.scientificName}
                                </td>
                                <td className="px-4 py-4 text-muted-foreground hidden lg:table-cell">
                                    {drug.origin || '—'}
                                </td>
                                <td className="px-4 py-4 text-center hidden md:table-cell">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs text-muted-foreground">
                                            {drug._count.inventories} فرع
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {drug._count.saleItems.toLocaleString('ar-SA')} بيعة
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    {drug.isActive ? (
                                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success ring-1 ring-inset ring-green-600/20">
                                            نشط
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive ring-1 ring-inset ring-red-600/20">
                                            غير نشط
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/dashboard/admin/drugs/${drug.id}/edit`}
                                            className="inline-flex items-center justify-center rounded-md border border-border p-2 hover:bg-muted transition-colors hover:text-primary"
                                            title="تعديل"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Link>
                                        <DeleteDrug id={drug.id} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {drugs.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-6 py-16 text-center text-muted-foreground">
                                    {query ? 'لا توجد أدوية مطابقة للبحث.' : 'لا توجد أدوية عالمية بعد.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
                        <p className="text-sm text-muted-foreground font-cairo">
                            إظهار <span className="font-medium font-mono">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> إلى{' '}
                            <span className="font-medium font-mono">{Math.min(currentPage * ITEMS_PER_PAGE, total)}</span> من أصل{' '}
                            <span className="font-medium font-mono">{total}</span>
                        </p>
                        <nav className="flex items-center gap-1" dir="ltr">
                            <Link
                                href={`/dashboard/admin/drugs?page=${currentPage - 1}${query ? `&query=${query}` : ''}`}
                                className={`px-3 py-1.5 rounded-md text-sm border border-border transition-colors ${currentPage <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-muted'}`}
                            >
                                ‹
                            </Link>
                            <span className="px-3 py-1.5 text-sm font-medium">{currentPage} / {totalPages}</span>
                            <Link
                                href={`/dashboard/admin/drugs?page=${currentPage + 1}${query ? `&query=${query}` : ''}`}
                                className={`px-3 py-1.5 rounded-md text-sm border border-border transition-colors ${currentPage >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-muted'}`}
                            >
                                ›
                            </Link>
                        </nav>
                    </div>
                )}
            </div>
        </div>
    );
}
