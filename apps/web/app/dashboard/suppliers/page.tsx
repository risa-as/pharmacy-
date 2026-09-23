export const dynamic = 'force-dynamic';

import MoreActions from '@/app/ui/order-more-actions';
import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { Plus, Users, Mail, Phone, MapPin, FileText, ShoppingCart, TrendingDown, CheckCircle2, Building2 } from "lucide-react";
import { DeleteSupplier } from "@/app/ui/suppliers/buttons";
import SupplierWarehouseLinkCell from "@/app/ui/suppliers/SupplierWarehouseLinkCell";
import { canRequestSupplierLink } from "@/app/lib/supplier-link-request";
import { checkFeatureAccess } from "@/app/lib/saas-guards";

import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

async function getSuppliers(organizationId?: string) {
    const suppliers = await prisma.supplier.findMany({
        where: organizationId ? { organizationId } : {},
        orderBy: { createdAt: 'desc' },
        include: {
            _count: { select: { purchases: true } },
            warehouse: { select: { name: true } },
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

    // عمود المذخر يظهر فقط لمؤسسة باقتها تشمل المذاخر؛ طلب الربط لمدير المؤسسة.
    const showWarehouseColumn = organizationId
        ? (await checkFeatureAccess(organizationId, 'warehouseManagement').catch(() => ({ allowed: false }))).allowed
        : false;
    const canRequestLink = !!organizationId && canRequestSupplierLink(user.role);

    // آخر طلب ربط لكل مورد — استعلام مستقل عمداً: فشله (مثلاً قبل تطبيق ترحيل
    // SupplierLinkRequest) يُخفي حالة الطلبات فقط ولا يُفرغ جدول الموردين.
    const latestRequestBySupplier = new Map<string, { id: string; status: string; decisionNote: string | null; warehouseName: string }>();
    if (showWarehouseColumn && suppliers.length > 0) {
        try {
            const reqs = await prisma.supplierLinkRequest.findMany({
                where: { supplierId: { in: suppliers.map((s: any) => s.id) } },
                orderBy: { createdAt: 'desc' },
                select: { id: true, supplierId: true, status: true, decisionNote: true, warehouse: { select: { name: true } } },
            });
            for (const r of reqs) {
                if (!latestRequestBySupplier.has(r.supplierId)) {
                    latestRequestBySupplier.set(r.supplierId, { id: r.id, status: r.status, decisionNote: r.decisionNote, warehouseName: r.warehouse.name });
                }
            }
        } catch (e) {
            console.error('[Suppliers Page] Failed to load link requests:', e);
        }
    }

    const debtSuppliers = suppliers.filter((s: any) => s.computedBalance > 0);
    const totalDebt = debtSuppliers.reduce((sum: number, s: any) => sum + s.computedBalance, 0);
    const totalPurchases = suppliers.reduce((sum: number, s: any) => sum + s._count.purchases, 0);

    return (
        <div className="min-w-0 space-y-6" dir="rtl">
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
                    <div className="min-w-0">
                        <table className="block w-[100%] min-w-0 text-foreground xl:table xl:table-fixed">
                            <thead className="hidden border-b border-border bg-muted/60 text-right text-xs font-semibold text-muted-foreground xl:table-header-group">
                                <tr>
                                    <th scope="col" className="w-[32%] px-4 py-3.5 font-cairo">المورد / معلومات الاتصال</th>
                                    <th scope="col" className="w-[20%] px-4 py-3.5 font-cairo">الرصيد / الفواتير</th>
                                    {showWarehouseColumn && (
                                        <th scope="col" className="w-[23%] px-4 py-3.5 font-cairo">المذخر على المنصة</th>
                                    )}
                                    <th scope="col" className="px-4 py-3.5 font-cairo text-center">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="block divide-y divide-border bg-card xl:table-row-group">
                                {suppliers.map((supplier: any) => (
                                    <tr key={supplier.id} className="grid min-w-0 grid-cols-1 gap-4 p-4 transition-colors hover:bg-muted/40 sm:grid-cols-2 xl:table-row xl:p-0">
                                        {/* اسم المورد */}
                                        <td className="block min-w-0 align-top xl:table-cell xl:px-4 xl:py-5">
                                            <div className="flex min-w-0 items-start gap-3">
                                                <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                                    <Building2 className="w-4 h-4 text-primary" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-words font-semibold text-foreground text-sm">{supplier.name}</p>
                                                    {supplier.address && (
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                                            <MapPin className="w-3 h-3 shrink-0" />
                                                            <span className="[overflow-wrap:anywhere]">{supplier.address}</span>
                                                        </div>
                                                    )}
                                                    <div className="mt-2 flex min-w-0 flex-col gap-1.5">
                                                        {supplier.phone && (
                                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                                                <span dir="ltr" className="min-w-0 [overflow-wrap:anywhere]">{supplier.phone}</span>
                                                            </div>
                                                        )}
                                                        {supplier.email && (
                                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                <Mail className="w-3.5 h-3.5 shrink-0" />
                                                                <span dir="ltr" className="min-w-0 [overflow-wrap:anywhere]">{supplier.email}</span>
                                                            </div>
                                                        )}
                                                        {!supplier.email && !supplier.phone && (
                                                            <span className="text-muted-foreground/60 text-xs">غير متوفر</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* الرصيد */}
                                        <td className="block min-w-0 align-top xl:table-cell xl:px-4 xl:py-5">
                                            <p className="mb-2 text-xs text-muted-foreground xl:hidden">الرصيد المستحق</p>
                                            {supplier.computedBalance > 0 ? (
                                                <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 bg-warning/10 text-warning border border-warning/20 rounded-lg px-3 py-1">
                                                    <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                                                    <span className="min-w-0 break-all font-bold text-sm" dir="ltr">
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

                                            {/* عدد الفواتير */}
                                            <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <ShoppingCart className="w-3.5 h-3.5" />
                                                {supplier._count.purchases} فاتورة
                                            </span>
                                        </td>

                                        {showWarehouseColumn && (
                                            <td className="block min-w-0 align-top [overflow-wrap:anywhere] xl:table-cell xl:px-4 xl:py-5">
                                                <p className="mb-2 text-xs text-muted-foreground xl:hidden">المذخر على المنصة</p>
                                                <SupplierWarehouseLinkCell
                                                    canRequest={canRequestLink}
                                                    supplier={{
                                                        id: supplier.id,
                                                        name: supplier.name,
                                                        warehouseName: supplier.warehouse?.name ?? null,
                                                        latestRequest: latestRequestBySupplier.get(supplier.id) ?? null,
                                                    }}
                                                />
                                            </td>
                                        )}

                                        {/* الإجراءات */}
                                        <td className="block min-w-0 align-top xl:table-cell xl:px-4 xl:py-5">
                                            <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
                                                <Link
                                                    href={`/dashboard/suppliers/${supplier.id}`}
                                                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                                                    title="كشف حساب"
                                                >
                                                    <FileText className="w-4 h-4" /> كشف الحساب
                                                </Link>
                                                <Link
                                                    href={`/dashboard/suppliers/${supplier.id}/purchases`}
                                                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium hover:bg-muted"
                                                    title="فواتير الشراء"
                                                >
                                                    <ShoppingCart className="w-4 h-4" /> فواتير الشراء
                                                </Link>
                                                <MoreActions label={`إجراءات المورد ${supplier.name}`}><Link href={`/dashboard/suppliers/${supplier.id}/edit`}>تعديل المورد</Link><DeleteSupplier id={supplier.id} label="حذف المورد" /></MoreActions>
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
