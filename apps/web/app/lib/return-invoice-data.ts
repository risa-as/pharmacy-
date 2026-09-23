import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { notFound, redirect } from 'next/navigation';

export async function getReturnInvoice(id: string) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) redirect('/login');
    if (!ctx.userPermissions.canViewReturns) redirect('/dashboard?denied=1');
    const record = await prisma.saleReturn.findFirst({
        where: { AND: [ctx.tenantBranchWhere, { id }] },
        include: {
            items: { include: { drug: { select: { tradeName: true, barcode: true } } } },
            sale: { select: { id: true, documentNumber: true, total: true, createdAt: true } },
            branch: { select: { name: true, organizationId: true } },
        },
    });
    if (!record) notFound();
    return record;
}
