export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { prisma } from '@/app/lib/prisma';
import { draftMetrics } from '@/app/lib/purchase-drafts';

/** OPEN-14: GET ?days=30&branchId= — how purchase drafts turned into sent orders. */
export async function GET(req: Request) {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx.userPermissions.canViewWarehouseOrders) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
    const p = new URL(req.url).searchParams;
    const branchId = p.get('branchId');
    if (branchId && !(await prisma.branch.findFirst({ where: { AND: [ctx.branchModelWhere, { id: branchId }] }, select: { id: true } })))
        return NextResponse.json({ error: 'الفرع خارج نطاق صلاحياتك' }, { status: 403 });
    const days = Number(p.get('days') ?? 30);
    return NextResponse.json(await draftMetrics(ctx, { days: Number.isFinite(days) ? days : 30, branchId }), { headers: { 'Cache-Control': 'no-store' } });
}
