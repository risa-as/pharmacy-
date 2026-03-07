import { prisma } from "@/app/lib/prisma";
import { AlertTriangle, ArrowDown } from "lucide-react";
import Link from "next/link";

import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';


export default async function ShortagesPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    // Get all inventory items where current stock <= minStock
    const inventory = await prisma.inventory.findMany({
        where: tenantBranchWhere,
        include: {
            drug: true,
            branch: true,
            batches: true,
        },
        orderBy: { drug: { tradeName: "asc" } },
    });

    const shortages = inventory
        .map(item => ({
            ...item,
            currentStock: item.batches.reduce((sum, b) => sum + b.quantity, 0),
        }))
        .filter(item => item.currentStock <= item.minStock);

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <AlertTriangle className="w-7 h-7 text-warning" />
                    النواقص
                </h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{shortages.length}</div>
                    <div className="text-sm text-muted-foreground">أصناف ناقصة</div>
                </div>
                <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-destructive">
                        {shortages.filter(s => s.currentStock === 0).length}
                    </div>
                    <div className="text-sm text-destructive">نفدت بالكامل</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-orange-200 p-4">
                    <div className="text-3xl font-bold text-warning">
                        {shortages.filter(s => s.currentStock > 0 && s.currentStock <= s.minStock).length}
                    </div>
                    <div className="text-sm text-warning">أقل من الحد الأدنى</div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {shortages.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p className="font-bold">لا توجد نواقص حالياً</p>
                        <p className="text-sm mt-1">جميع الأصناف متوفرة بكمية كافية</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">#</th>
                                <th className="px-4 py-3 text-right font-bold">الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">الكمية الحالية</th>
                                <th className="px-4 py-3 text-right font-bold">الحد الأدنى</th>
                                <th className="px-4 py-3 text-right font-bold">النقص</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {shortages.map((item, idx) => (
                                <tr key={item.id} className="hover:bg-muted">
                                    <td className="px-4 py-3 text-muted-foreground font-mono text-sm">{idx + 1}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-foreground">{item.drug.tradeName}</div>
                                        <div className="text-xs text-muted-foreground">{item.drug.barcode}</div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-sm">{item.branch.name}</td>
                                    <td className="px-4 py-3 font-bold text-destructive">{item.currentStock}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{item.minStock}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 text-destructive font-bold">
                                            <ArrowDown className="w-3 h-3" />
                                            {item.minStock - item.currentStock}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.currentStock === 0 ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive">
                                                نفد
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
                                                منخفض
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
