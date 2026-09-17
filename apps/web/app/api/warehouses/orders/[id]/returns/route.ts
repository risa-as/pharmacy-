export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 4: طلب إرجاع/إشعار دائن من الصيدلية على
// طلب مذخر مُسلَّم أو قيد التسليم. الكمية والسعر يُشتقّان دائماً من الخادم —
// عبر effectiveLine() (نفس مصدر الحقيقة المستخدم لعرض السعر وجسر الفاتورة
// وخصم المخزون) وvalidateReturnQuantity() (app/lib/warehouse-returns.ts) —
// لا يُقبَل أي سعر أو سقف كمية من جسم الطلب: وإلا حدّدت الصيدلية بنفسها قيمة
// إشعارها الدائن.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { warehouseOrderScope } from '@/app/lib/warehouse-access';
import { effectiveLine } from '@/app/lib/warehouse-quote';
import { validateReturnQuantity } from '@/app/lib/warehouse-returns';

const RETURNABLE_STATUSES = new Set(['SHIPPED', 'DELIVERED']);

// POST: { items: [{ barcode, quantity }], reason? }
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const scope = warehouseOrderScope({
            role: tenantCtx.user.role,
            organizationId: tenantCtx.organizationId,
            branchId: tenantCtx.user.branchId,
        });
        if (!scope) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const order = await prisma.warehouseOrder.findFirst({
            where: { id: params.id, ...scope },
            include: {
                items: {
                    select: {
                        drugId: true,
                        quantity: true,
                        unitPrice: true,
                        quotedPrice: true,
                        quotedQuantity: true,
                        status: true,
                        drug: { select: { barcode: true, tradeName: true } },
                    },
                },
                branch: { select: { organizationId: true } },
            },
        });
        if (!order) {
            return NextResponse.json({ error: 'الطلب غير موجود في نطاقك' }, { status: 404 });
        }

        if (!RETURNABLE_STATUSES.has(order.status)) {
            return NextResponse.json(
                { error: 'الإرجاع متاح فقط للطلبات المشحونة أو المُسلَّمة.' },
                { status: 400 }
            );
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || !Array.isArray(body.items) || body.items.length === 0) {
            return NextResponse.json({ error: 'حدِّد صنفاً واحداً على الأقل للإرجاع' }, { status: 400 });
        }
        const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null;

        // الكمية الفعلية المشحونة فعلاً لكل باركود — effectiveLine() هي القاعدة
        // الوحيدة (بند طلبين لنفس الباركود نادر لكن يُجمَّع بأمان تحسّباً).
        const shippedByBarcode = new Map<
            string,
            { quantity: number; unitPrice: number; tradeName: string; drugId: string }
        >();
        for (const it of order.items) {
            const eff = effectiveLine({
                status: it.status,
                quantity: it.quantity,
                quotedQuantity: it.quotedQuantity,
                unitPrice: it.unitPrice,
                quotedPrice: it.quotedPrice,
            });
            const existing = shippedByBarcode.get(it.drug.barcode);
            if (existing) {
                existing.quantity += eff.quantity;
            } else {
                shippedByBarcode.set(it.drug.barcode, {
                    quantity: eff.quantity,
                    unitPrice: eff.unitPrice,
                    tradeName: it.drug.tradeName,
                    drugId: it.drugId,
                });
            }
        }

        // إرجاعات سابقة **مقبولة فقط** على نفس الطلب — تحدّ من المتاح للإرجاع الآن.
        const priorAccepted = await prisma.warehouseReturn.findMany({
            where: { orderId: order.id, status: 'ACCEPTED' },
            include: { items: { select: { barcode: true, quantity: true } } },
        });
        const alreadyAcceptedByBarcode = new Map<string, number>();
        for (const r of priorAccepted) {
            for (const it of r.items) {
                alreadyAcceptedByBarcode.set(it.barcode, (alreadyAcceptedByBarcode.get(it.barcode) ?? 0) + it.quantity);
            }
        }

        const errors: string[] = [];
        const returnItems: Array<{ drugId: string; barcode: string; quantity: number; unitPrice: number }> = [];
        let totalAmount = 0;
        const seenBarcodes = new Set<string>();

        for (const raw of body.items) {
            const barcode = typeof raw?.barcode === 'string' ? raw.barcode.trim() : '';
            const quantity = Number(raw?.quantity);

            if (!barcode) {
                errors.push('صنف بلا باركود صالح في طلب الإرجاع.');
                continue;
            }
            if (seenBarcodes.has(barcode)) {
                errors.push(`الصنف ${barcode} مُكرَّر في طلب الإرجاع — أرسله مرة واحدة بالكمية الإجمالية.`);
                continue;
            }
            seenBarcodes.add(barcode);

            const shipped = shippedByBarcode.get(barcode);
            if (!shipped) {
                errors.push(`الصنف بالباركود ${barcode} غير موجود ضمن هذا الطلب.`);
                continue;
            }

            const check = validateReturnQuantity({
                shippedQuantity: shipped.quantity,
                alreadyAcceptedQuantity: alreadyAcceptedByBarcode.get(barcode) ?? 0,
                requestedQuantity: quantity,
            });
            if (!check.ok) {
                errors.push(`${shipped.tradeName}: ${check.error}`);
                continue;
            }

            returnItems.push({ drugId: shipped.drugId, barcode, quantity, unitPrice: shipped.unitPrice });
            totalAmount += quantity * shipped.unitPrice;
        }

        if (errors.length > 0) {
            return NextResponse.json({ error: 'تعذّر إنشاء طلب الإرجاع', details: errors }, { status: 400 });
        }
        if (returnItems.length === 0) {
            return NextResponse.json({ error: 'لم يُحدَّد أي صنف صالح للإرجاع' }, { status: 400 });
        }

        const created = await prisma.warehouseReturn.create({
            data: {
                warehouseId: order.warehouseId,
                orderId: order.id,
                organizationId: order.branch.organizationId,
                reason,
                totalAmount,
                actorName: tenantCtx.user.name ?? tenantCtx.user.email ?? null,
                items: { create: returnItems },
            },
            include: { items: true },
        });

        await prisma.warehouseOrderEvent.create({
            data: {
                orderId: order.id,
                actorType: 'PHARMACY',
                actorName: tenantCtx.user.name ?? tenantCtx.user.email ?? null,
                type: 'RETURN_REQUESTED',
                payload: { returnId: created.id, totalAmount, reason },
            },
        });

        return NextResponse.json({ return: created }, { status: 201 });
    } catch (e: any) {
        console.error('warehouse order return POST error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء طلب الإرجاع' }, { status: 500 });
    }
}
