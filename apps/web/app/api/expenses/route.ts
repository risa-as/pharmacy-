
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function GET(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { tenantBranchWhere } = tenantCtx;

        const expenses = await prisma.expense.findMany({
            where: tenantBranchWhere,
            orderBy: { date: 'desc' },
            take: 50,
        });

        return NextResponse.json(expenses);
    } catch (error) {
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;

        if (!user || (!user.branchId && user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ message: 'Unauthorized or No Branch Assigned' }, { status: 401 });
        }

        const body = await req.json();
        const { amount, category, description } = body;

        const expense = await prisma.expense.create({
            data: {
                amount: parseFloat(amount),
                category,
                description,
                branchId: user.branchId!,
            },
        });

        return NextResponse.json(expense);
    } catch (error) {
        return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
        );
    }
}
