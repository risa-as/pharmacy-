import { PrismaClient } from "@prisma/client";
import { Box, AlertTriangle, Calendar, Plus } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/app/lib/utils/currency";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export default async function BatchesPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null; // Handle generically for server component
    const { tenantBranchWhere } = tenantCtx;

    const batches = await prisma.batch.findMany({
        where: {
            inventory: {
                ...tenantBranchWhere
            }
        },
        orderBy: { expiryDate: "asc" },
        include: {
            inventory: {
                include: {
                    branch: true,
                },
            },
            supplier: { select: { name: true } },
        },
    });

    // جلب الأدوية
    const drugIds = batches.map((b) => b.inventory.drugId);
    const uniqueDrugIds = drugIds.filter((id, index) => drugIds.indexOf(id) === index);
    const drugs = await prisma.globalDrug.findMany({
        where: { id: { in: uniqueDrugIds } },
        select: { id: true, tradeName: true },
    });
    const drugMap = new Map(drugs.map((d) => [d.id, d]));

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return (
        <div className="glass-card w-full p-6">
            {/* Header */}
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Box className="w-7 h-7 text-primary" />
                    إدارة الدفعات
                </h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold text-foreground">{batches.length}</div>
                    <div className="text-sm text-muted-foreground">إجمالي الدفعات</div>
                </div>
                <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-destructive">
                        {batches.filter((b) => new Date(b.expiryDate) < now).length}
                    </div>
                    <div className="text-sm text-destructive">منتهية الصلاحية</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-warning/30 p-4">
                    <div className="text-3xl font-bold text-warning">
                        {batches.filter((b) => {
                            const exp = new Date(b.expiryDate);
                            return exp >= now && exp <= thirtyDaysFromNow;
                        }).length}
                    </div>
                    <div className="text-sm text-warning">ستنتهي خلال 30 يوم</div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {batches.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Box className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد دفعات مسجلة</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">المورد</th>
                                <th className="px-4 py-3 text-right font-bold">رقم الدفعة</th>
                                <th className="px-4 py-3 text-right font-bold">سعر الشراء (للوحدة)</th>
                                <th className="px-4 py-3 text-right font-bold">الكمية</th>
                                <th className="px-4 py-3 text-right font-bold">تاريخ الانتهاء</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {batches.map((batch) => {
                                const drug = drugMap.get(batch.inventory.drugId);
                                const expiryDate = new Date(batch.expiryDate);
                                const isExpired = expiryDate < now;
                                const isExpiringSoon = expiryDate >= now && expiryDate <= thirtyDaysFromNow;

                                let statusClass = "bg-success/10 text-success";
                                let statusText = "صالح";

                                if (isExpired) {
                                    statusClass = "bg-destructive/10 text-destructive";
                                    statusText = "منتهي";
                                } else if (isExpiringSoon) {
                                    statusClass = "bg-warning/20 text-warning";
                                    statusText = "قريب الانتهاء";
                                }

                                return (
                                    <tr key={batch.id} className="hover:bg-muted">
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            {drug?.tradeName || "غير معروف"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {batch.inventory.branch?.name || "غير محدد"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {batch.supplier?.name || <span className="text-muted-foreground/50">—</span>}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                                            {batch.batchNumber}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-foreground" dir="ltr">
                                            {formatCurrency(batch.costPrice)}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-foreground">
                                            {batch.quantity}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {expiryDate.toLocaleDateString("ar-IQ")}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusClass}`}>
                                                {statusText}
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
