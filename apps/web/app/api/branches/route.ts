import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantWhere } = tenantCtx;

        const branches = await prisma.branch.findMany({
            where: tenantWhere,
            select: {
                id: true,
                name: true,
                organizationId: true,
            },
            orderBy: {
                name: 'asc',
            },
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
