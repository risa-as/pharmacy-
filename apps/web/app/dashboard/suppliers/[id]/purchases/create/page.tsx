export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getDrugsForPurchase, generateInvoiceNumber } from '@/app/lib/actions/purchases';
import PurchaseForm from '@/app/ui/suppliers/purchase-form';

export default async function CreatePurchasePage({ params }: { params: { id: string } }) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect('/login');

    const supplier = await prisma.supplier.findUnique({
        where: { id: params.id, organizationId: tenantCtx.organizationId || undefined },
        select: { id: true, name: true },
    });
    if (!supplier) notFound();

    let branchWhere: any = {};
    if (tenantCtx.organizationId) branchWhere = { organizationId: tenantCtx.organizationId };

    const [branches, drugs, invoiceNumber] = await Promise.all([
        prisma.branch.findMany({ where: branchWhere, select: { id: true, name: true } }),
        getDrugsForPurchase(),
        generateInvoiceNumber(),
    ]);

    return (
        <div className="w-full max-w-5xl mx-auto" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href={`/dashboard/suppliers/${params.id}/purchases`}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                        <ShoppingCart className="w-6 h-6 text-primary" />
                        فاتورة شراء جديدة
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">المورد: <span className="font-bold text-foreground">{supplier.name}</span></p>
                </div>
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
                <PurchaseForm
                    supplierId={supplier.id}
                    supplierName={supplier.name}
                    branches={branches}
                    drugs={drugs}
                    defaultInvoiceNumber={invoiceNumber}
                />
            </div>
        </div>
    );
}
