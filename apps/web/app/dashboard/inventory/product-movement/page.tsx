export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { Activity, ArrowUpDown, Search, Package, TrendingUp, TrendingDown, ScanBarcode } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';


type Movement = {
    date: Date;
    type: string;
    quantity: number;
    reference: string;
    branch: string;
};

// أنماط ألوان شارة نوع الحركة
const TYPE_STYLES: Record<string, string> = {
    "شراء": "bg-success/10 text-success border-success/20",
    "بيع": "bg-destructive/10 text-destructive border-destructive/20",
    "مرتجع": "bg-info/10 text-info border-info/20",
    "تحويل وارد": "bg-primary/10 text-primary border-primary/20",
    "تحويل صادر": "bg-warning/10 text-warning border-warning/20",
    "تسوية جرد": "bg-muted text-muted-foreground border-border",
};

const STOCKTAKE_REASON_LABELS: Record<string, string> = {
    EXPIRED: "منتهي الصلاحية",
    DAMAGED: "تالف",
    MISSING: "نقص جرد",
    FOUND: "زيادة جرد",
};

export default async function ProductMovementPage({
    searchParams,
}: {
    searchParams?: { q?: string; barcode?: string; drugId?: string; branch?: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere, organizationId } = tenantCtx;

    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'productMovement');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    // البحث بالباركود أو الاسم (q)؛ والاختيار من قائمة المطابقات (drugId). ندعم barcode القديم للتوافق.
    const query = (searchParams?.q ?? searchParams?.barcode)?.trim();
    const selectedDrugId = searchParams?.drugId?.trim();
    const selectedBranchId = searchParams?.branch;

    // فلتر الفرع للنماذج التي تملك علاقة branch مباشرة (Sale/Purchase/SaleReturn/Stocktake)
    const branchFilter: any = selectedBranchId
        ? { ...tenantBranchWhere, branchId: selectedBranchId }
        : tenantBranchWhere;

    // فلتر الفرع لنموذج التحويل (يستخدم fromBranch/toBranch بدل branch)
    const transferScope = (idField: 'fromBranchId' | 'toBranchId', relField: 'fromBranch' | 'toBranch'): any => {
        if (selectedBranchId) return { [idField]: selectedBranchId };
        if ((tenantBranchWhere as any).branchId) return { [idField]: (tenantBranchWhere as any).branchId };
        if ((tenantBranchWhere as any).branch) return { [relField]: (tenantBranchWhere as any).branch };
        return {};
    };

    let movements: Movement[] = [];
    let selectedDrug: { tradeName: string; barcode: string } | null = null;
    let matches: { id: string; tradeName: string; scientificName: string; barcode: string }[] = [];
    let notFound = false;
    let totalIn = 0;
    let totalOut = 0;

    // نطاق رؤية الأدوية: أدوية المنظمة الحالية + الكتالوج العام
    const orgDrugScope: any = organizationId ? { OR: [{ organizationId }, { organizationId: null }] } : {};

    if (selectedDrugId || query) {
        // حلّ الدواء: منتج محدّد من القائمة (drugId)، أو أفضل تطابق لنص البحث (باركود/اسم)
        let drug: { id: string; tradeName: string; barcode: string } | null = null;

        if (selectedDrugId) {
            drug = await prisma.globalDrug.findFirst({
                where: { id: selectedDrugId, ...orgDrugScope },
                select: { id: true, tradeName: true, barcode: true },
            });
            if (!drug) notFound = true;
        } else if (query) {
            const found = await prisma.globalDrug.findMany({
                where: {
                    AND: [
                        orgDrugScope,
                        {
                            OR: [
                                { barcode: query },
                                { tradeName: { contains: query, mode: 'insensitive' } },
                                { scientificName: { contains: query, mode: 'insensitive' } },
                            ],
                        },
                    ],
                },
                orderBy: [{ organizationId: { sort: 'desc', nulls: 'last' } }, { tradeName: 'asc' }],
                select: { id: true, tradeName: true, scientificName: true, barcode: true },
                take: 25,
            });

            if (found.length === 0) {
                notFound = true;
            } else {
                const exact = found.find((d) => d.barcode === query); // مطابقة باركود تامة (مسح ضوئي) → اختيار مباشر
                if (exact) drug = exact;
                else if (found.length === 1) drug = found[0];
                else matches = found; // عدة نتائج بالاسم → قائمة اختيار
            }
        }

        if (drug) {
            selectedDrug = { tradeName: drug.tradeName, barcode: drug.barcode };

            const [saleItems, purchaseItems, returnItems, transferOut, transferIn, stocktakeItems] = await Promise.all([
                // المبيعات (صادر)
                prisma.saleItem.findMany({
                    where: { drugId: drug.id, sale: branchFilter },
                    include: { sale: { include: { branch: true } } },
                    orderBy: { sale: { createdAt: "desc" } },
                    take: 100,
                }),
                // المشتريات (وارد)
                prisma.purchaseItem.findMany({
                    where: { drugId: drug.id, purchase: branchFilter },
                    include: { purchase: { include: { branch: true } } },
                    orderBy: { purchase: { createdAt: "desc" } },
                    take: 100,
                }),
                // المرتجعات (وارد — تُعاد للمخزون)
                prisma.saleReturnItem.findMany({
                    where: { drugId: drug.id, saleReturn: branchFilter },
                    include: { saleReturn: { include: { branch: true } } },
                    orderBy: { saleReturn: { createdAt: "desc" } },
                    take: 100,
                }),
                // التحويلات الصادرة (يُخصم المخزون عند الإنشاء)
                prisma.transferItem.findMany({
                    where: {
                        drugId: drug.id,
                        transfer: { ...transferScope('fromBranchId', 'fromBranch'), status: { in: ['IN_TRANSIT', 'COMPLETED'] } },
                    },
                    include: { transfer: { include: { fromBranch: true, toBranch: true } } },
                    orderBy: { transfer: { createdAt: "desc" } },
                    take: 100,
                }),
                // التحويلات الواردة (يُضاف المخزون عند الاستلام فقط)
                prisma.transferItem.findMany({
                    where: {
                        drugId: drug.id,
                        transfer: { ...transferScope('toBranchId', 'toBranch'), status: 'COMPLETED' },
                    },
                    include: { transfer: { include: { fromBranch: true, toBranch: true } } },
                    orderBy: { transfer: { updatedAt: "desc" } },
                    take: 100,
                }),
                // تسويات الجرد المكتملة (± الفرق)
                prisma.stocktakeItem.findMany({
                    where: {
                        difference: { not: 0 },
                        batch: { inventory: { drugId: drug.id } },
                        stocktake: { status: 'COMPLETED', ...branchFilter },
                    },
                    include: { stocktake: { include: { branch: true } } },
                    orderBy: { stocktake: { createdAt: "desc" } },
                    take: 100,
                }),
            ]);

            for (const si of saleItems) {
                movements.push({ date: si.sale.createdAt, type: "بيع", quantity: -si.quantity, reference: `فاتورة #${si.saleId.slice(0, 8)}`, branch: si.sale.branch.name });
                totalOut += si.quantity;
            }
            for (const pi of purchaseItems) {
                movements.push({ date: pi.purchase.createdAt, type: "شراء", quantity: pi.quantity, reference: `مشتريات #${pi.purchaseId.slice(0, 8)}`, branch: pi.purchase.branch.name });
                totalIn += pi.quantity;
            }
            for (const ri of returnItems) {
                const ref = ri.saleReturn.returnNumber ? `مرتجع #${ri.saleReturn.returnNumber}` : `مرتجع #${ri.saleReturnId.slice(0, 8)}`;
                movements.push({ date: ri.saleReturn.createdAt, type: "مرتجع", quantity: ri.quantity, reference: ref, branch: ri.saleReturn.branch.name });
                totalIn += ri.quantity;
            }
            for (const ti of transferOut) {
                movements.push({ date: ti.transfer.createdAt, type: "تحويل صادر", quantity: -ti.quantity, reference: `إلى ${ti.transfer.toBranch.name}`, branch: ti.transfer.fromBranch.name });
                totalOut += ti.quantity;
            }
            for (const ti of transferIn) {
                movements.push({ date: ti.transfer.updatedAt, type: "تحويل وارد", quantity: ti.quantity, reference: `من ${ti.transfer.fromBranch.name}`, branch: ti.transfer.toBranch.name });
                totalIn += ti.quantity;
            }
            for (const sti of stocktakeItems) {
                const ref = sti.reason ? STOCKTAKE_REASON_LABELS[sti.reason] || "جرد مخزون" : "جرد مخزون";
                movements.push({ date: sti.stocktake.createdAt, type: "تسوية جرد", quantity: sti.difference, reference: ref, branch: sti.stocktake.branch.name });
                if (sti.difference > 0) totalIn += sti.difference; else totalOut += Math.abs(sti.difference);
            }

            movements.sort((a, b) => b.date.getTime() - a.date.getTime());
            movements = movements.slice(0, 300);
        }
    }

    const net = totalIn - totalOut;
    const sp = new URLSearchParams();
    if (query) sp.set('q', query);
    if (selectedDrugId) sp.set('drugId', selectedDrugId);
    const extraParams = sp.toString() || undefined;

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div>
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                    <Activity className="w-6 h-6 text-primary" />
                    حركة منتج
                </h1>
                <p className="text-sm text-muted-foreground mt-1">سجل كامل لحركة المخزون: بيع، شراء، مرتجعات، تحويلات، وتسويات الجرد</p>
            </div>

            {/* فلتر الفرع */}
            <BranchFilter
                currentBranch={selectedBranchId}
                baseUrl="/dashboard/inventory/product-movement"
                extraParams={extraParams}
            />

            {/* البحث بالباركود */}
            <div className="glass-card p-5">
                <form className="flex flex-col sm:flex-row gap-4 sm:items-end">
                    {selectedBranchId && (
                        <input type="hidden" name="branch" value={selectedBranchId} />
                    )}
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-foreground mb-2">باركود أو اسم المنتج</label>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                name="q"
                                defaultValue={query || ""}
                                placeholder="امسح الباركود أو اكتب اسم المنتج..."
                                autoFocus
                                className="w-full rounded-lg border border-border bg-background text-foreground pr-9 pl-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap shadow-sm"
                    >
                        <ScanBarcode className="w-4 h-4" />
                        عرض الحركة
                    </button>
                </form>
            </div>

            {notFound && (
                <div className="glass-card border-destructive/30 p-6 text-center text-destructive">
                    <p className="font-bold">لم يُعثر على منتج مطابق لـ: <span className="font-bold">{query}</span></p>
                </div>
            )}

            {matches.length > 0 && (
                <div className="glass-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="font-bold text-foreground font-cairo leading-tight">عدة منتجات مطابقة</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">{matches.length} منتج — اختر المنتج لعرض حركته</p>
                        </div>
                    </div>
                    <ul className="divide-y divide-border">
                        {matches.map((m) => {
                            const params = new URLSearchParams();
                            params.set('drugId', m.id);
                            if (query) params.set('q', query);
                            if (selectedBranchId) params.set('branch', selectedBranchId);
                            return (
                                <li key={m.id}>
                                    <Link
                                        href={`/dashboard/inventory/product-movement?${params.toString()}`}
                                        className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors group"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-bold text-foreground group-hover:text-primary transition-colors truncate">{m.tradeName}</div>
                                            {m.scientificName && <div className="text-xs text-muted-foreground truncate">{m.scientificName}</div>}
                                        </div>
                                        <span className="font-mono text-xs text-muted-foreground shrink-0" dir="ltr">{m.barcode}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {selectedDrug && (
                <>
                    {/* بطاقات الملخّص */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="glass-card p-5 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Package className="w-6 h-6 text-primary" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">المنتج</p>
                                <p className="text-lg font-bold text-foreground truncate">{selectedDrug.tradeName}</p>
                                <p className="text-xs text-muted-foreground font-mono truncate" dir="ltr">{selectedDrug.barcode}</p>
                            </div>
                        </div>
                        <div className="glass-card p-5 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                                <TrendingUp className="w-6 h-6 text-success" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">إجمالي الوارد</p>
                                <p className="text-2xl font-bold text-success" dir="ltr">+{totalIn.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground truncate">شراء + مرتجع + تحويل</p>
                            </div>
                        </div>
                        <div className="glass-card p-5 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                                <TrendingDown className="w-6 h-6 text-destructive" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">إجمالي الصادر</p>
                                <p className="text-2xl font-bold text-destructive" dir="ltr">-{totalOut.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground truncate">بيع + تحويل صادر</p>
                            </div>
                        </div>
                        <div className="glass-card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${net >= 0 ? "bg-info/10" : "bg-warning/10"} flex items-center justify-center shrink-0`}>
                                <ArrowUpDown className={`w-6 h-6 ${net >= 0 ? "text-info" : "text-warning"}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground truncate">صافي الحركة</p>
                                <p className={`text-2xl font-bold ${net >= 0 ? "text-info" : "text-warning"}`} dir="ltr">{net > 0 ? "+" : ""}{net.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground truncate">الوارد − الصادر</p>
                            </div>
                        </div>
                    </div>

                    {/* جدول الحركة */}
                    <div className="glass-card overflow-hidden">
                        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <ArrowUpDown className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                                <h2 className="font-bold text-foreground font-cairo leading-tight">سجل الحركة</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">{movements.length.toLocaleString()} عملية</p>
                            </div>
                        </div>
                        {movements.length === 0 ? (
                            <div className="py-16 text-center">
                                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <ArrowUpDown className="w-8 h-8 text-muted-foreground opacity-50" />
                                </div>
                                <p className="text-foreground font-medium">لا توجد حركة مسجلة لهذا المنتج</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border">
                                        <tr>
                                            <th className="px-4 py-3.5 text-right font-bold font-cairo">التاريخ</th>
                                            <th className="px-4 py-3.5 text-right font-bold font-cairo">النوع</th>
                                            <th className="px-4 py-3.5 text-right font-bold font-cairo">الكمية</th>
                                            <th className="px-4 py-3.5 text-right font-bold font-cairo">المرجع</th>
                                            <th className="px-4 py-3.5 text-right font-bold font-cairo">الفرع</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border bg-card">
                                        {movements.map((m, idx) => (
                                            <tr key={idx} className="hover:bg-muted/40 transition-colors">
                                                <td className="px-4 py-3 text-muted-foreground" suppressHydrationWarning>
                                                    {new Date(m.date).toLocaleDateString("ar-IQ", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${TYPE_STYLES[m.type] || "bg-muted text-muted-foreground border-border"}`}>
                                                        {m.type}
                                                    </span>
                                                </td>
                                                <td className={`px-4 py-3 font-bold ${m.quantity > 0 ? "text-success" : "text-destructive"}`} dir="ltr">
                                                    <span className="block text-right">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{m.reference}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{m.branch}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!query && !selectedDrugId && !notFound && (
                <div className="glass-card py-16 text-center">
                    <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <ScanBarcode className="w-8 h-8 text-muted-foreground opacity-50" />
                    </div>
                    <p className="text-foreground font-bold">ابحث بالباركود أو اسم المنتج لعرض حركته</p>
                    <p className="text-sm text-muted-foreground mt-1">ستظهر هنا جميع عمليات البيع والشراء والمرتجعات والتحويلات وتسويات الجرد للمنتج</p>
                </div>
            )}
        </div>
    );
}
