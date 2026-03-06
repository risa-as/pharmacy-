import { PrismaClient } from "@prisma/client";
import { PackageMinus, Trash2, AlertTriangle, Clock } from "lucide-react";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function ExpiredDamagedPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // Get all batches with their inventory and drug info
    const batches = await prisma.batch.findMany({
        where: {
            quantity: { gt: 0 },
            inventory: tenantBranchWhere
        },
        include: {
            inventory: {
                include: {
                    drug: true,
                    branch: true,
                },
            },
        },
        orderBy: { expiryDate: "asc" },
    });

    // Categorize
    const expired = batches.filter(b => new Date(b.expiryDate) < now);
    const expiringSoon = batches.filter(b => {
        const exp = new Date(b.expiryDate);
        return exp >= now && exp <= thirtyDaysFromNow;
    });
    const safe = batches.filter(b => new Date(b.expiryDate) > thirtyDaysFromNow);

    const expiredValue = expired.reduce((sum, b) => sum + b.quantity * b.costPrice, 0);
    const expiringSoonValue = expiringSoon.reduce((sum, b) => sum + b.quantity * b.costPrice, 0);

    const fmt = (v: number) => new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(v);

    const allAlerts = [...expired.map(b => ({ ...b, status: "expired" as const })), ...expiringSoon.map(b => ({ ...b, status: "expiring" as const }))];

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <PackageMinus className="w-7 h-7 text-destructive" />
                    التوالف والمنتهية الصلاحية
                </h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-destructive/10 rounded-xl border border-red-200 p-4">
                    <div className="text-3xl font-bold text-destructive">{expired.length}</div>
                    <div className="text-sm text-destructive">دفعة منتهية</div>
                </div>
                <div className="bg-warning/10 rounded-xl border border-orange-200 p-4">
                    <div className="text-3xl font-bold text-warning">{expiringSoon.length}</div>
                    <div className="text-sm text-warning">تنتهي خلال 30 يوم</div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-2xl font-bold text-destructive">{fmt(expiredValue)}</div>
                    <div className="text-sm text-muted-foreground">قيمة المنتهية (د.ع)</div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="text-2xl font-bold text-warning">{fmt(expiringSoonValue)}</div>
                    <div className="text-sm text-muted-foreground">قيمة قريبة الانتهاء (د.ع)</div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                {allAlerts.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <PackageMinus className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p className="font-bold">لا توجد أدوية منتهية أو قريبة الانتهاء</p>
                        <p className="text-sm mt-1">جميع الدفعات ضمن فترة الصلاحية</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold">#</th>
                                <th className="px-4 py-3 text-right font-bold">الدواء</th>
                                <th className="px-4 py-3 text-right font-bold">رقم الدفعة</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">الكمية</th>
                                <th className="px-4 py-3 text-right font-bold">سعر التكلفة</th>
                                <th className="px-4 py-3 text-right font-bold">تاريخ الانتهاء</th>
                                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {allAlerts.map((batch, idx) => {
                                const daysLeft = Math.ceil(
                                    (new Date(batch.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                                );
                                return (
                                    <tr key={batch.id} className="hover:bg-muted">
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-sm">{idx + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-foreground">{batch.inventory.drug.tradeName}</div>
                                            <div className="text-xs text-muted-foreground">{batch.inventory.drug.barcode}</div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-sm font-mono">{batch.batchNumber}</td>
                                        <td className="px-4 py-3 text-muted-foreground text-sm">{batch.inventory.branch.name}</td>
                                        <td className="px-4 py-3 font-bold">{batch.quantity}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{fmt(batch.costPrice)}</td>
                                        <td className="px-4 py-3 text-sm" suppressHydrationWarning>
                                            {new Date(batch.expiryDate).toLocaleDateString("ar-IQ")}
                                        </td>
                                        <td className="px-4 py-3">
                                            {batch.status === "expired" ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive">
                                                    <Trash2 className="w-3 h-3" />
                                                    منتهي
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
                                                    <Clock className="w-3 h-3" />
                                                    {daysLeft} يوم
                                                </span>
                                            )}
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
