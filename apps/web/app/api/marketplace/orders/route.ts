export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

// POST: Place an order on a marketplace listing
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { listingId, quantity, notes, branchId } = body;

        if (!listingId || !quantity) {
            return NextResponse.json({ error: "listingId and quantity are required" }, { status: 400 });
        }

        const buyerId = branchId || session.user.branchId;
        if (!buyerId) return NextResponse.json({ error: "Branch ID required" }, { status: 400 });

        // Get listing
        const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
        if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        if (listing.status !== 'ACTIVE') return NextResponse.json({ error: "Listing is no longer active" }, { status: 400 });
        if (quantity < listing.minOrderQty) return NextResponse.json({ error: `Minimum order: ${listing.minOrderQty}` }, { status: 400 });
        if (quantity > listing.quantity) return NextResponse.json({ error: "Not enough stock" }, { status: 400 });

        // Can't buy from yourself
        if (listing.sellerId === buyerId) {
            return NextResponse.json({ error: "لا يمكنك الشراء من نفسك" }, { status: 400 });
        }

        const totalPrice = quantity * listing.unitPrice;

        const order = await prisma.marketplaceOrder.create({
            data: {
                listingId,
                buyerId,
                quantity,
                totalPrice,
                notes
            }
        });

        // Update listing quantity
        const newQty = listing.quantity - quantity;
        await prisma.marketplaceListing.update({
            where: { id: listingId },
            data: {
                quantity: newQty,
                status: newQty <= 0 ? 'SOLD_OUT' : 'ACTIVE'
            }
        });

        return NextResponse.json({ order }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: List orders (buyer or seller)
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId') || session.user.branchId;
        const role = searchParams.get('role') || 'buyer'; // buyer or seller

        const where: any = {};
        if (role === 'buyer' && branchId) {
            where.buyerId = branchId;
        } else if (role === 'seller' && branchId) {
            where.listing = { sellerId: branchId };
        }

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
