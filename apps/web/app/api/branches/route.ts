import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        let tenantWhere: Record<string, any> = {};

        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) {
            // Desktop app: no session cookie — resolve org from branchId query param
            const branchId = req.nextUrl.searchParams.get('branchId');
            if (!branchId) return tenantCtx; // genuine 401

            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: { organizationId: true },
            });
            if (!branch) return NextResponse.json({ message: 'Branch not found' }, { status: 403 });

            tenantWhere = { organizationId: branch.organizationId };
        } else {
            tenantWhere = tenantCtx.tenantWhere;
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

        return NextResponse.json(branches);
    } catch (error) {
        console.error('API Branches Error:', error);
        return NextResponse.json(
            { message: 'Error fetching branches' },
            { status: 500 }
        );
    }
}
