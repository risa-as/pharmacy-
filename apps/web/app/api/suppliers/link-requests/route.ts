export const dynamic = 'force-dynamic';

// طلبات ربط موردي المؤسسة بمذاخر المنصة — جانب المؤسسة.
// GET: طلبات المؤسسة (الأحدث أولاً). POST: رفع طلب { supplierId, warehouseId, note? }.
// الربط نفسه لا يحدث هنا؛ يعتمده مدير المنصة من /api/admin/supplier-link-requests.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { canRequestSupplierLink, decideCreateLinkRequest, sanitizeNote } from '@/app/lib/supplier-link-request';

export async function GET() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    const organizationId = tenantCtx.organizationId;
    if (!organizationId) return NextResponse.json({ requests: [] });

    try {
        const requests = await prisma.supplierLinkRequest.findMany({
            where: { organizationId },
            select: {
                id: true, status: true, note: true, decisionNote: true, createdAt: true, decidedAt: true,
                supplier: { select: { id: true, name: true } },
                warehouse: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        return NextResponse.json({ requests });
    } catch (e) {
        console.error('link-requests GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب طلبات الربط' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    const organizationId = tenantCtx.organizationId;
    if (!organizationId || !canRequestSupplierLink(tenantCtx.user.role)) {
        return NextResponse.json({ error: 'طلب ربط المورد بمذخر متاح لمدير المؤسسة فقط.', code: 'FORBIDDEN' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const supplierId = typeof body?.supplierId === 'string' ? body.supplierId.trim() : '';
        const warehouseId = typeof body?.warehouseId === 'string' ? body.warehouseId.trim() : '';
        if (!supplierId || !warehouseId) {
            return NextResponse.json({ error: 'المورد والمذخر مطلوبان.' }, { status: 400 });
        }

        const [supplier, warehouse, existingLinkForWarehouse, pendingForSupplier, pendingForWarehouse] = await Promise.all([
            prisma.supplier.findUnique({
                where: { id: supplierId },
                select: { id: true, name: true, organizationId: true, warehouseId: true },
            }),
            prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, isActive: true } }),
            prisma.supplier.findFirst({ where: { organizationId, warehouseId }, select: { id: true, name: true } }),
            prisma.supplierLinkRequest.findFirst({
                where: { supplierId, organizationId, status: 'PENDING' },
                select: { warehouse: { select: { name: true } } },
            }),
            prisma.supplierLinkRequest.findFirst({
                where: { warehouseId, organizationId, status: 'PENDING', supplierId: { not: supplierId } },
                select: { supplier: { select: { name: true } } },
            }),
        ]);

        const decision = decideCreateLinkRequest({
            organizationId,
            supplier,
            warehouse,
            existingLinkForWarehouse,
            pendingForSupplier: pendingForSupplier ? { warehouseName: pendingForSupplier.warehouse.name } : null,
            pendingForWarehouse: pendingForWarehouse ? { supplierName: pendingForWarehouse.supplier.name } : null,
        });
        if (!decision.ok) {
            return NextResponse.json({ error: decision.error, code: decision.code }, { status: decision.status });
        }

        const request = await prisma.supplierLinkRequest.create({
            data: {
                organizationId,
                supplierId,
                warehouseId,
                pendingKey: supplierId,
                note: sanitizeNote(body?.note),
                requestedById: tenantCtx.user.id,
                requestedByName: tenantCtx.user.name || tenantCtx.user.email || null,
            },
            select: { id: true, status: true, createdAt: true },
        });
        return NextResponse.json({ ok: true, request }, { status: 201 });
    } catch (e: any) {
        // pendingKey الفريد يحسم سباق طلبين متزامنين لنفس المورد.
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'يوجد طلب ربط قيد المراجعة لهذا المورد بالفعل.', code: 'PENDING_EXISTS' },
                { status: 409 }
            );
        }
        console.error('link-requests POST error:', e);
        return NextResponse.json({ error: 'فشل في رفع طلب الربط' }, { status: 500 });
    }
}
