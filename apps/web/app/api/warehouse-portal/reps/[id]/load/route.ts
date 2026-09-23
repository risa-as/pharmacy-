export const dynamic = 'force-dynamic';

// المندوبون (مذاخر B2B): تحميل بضاعة من المخزون الرئيسي إلى سيارة مندوب.
// Body: { batchId, quantity } لسطر واحد، أو { items: [{ batchId, quantity }, ...] }
// لعدة أسطر معاً (كلاهما مقبول — الشكل الأول اختصار للثاني بعنصر واحد).
//
// قاعدة صارمة (مطابقة لسبب وجود FEFO أصلاً): لا يجوز أبداً تحميل دفعة منتهية
// الصلاحية على سيارة مندوب — نفس فحص انتهاء الصلاحية المُستخدَم في allocateFEFO/
// summarizeStock (expiryDate <= now يعني منتهية)، مُطبَّقاً هنا صراحة لأن
// الدفعة هنا محدَّدة بالمعرّف (batchId) لا عبر FEFO تلقائي.
//
// التزامن: نفس نمط compare-and-swap المستخدَم في deductStockForShipment
// (orders/[id]/shipping) وstock/adjust — decrement مشروط بـ quantity >= n في
// شرط WHERE نفسه، فلا يمكن لتحميلين متزامنين أن يستنزفا نفس الدفعة تحت الصفر.
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canManageReps.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { warehouseCommand, warehouseReplay, runWarehouseOperation, WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { expiryBucket, validateStockMove } from '@/app/lib/warehouse-stock';

interface RawLine {
    batchId?: unknown;
    quantity?: unknown;
}

/** يُرمى عند استنزاف دفعة متزامن (تحميل/شحن/إتلاف آخر سبق هذا التحميل على نفس الدفعة). */
class ConcurrentLoadError extends Error {}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canManageReps');
        if (!gate.ok) return gate.response;

        const rep = await prisma.warehouseRep.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true, name: true, isActive: true },
        });
        if (!rep) {
            return NextResponse.json({ error: 'المندوب غير موجود ضمن هذا المذخر' }, { status: 404 });
        }
        if (!rep.isActive) {
            return NextResponse.json({ error: 'لا يمكن تحميل بضاعة لمندوب موقوف.' }, { status: 400 });
        }

        const body = await req.json().catch(() => null);
        const command = warehouseCommand(ctx.warehouseId, `rep-load:${params.id}`, body);
        const replay = await warehouseReplay(prisma, command);
        if (replay) return NextResponse.json({ stock: replay });
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const rawLines: RawLine[] = Array.isArray(body.items)
            ? body.items
            : [{ batchId: body.batchId, quantity: body.quantity }];

        if (rawLines.length === 0) {
            return NextResponse.json({ error: 'يجب تحديد دفعة واحدة على الأقل للتحميل' }, { status: 400 });
        }

        const validationErrors: string[] = [];
        const lines: { batchId: string; quantity: number }[] = [];

        rawLines.forEach((line, index) => {
            const label = rawLines.length > 1 ? `السطر رقم ${index + 1}` : 'الطلب';
            const batchId = typeof line.batchId === 'string' ? line.batchId : '';
            const quantity = Number(line.quantity);

            if (!batchId) {
                validationErrors.push(`${label}: batchId مطلوب.`);
                return;
            }
            if (!Number.isInteger(quantity) || quantity <= 0) {
                validationErrors.push(`${label}: الكمية يجب أن تكون عدداً صحيحاً موجباً.`);
                return;
            }
            lines.push({ batchId, quantity });
        });

        if (validationErrors.length > 0) {
            return NextResponse.json({ error: 'بيانات التحميل غير صالحة', errors: validationErrors }, { status: 400 });
        }

        // ملكية الدفعات: يجب أن تنتمي كلها عبر صنفها لكتالوج مذخر الفاعل حصراً.
        const batchIds = Array.from(new Set(lines.map((l) => l.batchId)));
        const batches = await prisma.warehouseBatch.findMany({
            where: { id: { in: batchIds }, catalogItem: { warehouseId: ctx.warehouseId } },
            select: {
                id: true,
                quantity: true,
                expiryDate: true,
                catalogItemId: true,
                catalogItem: { select: { drug: { select: { tradeName: true } } } },
            },
        });
        const batchById = new Map(batches.map((b) => [b.id, b]));
        if (batches.length !== batchIds.length) {
            return NextResponse.json({ error: 'دفعة واحدة أو أكثر غير موجودة ضمن كتالوج مذخرك' }, { status: 404 });
        }

        // لا يجوز أبداً تحميل بضاعة منتهية الصلاحية على سيارة مندوب — نفس قاعدة
        // "لا تخصيص من دفعة منتهية" في allocateFEFO، مُطبَّقة هنا صراحة لأن
        // الدفعة محدَّدة بالمعرّف لا عبر FEFO تلقائي.
        const now = new Date();
        const expiredErrors: string[] = [];
        for (const line of lines) {
            const batch = batchById.get(line.batchId)!;
            if (expiryBucket(batch.expiryDate, now) === 'EXPIRED') {
                expiredErrors.push(
                    `${batch.catalogItem.drug.tradeName}: الدفعة منتهية الصلاحية — لا يجوز تحميل دواء منتهٍ على سيارة مندوب.`
                );
            }
        }
        if (expiredErrors.length > 0) {
            return NextResponse.json({ error: 'تعذّر التحميل — دفعات منتهية الصلاحية', errors: expiredErrors }, { status: 400 });
        }

        // تجميع الكميات لنفس الدفعة إن ظهرت أكثر من مرة في الطلب — وإلا يُخصَم
        // منها مرتين بشرط WHERE منفصل لكل سطر رغم أنه نفس الصف فعلياً.
        const quantityByBatch = new Map<string, number>();
        for (const line of lines) {
            quantityByBatch.set(line.batchId, (quantityByBatch.get(line.batchId) ?? 0) + line.quantity);
        }

        // فحص كفاية مُسبَق (غير ذرّي، رسالة واضحة فقط) عبر validateStockMove()
        // من warehouse-stock.ts — نفس دالة التحقق المُستخدَمة لكل حركة صرف
        // أخرى (SHIPMENT/DAMAGE) بدل تكرار شرط "الكمية <= رصيد الدفعة" هنا من
        // جديد. الحارس الذري الحقيقي ضد التزامن يبقى compare-and-swap داخل
        // المعاملة أدناه — هذا الفحص فقط يرفض مبكراً بيانات غير كافية بوضوح.
        const insufficientErrors: string[] = [];
        for (const [batchId, quantity] of Array.from(quantityByBatch)) {
            const batch = batchById.get(batchId)!;
            const check = validateStockMove({ type: 'REP_TRANSFER', quantity, batchQuantity: batch.quantity });
            if (!check.ok) {
                insufficientErrors.push(`${batch.catalogItem.drug.tradeName}: ${check.error}`);
            }
        }
        if (insufficientErrors.length > 0) {
            return NextResponse.json({ error: 'تعذّر التحميل — كمية غير كافية', errors: insufficientErrors }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => runWarehouseOperation(tx, command, async () => {
            const raceFailures: string[] = [];

            for (const [batchId, quantity] of Array.from(quantityByBatch)) {
                // الحارس: decrement مشروط بـ quantity >= المطلوب في شرط WHERE نفسه
                // (ذرّي على مستوى الصف) — نفس نمط deductStockForShipment/stock-adjust.
                const applied = await tx.warehouseBatch.updateMany({
                    where: { id: batchId, quantity: { gte: quantity } },
                    data: { quantity: { decrement: quantity } },
                });
                if (applied.count !== 1) {
                    const tradeName = batchById.get(batchId)?.catalogItem.drug.tradeName ?? batchId;
                    raceFailures.push(tradeName);
                    continue;
                }

                const batch = batchById.get(batchId)!;

                await tx.warehouseStockMove.create({
                    data: {
                        catalogItemId: batch.catalogItemId,
                        batchId,
                        type: 'REP_TRANSFER',
                        quantity,
                        reason: `تحميل سيارة مندوب — ${rep.name} (${rep.id})`,
                        actorName: ctx.user.name ?? ctx.user.email ?? null,
                    },
                });

                // upsert: زيادة الرصيد إن كان للمندوب صف سابق من نفس الدفعة، أو
                // إنشاء صف جديد — @@unique([repId, batchId]) يضمن صفاً واحداً فقط.
                await tx.warehouseRepStock.upsert({
                    where: { repId_batchId: { repId: rep.id, batchId } },
                    update: { quantity: { increment: quantity } },
                    create: { repId: rep.id, batchId, quantity },
                });
            }

            if (raceFailures.length > 0) {
                throw new ConcurrentLoadError(
                    `تعذّر التحميل — تغيّر مخزون الأصناف التالية أثناء المعالجة (عملية متزامنة أخرى): ${raceFailures.join('، ')}. أعد المحاولة.`
                );
            }

            return tx.warehouseRepStock.findMany({ where: { repId: rep.id }, include: { batch: true } });
        }), { maxWait: 20000, timeout: 20000 });

        return NextResponse.json({ stock: result });
    } catch (e: any) {
        if (e instanceof WarehouseOperationError) return NextResponse.json({ error: e.message }, { status: e.status });
        if (e instanceof ConcurrentLoadError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal rep load POST error:', e);
        return NextResponse.json({ error: 'فشل في تحميل البضاعة للمندوب' }, { status: 500 });
    }
}
