import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext, TenantContext } from '@/app/lib/tenant-utils';
import { checkFeatureAccess } from '@/app/lib/saas-guards';

/**
 * Authenticated marketplace context. Unlike the previous checkMarketplaceAccess,
 * an unauthenticated caller is rejected here instead of being let through.
 * getTenantContext re-reads the user from the database and rejects WAREHOUSE
 * accounts, so session claims never decide marketplace scope.
 */
export async function getMarketplaceContext(): Promise<TenantContext | NextResponse> {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) return ctx;
    if (ctx.organizationId) {
        const access = await checkFeatureAccess(ctx.organizationId, 'marketplace');
        if (!access.allowed) {
            return NextResponse.json({
                error: 'هذه الميزة متاحة في باقة الشركات فقط.',
                code: 'FEATURE_NOT_IN_PLAN',
                requiredPlan: 'ENTERPRISE'
            }, { status: 403 });
        }
    }
    return ctx;
}

/**
 * Resolves the branch the caller acts for. A client-supplied branchId is only
 * accepted when it lies inside the caller's tenant scope; with none supplied the
 * caller's own branch is used. Returns null when no in-scope branch exists, so
 * callers never fall back to an unfiltered query.
 */
export async function resolveMarketplaceBranch(ctx: TenantContext, requested?: string | null): Promise<string | null> {
    const id = requested || ctx.user.branchId;
    if (!id || typeof id !== 'string') return null;
    const branch = await prisma.branch.findFirst({
        where: { AND: [ctx.branchModelWhere, { id }] },
        select: { id: true },
    });
    return branch?.id ?? null;
}
