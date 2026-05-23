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

        const patient = await prisma.patient.findFirst({
            where: { id: params.id, ...tenantCtx.tenantBranchWhere },
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
        if (!tenantCtx.userPermissions.canEditPatient) {
            return NextResponse.json({ message: 'ليس لديك صلاحية لتعديل بيانات المرضى.' }, { status: 403 });
        }

        // Tenant isolation: confirm the patient is within the caller's scope first.
        const existing = await prisma.patient.findFirst({
            where: { id: params.id, ...tenantCtx.tenantBranchWhere },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ message: 'Patient not found' }, { status: 404 });
        }

        const body = await req.json();
        // Never allow the caller to move a patient to another branch via the body.
        const { branchId: _ignoredBranchId, id: _ignoredId, ...safeData } = body ?? {};
        const patient = await prisma.patient.update({
            where: { id: params.id },
            data: safeData,
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
