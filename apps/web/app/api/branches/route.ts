import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const branches = await prisma.branch.findMany({
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
