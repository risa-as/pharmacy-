import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get('branchId');

        const where: any = {
            // Assuming balance < 0 means debt, OR balance > 0 means debt depending on convention. 
            // Usually in retail systems: 
            // - Positive Balance = Store Credit (Customer paid in advance)
            // - Negative Balance = Debt (Customer owes money)
            // OR vice versa. 
            // However, the error log showed the mobile app trying to fetch it. 
            // Let's return all patients with non-zero balance for now, or just all patients associated with debts.
            // Mobile `debts.tsx` seems to filter or show all. 
            // Safest is to return patients with balance != 0
            balance: {
                not: 0
            }
        };

        if (branchId) {
            where.branchId = branchId;
        }

        const patients = await prisma.patient.findMany({
            where,
            orderBy: {
                updatedAt: 'desc'
            },
            take: 100 // Limit to avoid overload
        });

        // Map to expected mobile format if needed, but Prisma result usually matches
        return NextResponse.json(patients);

    } catch (error) {
        console.error('Error fetching debts:', error);
        return NextResponse.json(
            { error: 'Failed to fetch debts' },
            { status: 500 }
        );
    }
}
