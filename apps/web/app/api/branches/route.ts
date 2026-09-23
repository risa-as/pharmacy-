import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { validateSyncUser } from '@/app/lib/sync-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        let tenantWhere: Record<string, any> = {};

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) {
            // Desktop app: no session cookie. It must still prove itself with its
            // sync token or device license (sent on every request by fetchWithRetry);
            // knowing a branch id alone no longer reveals the organization's branches.
            const syncUser = await validateSyncUser(req);
            if (syncUser instanceof NextResponse) return syncUser;
            if (!syncUser.organizationId) return NextResponse.json({ message: 'Organization not found' }, { status: 403 });
            tenantWhere = { organizationId: syncUser.organizationId };
        } else {
            tenantWhere = tenantCtx.branchModelWhere;
        }

        const branches = await prisma.branch.findMany({
            where: tenantWhere,
            select: {
                id: true,
                name: true,
                organizationId: true,
            },
            orderBy: { name: 'asc' },
        });

        // Tenant-specific data: never cacheable by a shared CDN or proxy.
        const response = NextResponse.json(branches);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    } catch (error) {
        console.error('API Branches Error:', error);
        return NextResponse.json(
            { message: 'Error fetching branches' },
            { status: 500 }
        );
    }
}
