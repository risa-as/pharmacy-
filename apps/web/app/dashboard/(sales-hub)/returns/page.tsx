export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { Undo2, Search, Calendar } from "lucide-react";
import { BranchFilter } from "@/app/ui/reports/branch-filter";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';

export default async function ReturnsPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    const { tenantBranchWhere } = tenantCtx;
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const returns = await prisma.saleReturn.findMany({
        where: branchId ? { ...tenantBranchWhere, branchId } : tenantBranchWhere,
        orderBy: { createdAt: "desc" },
        include: {
            sale: {
                include: {
                    user: true,
                    patient: true,
                }
            },
            branch: true,
            items: {
                include: {
                    drug: true
                }
            }
        },
        take: 100,
    });

    const totalReturned = returns.reduce((acc: any, r: any) => acc + r.total, 0);

    return (
        <div className="glass-card w-full p-6">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <Undo2 className="w-7 h-7 text-destructive" />
                    المرتجعات
                </h1>
            </div>

            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/returns" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                            <Undo2 className="w-5 h-5 text-destructive" />
                        </div>
                        <span className="text-sm text-muted-foreground">إجمالي المرتجعات</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{returns.length}</div>
                    <div className="text-xs text-muted-foreground">عملية إرجاع</div>
                </div>

                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
                            <Undo2 className="w-5 h-5 text-warning" />
                        </div>
                        <span className="text-sm text-muted-foreground">إجمالي المبالغ المستردة</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{totalReturned.toLocaleString()} د.ع</div>
                    <div className="text-xs text-muted-foreground">قيمة المرتجعات</div>
                </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="bg-muted p-4 border-b border-border">
                    <h2 className="font-bold text-foreground">سجل عمليات الإرجاع</h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted text-muted-foreground text-sm">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold w-16">#</th>
                                <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                                <th className="px-4 py-3 text-right font-bold">رقم الفاتورة الأصلية</th>
                                <th className="px-4 py-3 text-right font-bold">الفرع</th>
                                <th className="px-4 py-3 text-right font-bold">الكاشير (البيع)</th>
                                <th className="px-4 py-3 text-right font-bold">الأصناف المرجعة</th>
                                <th className="px-4 py-3 text-right font-bold">المبلغ المسترد</th>
                                <th className="px-4 py-3 text-right font-bold">الملاحظات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {returns.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                                        لا توجد مرتجعات مسجلة
                                    </td>
                                </tr>
                            ) : (
                                returns.map((ret: any, index: any) => (
                                    <tr key={ret.id} className="hover:bg-muted/50 transition-colors text-sm">
                                        <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-foreground">
                                                {new Date(ret.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(ret.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' })}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-muted-foreground text-xs bg-muted px-2 py-1 rounded">
                                                {ret.saleId.substring(0, 8)}...
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {ret.branch?.name || "غير محدد"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {ret.sale?.user?.name || "غير محدد"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                {ret.items.map((item: any, i: any) => (
                                                    <span key={i} className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded-md w-fit inline-block">
                                                        {item.quantity} × {item.drug?.tradeName || 'غير معروف'}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-destructive">
                                            {ret.total.toLocaleString()} د.ع
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                                            {ret.notes || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
