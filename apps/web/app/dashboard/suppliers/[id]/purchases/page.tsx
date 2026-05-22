export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, ShoppingCart, FileText, CheckCircle, Clock } from 'lucide-react';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getPurchasesBySupplier } from '@/app/lib/actions/purchases';

export default async function SupplierPurchasesPage({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');

    const supplier = await prisma.supplier.findUnique({
        where: { id: params.id, organizationId: tenantCtx.organizationId || undefined },
        select: { id: true, name: true },
    });
    if (!supplier) notFound();

    const purchases = await getPurchasesBySupplier(params.id);

    const totalAmount = purchases.reduce((sum: number, p: any) => sum + p.total, 0);

    return (
        <div className="w-full" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link href={`/dashboard/suppliers/${params.id}`} className="p-2 rounded-lg hover:bg-muted transition-colors">
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                            <ShoppingCart className="w-6 h-6 text-primary" />
                            فواتير الشراء
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">المورد: <span className="font-bold text-foreground">{supplier.name}</span></p>
                    </div>
                </div>
                <Link
                    href={`/dashboard/suppliers/${params.id}/purchases/create`}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 shadow-lg shadow-primary/20"
                >
                    <Plus className="h-4 w-4" />
                    فاتورة شراء جديدة
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">عدد الفواتير</p>
                    <p className="text-2xl font-black text-foreground">{purchases.length}</p>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي المشتريات</p>
                    <p className="text-2xl font-black text-primary tabular-nums" dir="ltr">
                        {totalAmount.toLocaleString('en')} <span className="text-sm font-normal text-muted-foreground">د.ع</span>
                    </p>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <table className="min-w-full text-foreground">
                    <thead className="bg-muted text-right text-sm font-semibold text-muted-foreground border-b border-border">
                        <tr>
                            <th className="px-6 py-4 font-cairo">#</th>
                            <th className="px-6 py-4 font-cairo">رقم الفاتورة</th>
                            <th className="px-6 py-4 font-cairo">التاريخ</th>
                            <th className="px-6 py-4 font-cairo">الفرع</th>
                            <th className="px-6 py-4 font-cairo">الأصناف</th>
                            <th className="px-6 py-4 font-cairo">الإجمالي</th>
                            <th className="px-6 py-4 font-cairo">الحالة</th>
                            <th className="px-6 py-4 font-cairo"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {purchases.map((p: any, idx: number) => (
                            <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                                <td className="px-6 py-4 text-sm text-muted-foreground">{idx + 1}</td>
                                <td className="px-6 py-4">
                                    <span className="font-mono text-sm font-bold text-foreground">
                                        {p.invoiceNumber || `#${p.id.slice(0, 8).toUpperCase()}`}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                                    {new Date(p.createdAt).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                                </td>
                                <td className="px-6 py-4 text-sm text-muted-foreground">
                                    {p.branch?.name || '—'}
                                </td>
                                <td className="px-6 py-4 text-sm text-muted-foreground">
                                    {p._count.items} صنف
                                </td>
                                <td className="px-6 py-4 font-bold text-foreground tabular-nums" dir="ltr">
                                    {p.total.toLocaleString('en')} <span className="text-xs text-muted-foreground font-normal">د.ع</span>
                                </td>
                                <td className="px-6 py-4">
                                    {p.status === 'COMPLETED' ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-success/10 text-success">
                                            <CheckCircle className="w-3 h-3" /> مكتملة
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-warning/10 text-warning">
                                            <Clock className="w-3 h-3" /> معلقة
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <Link
                                        href={`/dashboard/suppliers/${params.id}/purchases/${p.id}`}
                                        className="flex items-center gap-1 text-primary hover:underline text-sm font-medium"
                                    >
                                        <FileText className="w-4 h-4" />
                                        عرض
                                    </Link>
                                </td>
                            </tr>
                        ))}
                        {purchases.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-6 py-14 text-center text-muted-foreground">
                                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                    <p>لا توجد فواتير شراء بعد</p>
                                    <Link
                                        href={`/dashboard/suppliers/${params.id}/purchases/create`}
                                        className="inline-flex items-center gap-2 mt-4 text-primary hover:underline text-sm font-bold"
                                    >
                                        <Plus className="w-4 h-4" /> إنشاء أول فاتورة
                                    </Link>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
