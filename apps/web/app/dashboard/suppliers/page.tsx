export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { Plus, Users, Mail, Phone, MapPin, FileText, ShoppingCart, TrendingDown, CheckCircle2, Building2 } from "lucide-react";
import { UpdateSupplier, DeleteSupplier } from "@/app/ui/suppliers/buttons";

import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

async function getSuppliers(organizationId?: string) {
    const suppliers = await prisma.supplier.findMany({
        where: organizationId ? { organizationId } : {},
        orderBy: { createdAt: 'desc' },
        include: {
            _count: { select: { purchases: true } },
        }
    });
    return suppliers.map((s: any) => ({
        ...s,
        computedBalance: s.balance ?? 0,
    }));
}

export default async function Page() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');
    const { tenantBranchWhere, user, organizationId } = tenantCtx;

    let suppliers: Awaited<ReturnType<typeof getSuppliers>> = [];
    try {
        suppliers = await getSuppliers(user.role === 'SUPER_ADMIN' ? undefined : tenantCtx.organizationId);
    } catch (e) {
        console.error('[Suppliers Page] Failed to load suppliers:', e);
    }

    const debtSuppliers = suppliers.filter((s: any) => s.computedBalance > 0);
    const totalDebt = debtSuppliers.reduce((sum: number, s: any) => sum + s.computedBalance, 0);
    const totalPurchases = suppliers.reduce((sum: number, s: any) => sum + s._count.purchases, 0);

    return (
        <div className="space-y-6" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-primary" />
                        الموردين
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        إدارة الموردين وكشوف الحسابات
                    </p>
                </div>
                <Link
                    href="/dashboard/suppliers/create"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
                >
                    <Plus className="h-4 w-4" />
                    إضافة مورد
                </Link>
            </div>

            {/* بطاقات الإحصائيات */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">إجمالي الموردين</p>
                        <p className="text-2xl font-bold text-foreground">{suppliers.length}</p>
                    </div>
                </div>

                <div className="glass-card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                        <ShoppingCart className="w-6 h-6 text-success" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">إجمالي الفواتير</p>
                        <p className="text-2xl font-bold text-foreground">{totalPurchases}</p>
                    </div>
                </div>

                <div className={`glass-card p-5 flex items-center gap-4 ${totalDebt > 0 ? 'border-warning/40 bg-warning/5' : ''}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${totalDebt > 0 ? 'bg-warning/15' : 'bg-success/10'}`}>
                        {totalDebt > 0
                            ? <TrendingDown className="w-6 h-6 text-warning" />
                            : <CheckCircle2 className="w-6 h-6 text-success" />
                        }
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">
                            {totalDebt > 0 ? `مستحقات (${debtSuppliers.length} مورد)` : 'المستحقات'}
                        </p>
                        {totalDebt > 0 ? (
                            <p className="text-2xl font-bold text-warning" dir="ltr">
                                {totalDebt.toLocaleString('en')}
                                <span className="text-sm font-medium text-muted-foreground mr-1">د.ع</span>
                            </p>
                        ) : (
                            <p className="text-lg font-bold text-success">لا توجد مستحقات</p>
                        )}
                    </div>
                </div>
            </div>

            {/* الجدول */}
            <div className="glass-card overflow-hidden">
                {suppliers.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Users className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                        <p className="text-foreground font-medium">لا يوجد موردين مسجلين</p>
                        <p className="text-sm text-muted-foreground mt-1">أضف مورداً جديداً للبدء</p>
                        <Link
                            href="/dashboard/suppliers/create"
                            className="inline-flex items-center gap-2 mt-4 rounded-lg bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
                        >
                            <Plus className="h-4 w-4" />
                            إضافة أول مورد
                        </Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-foreground">
                            <thead className="bg-muted/60 text-right text-xs font-semibold text-muted-foreground border-b border-border uppercase tracking-wide">
                                <tr>
                                    <th scope="col" className="px-6 py-3.5 font-cairo">المورد</th>
                                    <th scope="col" className="px-6 py-3.5 font-cairo">معلومات الاتصال</th>
                                    <th scope="col" className="px-6 py-3.5 font-cairo">الرصيد المستحق</th>
                                    <th scope="col" className="px-6 py-3.5 font-cairo">الفواتير</th>
                                    <th scope="col" className="px-6 py-3.5 font-cairo text-center">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                                {suppliers.map((supplier: any) => (
                                    <tr key={supplier.id} className="hover:bg-muted/40 transition-colors group">
                                        {/* اسم المورد */}
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                                    <Building2 className="w-4 h-4 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-foreground text-sm">{supplier.name}</p>
                                                    {supplier.address && (
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                                            <MapPin className="w-3 h-3 shrink-0" />
                                                            <span className="truncate max-w-[160px]">{supplier.address}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* معلومات الاتصال */}
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {supplier.phone && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Phone className="w-3.5 h-3.5 shrink-0" />
                                                        <span dir="ltr">{supplier.phone}</span>
                                                    </div>
                                                )}
                                                {supplier.email && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Mail className="w-3.5 h-3.5 shrink-0" />
                                                        <span>{supplier.email}</span>
                                                    </div>
                                                )}
                                                {!supplier.email && !supplier.phone && (
                                                    <span className="text-muted-foreground/60 text-xs">غير متوفر</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* الرصيد */}
                                        <td className="whitespace-nowrap px-6 py-4">
                                            {supplier.computedBalance > 0 ? (
                                                <div className="inline-flex items-center gap-1.5 bg-warning/10 text-warning border border-warning/20 rounded-lg px-3 py-1">
                                                    <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                                                    <span className="font-bold text-sm" dir="ltr">
                                                        {supplier.computedBalance.toLocaleString('en-US')}
                                                    </span>
                                                    <span className="text-xs opacity-80">د.ع</span>
                                                </div>
                                            ) : (
                                                <div className="inline-flex items-center gap-1.5 bg-success/10 text-success border border-success/20 rounded-lg px-3 py-1">
                                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                                    <span className="font-bold text-sm">مسدد</span>
                                                </div>
                                            )}
                                        </td>

                                        {/* عدد الفواتير */}
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-md px-2.5 py-1">
                                                <ShoppingCart className="w-3.5 h-3.5" />
                                                {supplier._count.purchases}
                                            </span>
                                        </td>

                                        {/* الإجراءات */}
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <Link
                                                    href={`/dashboard/suppliers/${supplier.id}`}
                                                    className="rounded-lg border border-border p-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                                                    title="كشف حساب"
                                                >
                                                    <FileText className="w-4 h-4 text-primary" />
                                                </Link>
                                                <Link
                                                    href={`/dashboard/suppliers/${supplier.id}/purchases`}
                                                    className="rounded-lg border border-border p-2 hover:bg-success/10 hover:border-success/50 transition-colors"
                                                    title="فواتير الشراء"
                                                >
                                                    <ShoppingCart className="w-4 h-4 text-success" />
                                                </Link>
                                                <UpdateSupplier id={supplier.id} />
                                                <DeleteSupplier id={supplier.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
