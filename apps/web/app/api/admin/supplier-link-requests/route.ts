export const dynamic = 'force-dynamic';

// صندوق طلبات ربط الموردين بالمذاخر لمدير المنصة. ?status=PENDING (الافتراضي) أو ALL.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { canCreateWarehouse } from '@/app/lib/warehouse-access';

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canCreateWarehouse(session.user.role)) {
        return NextResponse.json({ error: 'متاح لإدارة المنصة فقط.', code: 'SUPER_ADMIN_ONLY' }, { status: 403 });
    }

    try {
        const all = new URL(req.url).searchParams.get('status') === 'ALL';
        const requests = await prisma.supplierLinkRequest.findMany({
            where: all ? {} : { status: 'PENDING' },
            select: {
                id: true, status: true, note: true, decisionNote: true, createdAt: true, decidedAt: true,
                requestedByName: true, decidedByName: true,
                organization: { select: { id: true, name: true } },
                // الرصيد غير مُعاد عمداً (§165): القرار لا يحتاجه.
                supplier: { select: { id: true, name: true, phone: true, warehouseId: true } },
                warehouse: { select: { id: true, name: true, phone: true, city: true, isActive: true } },
            },
            orderBy: { createdAt: all ? 'desc' : 'asc' },
            take: 200,
        });
        return NextResponse.json({ requests });
    } catch (e) {
        console.error('admin link-requests GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب طلبات الربط' }, { status: 500 });
    }
}
