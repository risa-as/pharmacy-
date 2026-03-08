export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { ShoppingCart, TrendingUp, Calendar, Package } from "lucide-react";
import Link from "next/link";
import SalesTable from "@/app/ui/dashboard/sales/sales-table";

import { getCompanySettings } from "@/app/lib/actions/settings";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { BranchFilter } from "@/app/ui/reports/branch-filter";

export default async function SalesPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    const tenantBranchWhere = 'tenantBranchWhere' in tenantCtx ? tenantCtx.tenantBranchWhere : {};
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const settings = await getCompanySettings();
    // جلب المبيعات
    const sales = await prisma.sale.findMany({
        where: branchId ? { ...tenantBranchWhere, branchId } : tenantBranchWhere,
        orderBy: { createdAt: "desc" },
        include: {
            items: {
                include: {
                    drug: true
                }
            },
            branch: true,
            user: true,
        },
        take: 100,
    });

    // إحصائيات
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySales = sales.filter((s: any) => new Date(s.createdAt) >= today);
    const todayTotal = todaySales.reduce((acc: any, s: any) => acc + s.total, 0);
    const totalItems = todaySales.reduce((acc: any, s: any) => acc + s.items.length, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthSales = sales.filter((s: any) => new Date(s.createdAt) >= thisMonth);
    const monthTotal = monthSales.reduce((acc: any, s: any) => acc + s.total, 0);

    return (
        <div className="glass-card w-full p-6">
            {/* Header */}
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-3">
                    <ShoppingCart className="w-7 h-7 text-primary" />
                    المبيعات
                </h1>
            </div>

            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/sales" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm text-muted-foreground">مبيعات اليوم</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{todayTotal.toLocaleString()} د.ع</div>
                    <div className="text-xs text-muted-foreground">{todaySales.length} عملية بيع</div>
                </div>

                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-sm text-muted-foreground">مبيعات الشهر</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{monthTotal.toLocaleString()} د.ع</div>
                    <div className="text-xs text-muted-foreground">{monthSales.length} عملية بيع</div>
                </div>

                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center">
                            <Package className="w-5 h-5 text-info" />
                        </div>
                        <span className="text-sm text-muted-foreground">أصناف اليوم</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{totalItems}</div>
                    <div className="text-xs text-muted-foreground">صنف مباع</div>
                </div>

                <div className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
                            <ShoppingCart className="w-5 h-5 text-warning" />
                        </div>
                        <span className="text-sm text-muted-foreground">إجمالي المبيعات</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{sales.length}</div>
                    <div className="text-xs text-muted-foreground">عملية مسجلة</div>
                </div>
            </div>

            {/* Sales Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="bg-muted p-4 border-b border-border">
                    <h2 className="font-bold text-foreground">سجل المبيعات</h2>
                </div>

                {sales.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p>لا توجد مبيعات مسجلة</p>
                    </div>
                ) : (
                    <SalesTable sales={sales} settings={settings} />
                )}
            </div>
        </div>
    );
}
