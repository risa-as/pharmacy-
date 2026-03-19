import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/organizations/[id]/plan-overrides
 * SUPER_ADMIN only — set per-org overrides for plan limits.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (role !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { planId, maxBranches, maxUsers, maxDevices, maxMobileUsers } = await req.json();

        // Build update object: only fields explicitly provided are updated
        const updateData: Record<string, any> = {};
        if (planId !== undefined) updateData.planId = planId;
        if (maxBranches !== undefined) updateData.maxBranches = maxBranches === '' ? null : Number(maxBranches);
        if (maxUsers !== undefined) updateData.maxUsers = maxUsers === '' ? null : Number(maxUsers);
        if (maxDevices !== undefined) updateData.maxDevices = maxDevices === '' ? null : Number(maxDevices);
        if (maxMobileUsers !== undefined) updateData.maxMobileUsers = maxMobileUsers === '' ? null : Number(maxMobileUsers);

        const updated = await prisma.organization.update({
            where: { id: params.id },
            data: updateData,
            select: {
                id: true,
                name: true,
                planId: true,
                maxBranches: true,
                maxUsers: true,
                maxDevices: true,
                maxMobileUsers: true,
                plan: { select: { name: true } },
            },
        });

        return NextResponse.json({ success: true, organization: updated });
    } catch (error) {
        console.error('Plan override update failed:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/admin/organizations/[id]/plan-overrides
 * SUPER_ADMIN only — fetch current plan details for an org.
 */
export async function GET(
    _req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        if (role !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const org = await prisma.organization.findUnique({
            where: { id: params.id },
            select: {
                id: true,
                name: true,
                planId: true,
                maxBranches: true,
                maxUsers: true,
                maxDevices: true,
                maxMobileUsers: true,
                plan: { select: { id: true, name: true, maxBranches: true, maxUsers: true, maxDevices: true, maxMobileUsers: true } },
            },
        });

        if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true, organization: org });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
