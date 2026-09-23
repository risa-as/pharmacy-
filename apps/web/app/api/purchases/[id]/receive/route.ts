export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { PurchaseReceiptError, receivePurchaseStock } from '@/app/lib/purchase-receipt';
import { sendAndPersistNotification } from '@/app/lib/notifications/notificationTriggers';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const ctx = await getTenantContext();
        if (ctx instanceof NextResponse) return ctx;
        if (!ctx.userPermissions.canReceivePurchase) return NextResponse.json({ message: 'ليس لديك صلاحية استلام المشتريات.' }, { status: 403 });
        const body = await req.json().catch(() => null);
        if (!body || (body.isPaid !== undefined && typeof body.isPaid !== 'boolean')) {
            return NextResponse.json({ message: 'بيانات الاستلام غير صالحة.' }, { status: 400 });
        }
        const receipt = await receivePurchaseStock(prisma, params.id, ctx.tenantBranchWhere, body.items, body.isPaid ?? false, ctx.user);
        const soon = body.items.filter((item: { expiryDate: string }) => new Date(item.expiryDate).getTime() <= Date.now() + 30 * 86400000);
        if (soon.length) await sendAndPersistNotification({
            type: 'EXPIRY', branchId: receipt.branchId, title: 'تحذير: أدوية قاربت انتهاء الصلاحية',
            body: `${soon.length} دفعة مستلمة ستنتهي صلاحيتها خلال 30 يوماً.`,
        });
        return NextResponse.json({ success: true, receivedCount: receipt.receivedCount, createdInventoryCount: receipt.createdInventoryCount });
    } catch (error) {
        if (error instanceof PurchaseReceiptError) return NextResponse.json({ message: error.message }, { status: error.status });
        console.error('Receive Purchase API Error:', error);
        return NextResponse.json({ message: 'تعذر استلام المشتريات.' }, { status: 500 });
    }
}
