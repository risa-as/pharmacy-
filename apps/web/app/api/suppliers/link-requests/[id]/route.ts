export const dynamic = 'force-dynamic';

// إلغاء طلب ربط معلّق — جانب المؤسسة. الطلب المحسوم لا يُلغى.
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { canRequestSupplierLink } from '@/app/lib/supplier-link-request';

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    const organizationId = tenantCtx.organizationId;
    if (!organizationId || !canRequestSupplierLink(tenantCtx.user.role)) {
        return NextResponse.json({ error: 'متاح لمدير المؤسسة فقط.', code: 'FORBIDDEN' }, { status: 403 });
    }

    try {
        // الشرط على المؤسسة والحالة معاً: طلب مؤسسة أخرى أو طلب حُسم للتو لا يُلمس.
        const written = await prisma.supplierLinkRequest.updateMany({
            where: { id, organizationId, status: 'PENDING' },
            data: {
                status: 'CANCELLED',
                pendingKey: null,
                decidedAt: new Date(),
                decidedById: tenantCtx.user.id,
                decidedByName: tenantCtx.user.name || tenantCtx.user.email || null,
            },
        });
        if (written.count === 0) {
            return NextResponse.json({ error: 'الطلب غير موجود أو لم يعد قيد المراجعة.' }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('link-requests DELETE error:', e);
        return NextResponse.json({ error: 'فشل في إلغاء الطلب' }, { status: 500 });
    }
}
