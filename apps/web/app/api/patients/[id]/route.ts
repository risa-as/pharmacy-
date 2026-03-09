export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const patient = await prisma.patient.findUnique({
            where: { id: params.id },
            include: {
                sales: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
                prescriptions: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                },
            },
        });

        if (!patient) {
            return NextResponse.json(
                { message: 'Patient not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(patient);
    } catch (error) {
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const body = await req.json();
        const patient = await prisma.patient.update({
            where: { id: params.id },
            data: body,
        });

        return NextResponse.json(patient);
    } catch (error) {
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { user } = tenantCtx;
        if (!['ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '')) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        // Verify patient belongs to this org's branch
        const patient = await prisma.patient.findUnique({
            where: { id: params.id },
            select: { id: true, branchId: true },
        });

        if (!patient) {
            return NextResponse.json({ message: 'Patient not found' }, { status: 404 });
        }

        if (user?.role !== 'SUPER_ADMIN' && patient.branchId !== user?.branchId) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        await prisma.patient.delete({ where: { id: params.id } });

        return NextResponse.json({ message: 'Patient deleted' });
    } catch (error) {
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}
