import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET: Fetch transfers for a specific branch (for Desktop sync)
// Query params: branchId, since (ISO date for incremental sync)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');
        const since = searchParams.get('since');

        if (!branchId) {
            return NextResponse.json({ error: "branchId is required" }, { status: 400 });
        }

        const dateFilter = since ? { updatedAt: { gte: new Date(since) } } : {};

        // Fetch transfers where this branch is either sender or receiver
        const transfers = await prisma.transfer.findMany({
            where: {
                OR: [
                    { fromBranchId: branchId },
                    { toBranchId: branchId }
                ],
                ...dateFilter
            },
            include: {
                fromBranch: { select: { name: true } },
                toBranch: { select: { name: true } },
                items: {
                    include: {
                        drug: { select: { tradeName: true, barcode: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ transfers });
    } catch (error: any) {
        console.error('Transfer Sync API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
