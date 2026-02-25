
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
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
