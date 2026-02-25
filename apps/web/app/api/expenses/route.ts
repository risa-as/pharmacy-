
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');

        const where = branchId ? { branchId } : {};

        const expenses = await prisma.expense.findMany({
            where,
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
        const body = await req.json();
        const { amount, category, description, branchId } = body;

        const expense = await prisma.expense.create({
            data: {
                amount: parseFloat(amount),
                category,
                description,
                branchId: branchId || 'default-branch-id', // Replace with real branch ID from auth
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
