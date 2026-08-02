export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } },
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const batchId = params.id;
        const body = await req.json();

        // Validate batch exists and belongs to tenant
        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            include: { inventory: { include: { branch: true } } },
        });

        if (!batch) {
            return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 });
        }

        // Tenant isolation check
        const branchOrgId = batch.inventory.branch?.organizationId;
        if (tenantCtx.organizationId && branchOrgId !== tenantCtx.organizationId) {
            return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
        }

        // Build update data from allowed fields
        const updateData: Record<string, any> = {};

        if (body.batchNumber !== undefined) {
            updateData.batchNumber = String(body.batchNumber).trim();
        }
        if (body.costPrice !== undefined) {
            const cost = parseFloat(body.costPrice);
            if (isNaN(cost) || cost < 0) {
                return NextResponse.json({ error: 'سعر الشراء غير صالح' }, { status: 400 });
            }
            updateData.costPrice = cost;
        }
        if (body.quantity !== undefined) {
            const qty = parseInt(body.quantity);
            if (isNaN(qty) || qty < 0) {
                return NextResponse.json({ error: 'الكمية غير صالحة' }, { status: 400 });
            }
            updateData.quantity = qty;
            // Manual edit is a data correction, not consumption — shift initialQuantity
            // by the same delta so consumed (initial - quantity) stays unchanged.
            updateData.initialQuantity = Math.max(qty, batch.initialQuantity + (qty - batch.quantity));
        }
        if (body.expiryDate !== undefined) {
            const d = new Date(body.expiryDate);
            if (isNaN(d.getTime())) {
                return NextResponse.json({ error: 'تاريخ الانتهاء غير صالح' }, { status: 400 });
            }
            updateData.expiryDate = d;
        }
        if (body.supplierId !== undefined) {
            // Allow null to clear supplier
            updateData.supplierId = body.supplierId || null;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'لا توجد بيانات للتحديث' }, { status: 400 });
        }

        const updated = await prisma.batch.update({
            where: { id: batchId },
            data: updateData,
            include: {
                inventory: {
                    include: {
                        branch: true,
                        drug: { select: { id: true, tradeName: true, barcode: true } },
                    },
                },
                supplier: { select: { name: true } },
            },
        });

        /**
         * Batch.costPrice and Inventory.cost are two different fields:
         * the batch cost drives FEFO sale costing, while Inventory.cost is what
         * the margins report reads (reports/margins/page.tsx). Editing a batch
         * used to leave Inventory.cost stale, so a corrected purchase price
         * never reached the report.
         *
         * Inventory.cost tracks the NEWEST batch — the most recent price paid —
         * regardless of which batch was edited. A zero cost is ignored rather
         * than written, because it would show up as a 100% margin; same guard
         * the Excel import uses.
         */
        if (body.costPrice !== undefined) {
            const newest = await prisma.batch.findFirst({
                where: { inventoryId: updated.inventoryId },
                orderBy: { createdAt: 'desc' },
                select: { costPrice: true },
            });
            if (newest && newest.costPrice > 0 && newest.costPrice !== updated.inventory.cost) {
                await prisma.inventory.update({
                    where: { id: updated.inventoryId },
                    data: { cost: newest.costPrice },
                });
                updated.inventory.cost = newest.costPrice;
            }
        }

        return NextResponse.json({ success: true, data: updated });
    } catch (error: any) {
        console.error('[PATCH /api/batches/[id]]', error);
        return NextResponse.json({ error: 'حدث خطأ أثناء التحديث' }, { status: 500 });
    }
}
