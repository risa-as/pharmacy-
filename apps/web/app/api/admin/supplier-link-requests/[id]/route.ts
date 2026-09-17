export const dynamic = 'force-dynamic';

// حسم طلب ربط مورد بمذخر — { action: 'APPROVE' | 'REJECT', note? } (SUPER_ADMIN).
//
// الاعتماد = نفس كتابة الربط المباشر (linkSupplierToWarehouse) + إغلاق الطلب، في
// معاملة واحدة: لو أُلغي الطلب أو حُسم بالتوازي تُلغى كتابة الربط أيضاً فلا يُربط
// مورد بطلب لم يعد قائماً.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { canCreateWarehouse } from '@/app/lib/warehouse-access';
import { logAudit } from '@/app/lib/audit';
import { canDecideLinkRequest, sanitizeNote } from '@/app/lib/supplier-link-request';
import { linkSupplierToWarehouse, LINK_UNIQUE_CONFLICT, type LinkOutcome } from '@/app/lib/supplier-link-service';

class Abort extends Error {
    constructor(public readonly status: number, public readonly body: Record<string, unknown>) {
        super('abort');
    }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canCreateWarehouse(session.user.role)) {
        return NextResponse.json({ error: 'متاح لإدارة المنصة فقط.', code: 'SUPER_ADMIN_ONLY' }, { status: 403 });
    }
    const actor = session.user as { id?: string; name?: string; email?: string };
    const actorId = actor.id || 'unknown';
    const actorName = actor.name || actor.email || 'SUPER_ADMIN';

    try {
        const body = await req.json().catch(() => ({}));
        const action = body?.action;
        if (action !== 'APPROVE' && action !== 'REJECT') {
            return NextResponse.json({ error: 'الإجراء يجب أن يكون APPROVE أو REJECT.' }, { status: 400 });
        }
        const note = sanitizeNote(body?.note);

        const request = await prisma.supplierLinkRequest.findUnique({
            where: { id },
            select: { id: true, status: true, organizationId: true, supplierId: true, warehouseId: true },
        });
        if (!request) return NextResponse.json({ error: 'الطلب غير موجود.' }, { status: 404 });
        if (!canDecideLinkRequest(request.status)) {
            return NextResponse.json({ error: 'حُسم هذا الطلب مسبقاً.', code: 'ALREADY_DECIDED' }, { status: 409 });
        }

        const decided = {
            pendingKey: null,
            decidedAt: new Date(),
            decidedById: actorId,
            decidedByName: actorName,
            decisionNote: note,
        };

        if (action === 'REJECT') {
            const written = await prisma.supplierLinkRequest.updateMany({
                where: { id, status: 'PENDING' },
                data: { ...decided, status: 'REJECTED' },
            });
            if (written.count === 0) {
                return NextResponse.json({ error: 'حُسم هذا الطلب للتو من عملية أخرى.', code: 'ALREADY_DECIDED' }, { status: 409 });
            }
            return NextResponse.json({ ok: true, status: 'REJECTED' });
        }

        const outcome = await prisma.$transaction(async (tx) => {
            const linked: LinkOutcome = await linkSupplierToWarehouse(tx, {
                warehouseId: request.warehouseId,
                organizationId: request.organizationId,
                supplierId: request.supplierId,
            });
            if (!linked.ok) {
                throw new Abort(linked.status, { error: linked.error, ...(linked.code ? { code: linked.code } : {}) });
            }
            const closed = await tx.supplierLinkRequest.updateMany({
                where: { id, status: 'PENDING' },
                data: { ...decided, status: 'APPROVED' },
            });
            if (closed.count === 0) {
                throw new Abort(409, { error: 'حُسم هذا الطلب أو أُلغي للتو — لم يُربط المورد.', code: 'ALREADY_DECIDED' });
            }
            return linked;
        });

        if (!outcome.alreadyLinked) {
            await logAudit({
                userId: actorId,
                userName: actorName,
                action: 'LINK',
                entity: 'SUPPLIER',
                entityId: outcome.supplier.id,
                details: JSON.stringify({
                    supplierName: outcome.supplier.name,
                    organizationId: outcome.organization.id,
                    organizationName: outcome.organization.name,
                    warehouseId: outcome.warehouse.id,
                    warehouseName: outcome.warehouse.name,
                    previousWarehouseId: null,
                    newWarehouseId: outcome.warehouse.id,
                    linkRequestId: id,
                }),
            });
        }

        return NextResponse.json({ ok: true, status: 'APPROVED', alreadyLinked: outcome.alreadyLinked });
    } catch (e: any) {
        if (e instanceof Abort) return NextResponse.json(e.body, { status: e.status });
        if (e?.code === 'P2002') return NextResponse.json(LINK_UNIQUE_CONFLICT, { status: 409 });
        console.error('admin link-request decide error:', e);
        return NextResponse.json({ error: 'فشل في حسم طلب الربط' }, { status: 500 });
    }
}
