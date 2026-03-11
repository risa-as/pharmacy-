export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLowStockInventory } from '@/app/lib/actions/purchase-actions';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId') || undefined;
        const items = await getLowStockInventory(branchId);
        return NextResponse.json(items);
    } catch (error) {
        console.error('Low-stock API Error:', error);
        return NextResponse.json({ message: 'Failed to fetch low-stock items' }, { status: 500 });
    }
}
