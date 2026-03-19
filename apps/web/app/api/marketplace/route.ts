export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';

async function checkMarketplaceAccess() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null; // unauthenticated — let existing auth handle
    if (!tenantCtx.organizationId) return null; // SUPER_ADMIN — allow
    const access = await checkFeatureAccess(tenantCtx.organizationId, 'marketplace');
    if (!access.allowed) {
        return NextResponse.json({
            error: 'هذه الميزة متاحة في باقة الشركات فقط.',
            code: 'FEATURE_NOT_IN_PLAN',
            requiredPlan: 'ENTERPRISE'
        }, { status: 403 });
    }
    return null;
}

// GET: Browse marketplace listings
export async function GET(req: NextRequest) {
    try {
        const guard = await checkMarketplaceAccess();
        if (guard) return guard;

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
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const guard = await checkMarketplaceAccess();
        if (guard) return guard;

        const body = await req.json();
        const { drugId, quantity, unitPrice, minOrderQty, description, expiryDate, batchNumber, branchId } = body;

        if (!drugId || !quantity || !unitPrice) {
            return NextResponse.json({ error: "drugId, quantity, and unitPrice are required" }, { status: 400 });
        }

        const sellerId = branchId || session.user.branchId;
        if (!sellerId) return NextResponse.json({ error: "Branch ID required" }, { status: 400 });

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
