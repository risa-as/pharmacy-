export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer, ShoppingCart, CheckCircle, Building2, Calendar, Hash, Package } from 'lucide-react';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { getPurchaseById } from '@/app/lib/actions/purchases';

export default async function PurchaseDetailPage({
    params,
}: {
    params: { id: string; purchaseId: string };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');

    const purchase = await getPurchaseById(params.purchaseId);
    if (!purchase) notFound();

    const total = purchase.items.reduce(
        (sum: number, item: any) => sum + item.cost * item.quantity,
        0
    );

    return (
        <div className="w-full max-w-4xl mx-auto" dir="rtl">
            {/* Header — screen only */}
            <div className="flex items-center justify-between mb-6 print:hidden">
                <div className="flex items-center gap-3">
                    <Link
                        href={`/dashboard/suppliers/${params.id}/purchases`}
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </Link>
                    <h1 className="text-xl font-bold font-cairo text-foreground">
                        تفاصيل فاتورة الشراء
                    </h1>
                </div>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-all"
                >
                    <Printer className="w-4 h-4" />
                    طباعة
                </button>
            </div>

            {/* Invoice Card */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-8 print:shadow-none print:border-none print:rounded-none print:p-0">

                {/* Invoice Header */}
                <div className="flex items-start justify-between mb-8 pb-6 border-b border-border">
                    <div>
                        <h2 className="text-3xl font-black text-foreground mb-1">فاتورة شراء</h2>
                        <p className="text-muted-foreground text-sm flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" />
                            {purchase.invoiceNumber || `${purchase.id.slice(0, 8).toUpperCase()}`}
                        </p>
                    </div>
                    <div className="text-left">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold bg-success/10 text-success">
                            <CheckCircle className="w-4 h-4" />
                            {purchase.status === 'COMPLETED' ? 'مكتملة' : 'معلقة'}
                        </span>
                    </div>
                </div>

                {/* Supplier & Branch */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="bg-muted/50 rounded-xl p-4">
                        <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
                            <ShoppingCart className="w-3.5 h-3.5" /> المورد
                        </p>
                        <p className="font-bold text-foreground text-lg">{purchase.supplier.name}</p>
                        {purchase.supplier.phone && (
                            <p className="text-sm text-muted-foreground mt-1" dir="ltr">{purchase.supplier.phone}</p>
                        )}
                        {purchase.supplier.address && (
                            <p className="text-sm text-muted-foreground">{purchase.supplier.address}</p>
                        )}
                    </div>
                    <div className="bg-muted/50 rounded-xl p-4">
                        <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" /> تفاصيل الفاتورة
                        </p>
                        <div className="space-y-1.5 text-sm">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-foreground font-medium">{purchase.branch.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-foreground">
                                    {new Date(purchase.createdAt).toLocaleDateString('ar-IQ', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        timeZone: 'Asia/Baghdad',
                                    })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="rounded-xl border border-border overflow-hidden mb-8">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted text-right text-xs font-semibold text-muted-foreground border-b border-border">
                            <tr>
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">اسم الدواء</th>
                                <th className="px-4 py-3">رقم الدفعة</th>
                                <th className="px-4 py-3">تاريخ الانتهاء</th>
                                <th className="px-4 py-3 text-center">الكمية</th>
                                <th className="px-4 py-3 text-left">سعر الشريط</th>
                                <th className="px-4 py-3 text-left">الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {purchase.items.map((item: any, idx: number) => (
                                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-foreground">{item.drug.tradeName}</p>
                                        <p className="text-xs text-muted-foreground font-mono">{item.drug.barcode}</p>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                        {item.batchNumber || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs" dir="ltr">
                                        {item.expiryDate
                                            ? new Date(item.expiryDate).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold text-foreground">
                                        {item.quantity}
                                    </td>
                                    <td className="px-4 py-3 text-left tabular-nums text-foreground" dir="ltr">
                                        {item.cost.toLocaleString('en')}
                                    </td>
                                    <td className="px-4 py-3 text-left tabular-nums font-bold text-foreground" dir="ltr">
                                        {(item.cost * item.quantity).toLocaleString('en')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Total */}
                <div className="flex justify-end">
                    <div className="bg-primary/5 border border-primary/20 rounded-xl px-8 py-5 text-left min-w-56">
                        <p className="text-sm text-muted-foreground mb-1">الإجمالي الكلي</p>
                        <p className="text-3xl font-black text-primary tabular-nums" dir="ltr">
                            {total.toLocaleString('en')}
                        </p>
                        <p className="text-sm text-muted-foreground">دينار عراقي</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
