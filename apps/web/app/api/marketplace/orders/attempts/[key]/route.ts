export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getMarketplaceContext } from '@/app/lib/marketplace-access';

/**
 * GET /api/marketplace/orders/attempts/:key — outcome of one purchase attempt.
 * Only the user who made the attempt, within their current tenant scope, can
 * read it: holding the key alone grants nothing. Anything else (including a key
 * the server never received) answers 404 UNKNOWN, which tells the client it is
 * safe to resend the same attempt.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
    const ctx = await getMarketplaceContext();
    if (ctx instanceof NextResponse) return ctx;
    const { key } = await params;

    const attempt = await prisma.marketplaceOrderAttempt.findUnique({ where: { key } });
    const inScope = attempt && attempt.userId === ctx.user.id
        && await prisma.branch.findFirst({ where: { AND: [ctx.branchModelWhere, { id: attempt.buyerId }] }, select: { id: true } });
    if (!attempt || !inScope) return NextResponse.json({ status: 'UNKNOWN', settled: false }, { status: 404 });

    if (attempt.status === 'SUCCEEDED') {
        const order = attempt.orderId ? await prisma.marketplaceOrder.findUnique({ where: { id: attempt.orderId } }) : null;
        return NextResponse.json({ status: 'SUCCEEDED', settled: true, order });
    }
    if (attempt.status === 'REJECTED') return NextResponse.json({ status: 'REJECTED', settled: true, error: attempt.error, httpStatus: attempt.httpStatus });
    return NextResponse.json({ status: 'PROCESSING', settled: false });
}
