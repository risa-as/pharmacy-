export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getMarketplaceContext, resolveMarketplaceBranch } from '@/app/lib/marketplace-access';

// GET: Browse marketplace listings
export async function GET(req: NextRequest) {
    try {
        const ctx = await getMarketplaceContext();
        if (ctx instanceof NextResponse) return ctx;

        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';
        const page = Number(searchParams.get('page') || 1);
        const limit = 20;

        const where: any = { status: 'ACTIVE', quantity: { gt: 0 } };
        if (search) {
            where.drug = { tradeName: { contains: search, mode: 'insensitive' } };
        }

        const [listings, total] = await Promise.all([
            prisma.marketplaceListing.findMany({
                where,
                include: {
                    seller: { select: { name: true } },
                    drug: { select: { tradeName: true, barcode: true, scientificName: true } },
                    _count: { select: { orders: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.marketplaceListing.count({ where })
        ]);

        return NextResponse.json({ listings, total, page, totalPages: Math.ceil(total / limit) });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Create a new listing (sell surplus stock)
export async function POST(req: NextRequest) {
    try {
        const ctx = await getMarketplaceContext();
        if (ctx instanceof NextResponse) return ctx;

        const body = await req.json();
        const { drugId, quantity, unitPrice, minOrderQty, description, expiryDate, batchNumber, branchId } = body;

        if (!drugId || !Number.isInteger(quantity) || quantity <= 0 || !(unitPrice > 0)) {
            return NextResponse.json({ error: "drugId, a positive integer quantity, and a positive unitPrice are required" }, { status: 400 });
        }

        // The seller is always a branch inside the caller's tenant scope.
        const sellerId = await resolveMarketplaceBranch(ctx, branchId);
        if (!sellerId) return NextResponse.json({ error: "Branch not in scope" }, { status: 403 });

        const listing = await prisma.marketplaceListing.create({
            data: {
                sellerId,
                drugId,
                quantity,
                unitPrice,
                minOrderQty: minOrderQty || 1,
                description,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                batchNumber
            }
        });

        return NextResponse.json({ listing }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
