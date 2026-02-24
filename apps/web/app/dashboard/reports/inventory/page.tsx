import { prisma } from "@/app/lib/prisma";
import { Package, ArrowRight, Download, AlertTriangle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { BranchFilter } from "@/app/ui/reports/branch-filter";

export default async function InventoryReportPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const inventory = await prisma.inventory.findMany({
        where: branchId ? { branchId } : {},
        include: {
            branch: true,
            batches: true,
            drug: true,
        },
    });

    // Helper to calculate total quantity from batches
    const calculateQuantity = (item: any) => {
        return item.batches.reduce((sum: number, batch: any) => sum + batch.quantity, 0);
    };

    // Calculate stats
    const totalItems = inventory.length;
    const inventoryWithQuantity = inventory.map(item => ({
        ...item,
        currentQuantity: calculateQuantity(item)
    }));

    const lowStock = inventoryWithQuantity.filter(i => i.currentQuantity <= i.minStock).length;
    const outOfStock = inventoryWithQuantity.filter(i => i.currentQuantity === 0).length;
    const healthyStock = inventoryWithQuantity.filter(i => i.currentQuantity > i.minStock).length;
    const totalValue = inventoryWithQuantity.reduce((acc, item) => acc + (item.currentQuantity * item.price), 0);

    // Check for expiring batches
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringBatches = inventory.flatMap(item =>
        item.batches.filter(batch => new Date(batch.expiryDate) <= thirtyDaysFromNow)
    ).length;

    return (
        <div className="glass-card w-full p-6" dir="rtl" suppressHydrationWarning>
            <div className="flex w-full items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/reports" className="p-2 bg-muted hover:bg-muted rounded-lg transition-colors">
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </Link>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                        <Package className="w-7 h-7 text-success" />
                        تقرير المخزون
                    </h1>
                </div>
                <button className="flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-bold text-success-foreground transition-colors hover:bg-success/90">
                    <Download className="h-4 w-4" />
                    تصدير Excel
                </button>
            </div>

            {/* Branch Filter */}
            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/reports/inventory" />
            </div>

            {/* إحصائيات */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{totalItems}</div>
                    <div className="text-sm text-muted-foreground">إجمالي الأصناف</div>
                </div>
                <div className="bg-success/10 rounded-xl border border-green-200 p-4">
                    <div className="text-3xl font-bold text-success">{healthyStock}</div>
                    <div className="text-sm text-success">مخزون جيد</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-warning/30 p-4">
                    <div className="text-3xl font-bold text-warning">{lowStock}</div>
                    <div className="text-sm text-warning">مخزون منخفض</div>
                </div>
                <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-destructive">{outOfStock}</div>
                    <div className="text-sm text-destructive">نفاد المخزون</div>
                </div>
                <div className="bg-primary/10 rounded-xl border border-primary p-4">
                    <div className="text-3xl font-bold text-primary">{totalValue.toLocaleString()}</div>
                    <div className="text-sm text-primary">قيمة المخزون</div>
                </div>
            </div>

            {/* تنبيهات */}
            {(lowStock > 0 || expiringBatches > 0) && (
                <div className="grid gap-4 sm:grid-cols-2 mb-8">
                    {lowStock > 0 && (
                        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-warning/20 rounded-xl flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-warning" />
                            </div>
                            <div>
                                <div className="font-bold text-warning">{lowStock} صنف بمخزون منخفض</div>
                                <div className="text-sm text-warning">يحتاج إلى إعادة طلب</div>
                            </div>
                        </div>
                    )}
                    {expiringBatches > 0 && (
                        <div className="bg-destructive/10 border border-red-200 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-destructive" />
                            </div>
                            <div>
                                <div className="font-bold text-destructive">{expiringBatches} دفعة تنتهي صلاحيتها قريباً</div>
                                <div className="text-sm text-destructive">خلال 30 يوم</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* جدول المخزون */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h3 className="font-bold text-foreground">تفاصيل المخزون</h3>
                </div>
                {inventory.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        لا توجد أصناف في المخزون
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الصنف</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">الكمية</th>
                                <th className="px-4 py-3 text-right font-bold">حد الأمان (Min)</th>
                                <th className="px-4 py-3 text-right font-bold">السعر</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {inventoryWithQuantity.map((item) => {
                                const isLow = item.currentQuantity <= item.minStock;
                                const isOut = item.currentQuantity === 0;
                                return (
                                    <tr key={item.id} className="hover:bg-muted">
                                        <td className="px-4 py-3 font-bold text-foreground">{item.drug.tradeName}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{item.branch.name}</td>
                                        <td className="px-4 py-3">
                                            <span className={`font-bold ${isOut ? "text-destructive" : isLow ? "text-warning" : "text-foreground"
                                                }`}>
                                                {item.currentQuantity}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{item.minStock}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{item.price.toFixed(2)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${isOut ? "bg-destructive/10 text-destructive" :
                                                isLow ? "bg-warning/20 text-warning" :
                                                    "bg-success/10 text-success"
                                                }`}>
                                                {isOut ? (
                                                    <><AlertTriangle className="w-3 h-3" /> نفاد</>
                                                ) : isLow ? (
                                                    <><AlertTriangle className="w-3 h-3" /> منخفض</>
                                                ) : (
                                                    <><CheckCircle className="w-3 h-3" /> جيد</>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
