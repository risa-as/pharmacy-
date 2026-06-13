export const dynamic = 'force-dynamic';

import Link from "next/link";
import { PlusIcon, Pencil, Globe, CheckCircle2, XCircle, ChevronLeft, ChevronRight, PackageSearch, Activity, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { DeleteDrug } from "@/app/ui/drugs/buttons";
import GlobalDrugSearch from "@/app/ui/drugs/global-search";

const ITEMS_PER_PAGE = 50;

// Deterministic accent colour per drug so avatar fallbacks aren't identical.
const AVATAR_COLORS = [
    'bg-blue-500/10 text-blue-500',
    'bg-emerald-500/10 text-emerald-500',
    'bg-violet-500/10 text-violet-500',
    'bg-amber-500/10 text-amber-600',
    'bg-rose-500/10 text-rose-500',
    'bg-cyan-500/10 text-cyan-500',
];
function avatarColor(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
            <div>
                <div className="text-lg font-bold leading-none text-foreground font-mono">{value.toLocaleString('en-US')}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </div>
        </div>
    );
}

async function getGlobalDrugs(query: string, currentPage: number) {
    const searchFilter = query ? {
        OR: [
            { tradeName: { contains: query, mode: 'insensitive' as const } },
            { scientificName: { contains: query, mode: 'insensitive' as const } },
            { barcode: { contains: query } },
        ],
    } : {};

    const where = { AND: [{ organizationId: null }, searchFilter] };
    const baseGlobal = { organizationId: null };

    const [drugs, total, totalCatalog, activeCount] = await Promise.all([
        prisma.globalDrug.findMany({
            where,
            orderBy: { tradeName: 'asc' },
            skip: (currentPage - 1) * ITEMS_PER_PAGE,
            take: ITEMS_PER_PAGE,
            include: { _count: { select: { saleItems: true, inventories: true } } },
        }),
        prisma.globalDrug.count({ where }),
        prisma.globalDrug.count({ where: baseGlobal }),
        prisma.globalDrug.count({ where: { organizationId: null, isActive: true } }),
    ]);

    return { drugs, total, totalCatalog, activeCount };
}

export default async function AdminDrugsPage({
    searchParams,
}: {
    searchParams?: { query?: string; page?: string };
}) {
    const query = searchParams?.query || "";
    const currentPage = Number(searchParams?.page) || 1;
    const { drugs, total, totalCatalog, activeCount } = await getGlobalDrugs(query, currentPage);
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;
    const inactiveCount = Math.max(0, totalCatalog - activeCount);

    const pageHref = (p: number) => `/dashboard/admin/drugs?page=${p}${query ? `&query=${encodeURIComponent(query)}` : ''}`;

    return (
        <div className="glass-card w-full p-6" dir="rtl" suppressHydrationWarning>
            {/* Header */}
            <div className="flex w-full flex-wrap items-start justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-500/10 shrink-0">
                        <Globe className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold font-cairo text-foreground">قاعدة الأدوية العالمية</h1>
                        <p className="text-sm text-muted-foreground mt-1">الكتالوج المشترك بين جميع المؤسسات — للقراءة فقط لدى العملاء.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/admin/drugs/import"
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold border border-border bg-card hover:bg-muted text-foreground transition-colors"
                    >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span className="hidden md:block">استيراد أدوية</span>
                    </Link>
                    <Link
                        href="/dashboard/admin/drugs/create"
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shadow-sm"
                    >
                        <PlusIcon className="h-4 w-4" />
                        <span className="hidden md:block">إضافة دواء عالمي</span>
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <StatChip icon={<Globe className="h-5 w-5" />} label="إجمالي الأدوية العالمية" value={totalCatalog} tone="bg-blue-500/10 text-blue-500" />
                <StatChip icon={<CheckCircle2 className="h-5 w-5" />} label="أدوية نشطة" value={activeCount} tone="bg-success/10 text-success" />
                <StatChip icon={<XCircle className="h-5 w-5" />} label="غير نشطة" value={inactiveCount} tone="bg-destructive/10 text-destructive" />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="w-full max-w-md">
                    <GlobalDrugSearch placeholder="ابحث بالاسم التجاري أو المادة الفعالة أو الباركود..." />
                </div>
                <div className="text-sm text-muted-foreground">
                    {query ? <>نتائج البحث: <span className="font-bold text-foreground">{total.toLocaleString('en-US')}</span></> : null}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-foreground">
                        <thead className="bg-muted text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                            <tr>
                                <th scope="col" className="px-4 py-3 font-cairo w-14">#</th>
                                <th scope="col" className="px-4 py-3 font-cairo">الدواء</th>
                                <th scope="col" className="px-4 py-3 font-cairo w-40">الباركود</th>
                                <th scope="col" className="px-4 py-3 font-cairo w-28">المصدر</th>
                                <th scope="col" className="px-4 py-3 font-cairo w-36 text-center">الاستخدام</th>
                                <th scope="col" className="px-4 py-3 font-cairo w-28">الحالة</th>
                                <th scope="col" className="px-4 py-3 font-cairo w-24">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-card">
                            {drugs.map((drug: any, index: number) => (
                                <tr key={drug.id} className="text-sm hover:bg-muted/50 transition-colors">
                                    <td className="px-4 py-3 font-mono text-muted-foreground">
                                        {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {drug.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={drug.image} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0 border border-border" />
                                            ) : (
                                                <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold shrink-0 ${avatarColor(drug.tradeName || drug.id)}`}>
                                                    {(drug.tradeName || '?').trim().charAt(0)}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="font-bold text-foreground break-words">{drug.tradeName}</div>
                                                {drug.scientificName && (
                                                    <div className="text-xs text-muted-foreground break-words">{drug.scientificName}</div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap" dir="ltr">
                                        {drug.barcode || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                        {drug.origin || '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-2">
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-md px-2 py-1" title="عدد الفروع المستخدِمة">
                                                <PackageSearch className="w-3 h-3" />
                                                {drug._count.inventories}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-md px-2 py-1" title="عدد مرات البيع">
                                                <Activity className="w-3 h-3" />
                                                {drug._count.saleItems.toLocaleString('en-US')}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {drug.isActive ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-success/20">
                                                <CheckCircle2 className="w-3 h-3" /> نشط
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive ring-1 ring-inset ring-destructive/20">
                                                <XCircle className="w-3 h-3" /> غير نشط
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <Link
                                                href={`/dashboard/admin/drugs/${drug.id}/edit`}
                                                className="inline-flex items-center justify-center rounded-lg border border-border p-2 hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-colors"
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
                                    <td colSpan={7} className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                            <PackageSearch className="h-10 w-10 opacity-40" />
                                            <p className="text-sm">{query ? 'لا توجد أدوية مطابقة للبحث.' : 'لا توجد أدوية عالمية بعد.'}</p>
                                            {query ? (
                                                <Link href="/dashboard/admin/drugs" className="text-xs text-primary hover:underline">مسح البحث وإظهار الكل</Link>
                                            ) : (
                                                <Link href="/dashboard/admin/drugs/create" className="text-xs text-primary hover:underline">إضافة أول دواء عالمي</Link>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
                        <p className="text-sm text-muted-foreground hidden sm:block">
                            إظهار <span className="font-medium font-mono text-foreground">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span>
                            {' '}–{' '}
                            <span className="font-medium font-mono text-foreground">{Math.min(currentPage * ITEMS_PER_PAGE, total)}</span>
                            {' '}من{' '}
                            <span className="font-medium font-mono text-foreground">{total.toLocaleString('en-US')}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <Link
                                href={pageHref(currentPage - 1)}
                                aria-disabled={currentPage <= 1}
                                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card transition-colors ${currentPage <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-muted text-foreground'}`}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                            <span className="text-sm font-medium text-foreground px-2">صفحة {currentPage} من {totalPages}</span>
                            <Link
                                href={pageHref(currentPage + 1)}
                                aria-disabled={currentPage >= totalPages}
                                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card transition-colors ${currentPage >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-muted text-foreground'}`}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
