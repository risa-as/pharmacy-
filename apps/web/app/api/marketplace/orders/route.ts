export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getMarketplaceContext, resolveMarketplaceBranch } from '@/app/lib/marketplace-access';

class MarketplaceOrderError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

// A PROCESSING attempt older than this belongs to a request that died mid-way
// (its transaction rolled back, so no order exists): it may be taken over.
// Far above the transaction's own timeout (Prisma default 5s).
const STALE_PROCESSING_MS = 2 * 60 * 1000;

/**
 * Response for an attempt already on record. `settled` means the outcome is
 * final (SUCCEEDED, or REJECTED without execution); PROCESSING means another
 * request with this key is still running — the client asks again later.
 */
function attemptResponse(attempt: { status: string; httpStatus: number | null; error: string | null }, order: unknown) {
    if (attempt.status === 'SUCCEEDED') return NextResponse.json({ order, replayed: true, status: 'SUCCEEDED', settled: true }, { status: 200 });
    if (attempt.status === 'REJECTED') return NextResponse.json({ error: attempt.error, status: 'REJECTED', settled: true }, { status: attempt.httpStatus ?? 409 });
    return NextResponse.json({ status: 'PROCESSING', settled: false }, { status: 202 });
}

// POST: Place an order on a marketplace listing
export async function POST(req: NextRequest) {
    try {
        const ctx = await getMarketplaceContext();
        if (ctx instanceof NextResponse) return ctx;

        const body = await req.json();
        const { listingId, quantity, notes, branchId } = body;
        const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
            ? body.idempotencyKey.trim().slice(0, 120) : null;

        if (!listingId || !Number.isInteger(quantity) || quantity <= 0) {
            return NextResponse.json({ error: "listingId and a positive integer quantity are required" }, { status: 400 });
        }

        // The buyer is always a branch inside the caller's tenant scope.
        const buyerId = await resolveMarketplaceBranch(ctx, branchId);
        if (!buyerId) return NextResponse.json({ error: "Branch not in scope" }, { status: 403 });

        // An attempt is owned by one user and one request content: the same key
        // from another user, another branch, or with different content is refused
        // without revealing anything about the original.
        const requestHash = createHash('sha256').update(JSON.stringify([ctx.user.id, buyerId, listingId, quantity, notes ?? null])).digest('hex');
        if (idempotencyKey) {
            const claimed = await claimAttempt(idempotencyKey, ctx.user.id, buyerId, requestHash);
            if (claimed instanceof NextResponse) return claimed;
        }

        // Price, seller and stock are read inside the transaction, and stock is
        // decremented conditionally, so two concurrent orders cannot oversell
        // and an order is never saved without its stock decrement. The attempt
        // becomes SUCCEEDED in the same transaction as the order.
        let order;
        try {
            order = await prisma.$transaction(async (tx) => {
                const listing = await tx.marketplaceListing.findUnique({ where: { id: listingId } });
                if (!listing) throw new MarketplaceOrderError("Listing not found", 404);
                if (listing.status !== 'ACTIVE') throw new MarketplaceOrderError("Listing is no longer active", 400);
                if (quantity < listing.minOrderQty) throw new MarketplaceOrderError(`Minimum order: ${listing.minOrderQty}`, 400);
                if (listing.sellerId === buyerId) throw new MarketplaceOrderError("لا يمكنك الشراء من نفسك", 400);

                const reserved = await tx.marketplaceListing.updateMany({
                    where: { id: listingId, status: 'ACTIVE', quantity: { gte: quantity } },
                    data: { quantity: { decrement: quantity } },
                });
                if (reserved.count !== 1) throw new MarketplaceOrderError("Not enough stock", 409);

                await tx.marketplaceListing.updateMany({
                    where: { id: listingId, quantity: { lte: 0 } },
                    data: { status: 'SOLD_OUT' },
                });

                const created = await tx.marketplaceOrder.create({
                    data: {
                        listingId,
                        buyerId,
                        quantity,
                        totalPrice: quantity * listing.unitPrice,
                        notes,
                        idempotencyKey,
                        requestHash: idempotencyKey ? requestHash : null,
                    }
                });
                if (idempotencyKey) {
                    await tx.marketplaceOrderAttempt.update({
                        where: { key: idempotencyKey },
                        data: { status: 'SUCCEEDED', orderId: created.id, httpStatus: 201 },
                    });
                }
                return created;
            });
        } catch (e: any) {
            if (idempotencyKey) {
                if (e instanceof MarketplaceOrderError) {
                    // A business refusal: the transaction rolled back, nothing was
                    // executed. Recorded so every retry gets this same final answer.
                    await prisma.marketplaceOrderAttempt.update({
                        where: { key: idempotencyKey },
                        data: { status: 'REJECTED', httpStatus: e.status, error: e.message },
                    });
                    return NextResponse.json({ error: e.message, status: 'REJECTED', settled: true }, { status: e.status });
                }
                // Unexpected failure. If the commit actually landed (its
                // acknowledgement was lost), record success; otherwise nothing was
                // executed, so release the claim and a retry with this key runs
                // again. (MarketplaceOrder.idempotencyKey is unique as a backstop.)
                await settleAfterUnexpectedError(idempotencyKey).catch(() => {});
                const settled = await prisma.marketplaceOrderAttempt.findUnique({ where: { key: idempotencyKey } }).catch(() => null);
                if (settled && settled.status !== 'PROCESSING') {
                    const landedOrder = settled.orderId ? await prisma.marketplaceOrder.findUnique({ where: { id: settled.orderId } }) : null;
                    return attemptResponse(settled, landedOrder);
                }
            }
            throw e;
        }

        return NextResponse.json({ order, status: 'SUCCEEDED', settled: true }, { status: 201 });
    } catch (e: any) {
        if (e instanceof MarketplaceOrderError) return NextResponse.json({ error: e.message }, { status: e.status });
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

/**
 * Claims an attempt key for this request, or answers from the existing record.
 * Returns null when the caller now owns a PROCESSING attempt and must execute.
 */
async function claimAttempt(key: string, userId: string, buyerId: string, requestHash: string): Promise<NextResponse | null> {
    try {
        await prisma.marketplaceOrderAttempt.create({ data: { key, userId, buyerId, requestHash } });
        return null;
    } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
    }
    const existing = await prisma.marketplaceOrderAttempt.findUnique({ where: { key } });
    if (!existing) return claimAttempt(key, userId, buyerId, requestHash); // released meanwhile
    if (existing.userId !== userId || existing.buyerId !== buyerId || existing.requestHash !== requestHash)
        return NextResponse.json({ error: "Idempotency key reused for a different request" }, { status: 409 });
    if (existing.status === 'PROCESSING' && Date.now() - existing.updatedAt.getTime() > STALE_PROCESSING_MS) {
        // Take over an abandoned attempt, exactly once across concurrent retries.
        const taken = await prisma.marketplaceOrderAttempt.updateMany({
            where: { key, status: 'PROCESSING', updatedAt: existing.updatedAt },
            data: { updatedAt: new Date() },
        });
        if (taken.count === 1) return null;
    }
    const order = existing.orderId ? await prisma.marketplaceOrder.findUnique({ where: { id: existing.orderId } }) : null;
    return attemptResponse(existing, order);
}

async function settleAfterUnexpectedError(key: string) {
    const attempt = await prisma.marketplaceOrderAttempt.findUnique({ where: { key } });
    if (!attempt || attempt.status !== 'PROCESSING') return;
    const landed = await prisma.marketplaceOrder.findUnique({ where: { idempotencyKey: key }, select: { id: true, buyerId: true, requestHash: true } });
    if (!landed) {
        await prisma.marketplaceOrderAttempt.deleteMany({ where: { key, status: 'PROCESSING' } });
    } else if (landed.buyerId === attempt.buyerId && landed.requestHash === attempt.requestHash) {
        // Our own commit landed; only its acknowledgement was lost.
        await prisma.marketplaceOrderAttempt.update({ where: { key }, data: { status: 'SUCCEEDED', orderId: landed.id, httpStatus: 201 } });
    } else {
        // The key belongs to someone else's order: never link it to this attempt.
        await prisma.marketplaceOrderAttempt.update({ where: { key }, data: { status: 'REJECTED', httpStatus: 409, error: 'Idempotency key reused for a different request' } });
    }
}

// GET: List orders (buyer or seller)
export async function GET(req: NextRequest) {
    try {
        const ctx = await getMarketplaceContext();
        if (ctx instanceof NextResponse) return ctx;

        const { searchParams } = new URL(req.url);
        const role = searchParams.get('role') || 'buyer';
        if (role !== 'buyer' && role !== 'seller') {
            return NextResponse.json({ error: "role must be buyer or seller" }, { status: 400 });
        }

        // Every path filters by one in-scope branch; there is no unfiltered fallback.
        const branchId = await resolveMarketplaceBranch(ctx, searchParams.get('branchId'));
        if (!branchId) return NextResponse.json({ error: "Branch not in scope" }, { status: 403 });

        const where = role === 'buyer' ? { buyerId: branchId } : { listing: { sellerId: branchId } };

        const orders = await prisma.marketplaceOrder.findMany({
            where,
            include: {
                listing: {
                    include: {
                        drug: { select: { tradeName: true } },
                        seller: { select: { name: true } }
                    }
                },
                buyer: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ orders });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
