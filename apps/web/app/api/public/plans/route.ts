export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/public/plans
 * Public endpoint — no authentication required.
 * Returns active subscription plans for display on the landing page.
 * Only exposes fields safe for public consumption (no internal IDs needed).
 */
export async function GET() {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { price: 'asc' },
            select: {
                id: true,
                name: true,
                price: true,
                maxBranches: true,
                maxUsers: true,
                maxDevices: true,
                maxMobileUsers: true,
                features: true,
                isPopular: true,
            },
        });

        return NextResponse.json(
            { success: true, plans },
            {
                headers: {
                    // Allow the landing site (different origin/port) to fetch this
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
                },
            }
        );
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
