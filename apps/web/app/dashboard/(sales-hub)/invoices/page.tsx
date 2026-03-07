
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { DeleteInvoice, ViewInvoice } from "@/app/ui/invoices/buttons";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';


import { BranchFilter } from "@/app/ui/reports/branch-filter";

async function getInvoices(tenantBranchWhere: any, branchId?: string) {
    const invoices = await prisma.purchase.findMany({
        where: branchId ? { ...tenantBranchWhere, branchId } : tenantBranchWhere,
        orderBy: { createdAt: 'desc' },
        include: {
            supplier: true,
            branch: true,
            _count: { select: { items: true } }
        }
    });
    return invoices;
}

export default async function Page({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;
    const { tenantBranchWhere } = tenantCtx;
    const branchId = typeof searchParams.branch === "string" ? searchParams.branch : undefined;

    const invoices = await getInvoices(tenantBranchWhere, branchId);

    return (
        <div className="w-full">
            <div className="flex w-full items-center justify-between mb-8">
                <h1 className="text-2xl font-bold font-cairo text-foreground">فواتير الشراء</h1>
                <Link href="/dashboard/invoices/create" className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
                    <PlusIcon className="h-4 w-4" />
                    <span className="hidden md:block">إنشاء فاتورة</span>
                </Link>
            </div>

            <div className="mb-6">
                <BranchFilter currentBranch={branchId} baseUrl="/dashboard/invoices" />
            </div>

            <div className="mt-4 flow-root">
                <div className="inline-block min-w-full align-middle">
                    <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
                        <table className="min-w-full text-foreground">
                            <thead className="bg-muted text-right text-sm font-semibold text-foreground border-b border-border">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        المورد
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        الفرع
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        العناصر
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        الإجمالي
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        التاريخ
                                    </th>
                                    <th scope="col" className="px-6 py-4 font-cairo">
                                        الإجراءات
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-card">
                                {invoices.map((invoice: any) => (
                                    <tr
                                        key={invoice.id}
                                        className="hover:bg-muted transition-colors"
                                    >
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <p className="font-medium text-foreground">{invoice.supplier.name}</p>
                                                {invoice.invoiceNumber && <span className="text-xs text-muted-foreground">({invoice.invoiceNumber})</span>}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                                            {invoice.branch.name}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                                            {invoice._count.items}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 font-bold text-foreground">
                                            {invoice.total.toFixed(2)}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground" suppressHydrationWarning>
                                            {new Date(invoice.createdAt).toLocaleDateString('ar-EG')}
                                        </td>
                                        <td className="whitespace-nowrap px-6 py-4">
                                            <div className="flex justify-end gap-2">
                                                <ViewInvoice id={invoice.id} />
                                                <DeleteInvoice id={invoice.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {invoices.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">
                                            لا توجد فواتير حتى الآن.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
