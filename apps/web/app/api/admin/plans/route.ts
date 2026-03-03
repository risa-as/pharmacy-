import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await auth();
        const role = session?.user?.role;

        // Accessible by ADMIN (to see plan options during creation) and SUPER_ADMIN
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const plans = await prisma.subscriptionPlan.findMany({
            orderBy: { price: 'asc' }
        });

        return NextResponse.json({ success: true, data: plans });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
