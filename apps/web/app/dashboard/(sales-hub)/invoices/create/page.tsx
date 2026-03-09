export const dynamic = 'force-dynamic';

import Form from "@/app/ui/invoices/create-form";
import { prisma } from "@/app/lib/prisma";
import { FileText } from "lucide-react";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export default async function Page() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) redirect("/login");
    const { tenantWhere } = tenantCtx;

    const [suppliers, branches, drugs, lastPurchase] = await Promise.all([
        prisma.supplier.findMany({
            where: {
                organizationId: tenantCtx.organizationId
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        }),
        prisma.branch.findMany({
            where: tenantWhere,
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        }),
        prisma.globalDrug.findMany({
            select: { id: true, tradeName: true, barcode: true },
            where: {
                isActive: true,
                OR: [
                    { organizationId: null },
                    { organizationId: tenantCtx.organizationId }
                ]
            },
            orderBy: { tradeName: 'asc' },
            take: 100
        }),
        prisma.purchase.findFirst({
            where: { branch: { organizationId: tenantCtx.organizationId } },
            orderBy: { createdAt: 'desc' },
            select: { invoiceNumber: true }
        }),
    ]);

    let defaultInvoiceNumber = "";
    if (lastPurchase?.invoiceNumber) {
        // Try to increment the last invoice number if it ends in digits (e.g., INV-001 -> INV-002)
        const match = lastPurchase.invoiceNumber.match(/^(.*?)(\d+)$/);
        if (match) {
            const prefix = match[1];
            const numStr = match[2];
            const nextNum = (parseInt(numStr, 10) + 1).toString().padStart(numStr.length, '0');
            defaultInvoiceNumber = `${prefix}${nextNum}`;
        }
    } else {
        // Default format if no previous invoice exists
        const year = new Date().getFullYear();
        defaultInvoiceNumber = `INV-${year}-0001`;
    }

    return (
        <main className="mx-auto max-w-4xl" suppressHydrationWarning>
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إنشاء فاتورة شراء</h1>
                    <p className="text-sm text-muted-foreground">أضف فاتورة شراء جديدة من المورد</p>
                </div>
            </div>

            <Form suppliers={suppliers} branches={branches} drugs={drugs} defaultInvoiceNumber={defaultInvoiceNumber} />
        </main>
    );
}
