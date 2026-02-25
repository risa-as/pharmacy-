
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query');
        const branchId = searchParams.get('branchId');

        const where: any = {};

        if (query) {
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
            ];
        }

        if (branchId) {
            where.branchId = branchId;
        }

        const patients = await prisma.patient.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 50,
        });

        return NextResponse.json(patients);
    } catch (error) {
        console.error('Error fetching patients:', error);
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { id, name, phone, dateOfBirth, gender, allergies, chronicDiseases, notes, branchId } = body;

        if (!name || !phone) {
            return NextResponse.json(
                { message: 'Name and Phone are required' },
                { status: 400 }
            );
        }

        const existingPatient = await prisma.patient.findUnique({
            where: { phone },
        });

        if (existingPatient) {
            return NextResponse.json(
                { message: 'Patient with this phone already exists' },
                { status: 409 }
            );
        }

        const patient = await prisma.patient.create({
            data: {
                id: id || undefined, // Use provided ID if available
                name,
                phone,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender,
                allergies: allergies || [],
                chronicDiseases: chronicDiseases || [],
                notes,
                branchId: branchId || null,
            },
        });

        return NextResponse.json(patient);
    } catch (error) {
        console.error('Error creating patient:', error);
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}
