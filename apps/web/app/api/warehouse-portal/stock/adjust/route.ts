export const dynamic = 'force-dynamic';

// المرحلة ب من ميزة تتبّع مخزون المذخر: تصحيح جرد أو إتلاف. شكلان للجسم على
// نفس المسار:
//   - تصحيح جرد: { batchId, newQuantity, reason } — يضبط الكمية على قيمة مطلقة.
//   - إتلاف:     { batchId, quantity, reason } — يصرف كمية (نوع DAMAGE دائماً).
// كلاهما يمر عبر validateStockMove() من warehouse-stock.ts؛ لا حساب مستقل هنا.
//
// Phase 3 (الأدوار والصلاحيات): المفتاح المطلوب يُحسَم حسب شكل الجسم فعلياً
// بعد التحقق من صحته — تصحيح الجرد (newQuantity) يتطلب canAdjustStock،
// والإتلاف (quantity) يتطلب canWriteOffStock. كلا المفتاحين OWNER/MANAGER/
// INVENTORY افتراضياً حسب المصفوفة (SALES/ACCOUNTANT محرومان من الاثنين).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { validateStockMove } from '@/app/lib/warehouse-stock';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

/** يُرمى عند تغيّر رصيد الدفعة بين القراءة والكتابة (إتلاف/شحن متزامن آخر على نفس الدفعة). */
class ConcurrentStockChangeError extends Error {}

// POST: تصحيح جرد (newQuantity) أو إتلاف (quantity) على دفعة من كتالوج مذخري حصراً.
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const batchId: string | undefined = body.batchId;
        if (!batchId) {
            return NextResponse.json({ error: 'batchId مطلوب' }, { status: 400 });
        }

        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason) {
            return NextResponse.json({ error: 'سبب العملية مطلوب' }, { status: 400 });
        }

        const hasNewQuantity = body.newQuantity !== undefined && body.newQuantity !== null;
        const hasQuantity = body.quantity !== undefined && body.quantity !== null;
        if (hasNewQuantity === hasQuantity) {
            // كلاهما مُرسَل أو لا شيء مُرسَل — الشكلان يتعارضان أو الجسم ناقص.
            return NextResponse.json(
                { error: 'أرسل newQuantity لتصحيح الجرد أو quantity للإتلاف — وليس كليهما.' },
                { status: 400 }
            );
        }

        // الشكل صالح الآن — المفتاح مُحسَم: تصحيح جرد أم إتلاف.
        const gate = await requireWarehousePermission(ctx, hasNewQuantity ? 'canAdjustStock' : 'canWriteOffStock');
        if (!gate.ok) return gate.response;

        // الملكية: الدفعة يجب أن تنتمي عبر صنفها لكتالوج مذخر الفاعل حصراً.
        const batch = await prisma.warehouseBatch.findFirst({
            where: { id: batchId, catalogItem: { warehouseId: ctx.warehouseId } },
            select: { id: true, catalogItemId: true, quantity: true },
        });
        if (!batch) {
            return NextResponse.json({ error: 'الدفعة غير موجودة ضمن كتالوج مذخرك' }, { status: 404 });
        }

        if (hasNewQuantity) {
            // ── تصحيح جرد (ADJUSTMENT) ───────────────────────────────────────
            const newQuantity = Number(body.newQuantity);
            if (!Number.isInteger(newQuantity) || newQuantity < 0) {
                return NextResponse.json({ error: 'الكمية الجديدة يجب أن تكون عدداً صحيحاً غير سالب' }, { status: 400 });
            }
            const delta = newQuantity - batch.quantity;
            if (delta === 0) {
                return NextResponse.json({ error: 'الكمية الجديدة مطابقة للكمية الحالية — لا حاجة للتعديل' }, { status: 400 });
            }

            const moveQuantity = Math.abs(delta);
            const moveCheck = validateStockMove({ type: 'ADJUSTMENT', quantity: moveQuantity });
            if (!moveCheck.ok) {
                return NextResponse.json({ error: moveCheck.error }, { status: 400 });
            }
            // اتجاه التصحيح غير مستنتَج من quantity وحدها في سجل الحركات (دائماً
            // موجبة — انظر تعليق WarehouseStockMove.quantity في المخطط)، فيُحفَظ
            // ضمن reason بادئة صريحة كي يبقى سجل التدقيق قابلاً للقراءة.
            const directedReason = `${delta > 0 ? 'زيادة' : 'نقص'}: ${reason}`;

            // ملاحظة تصميم: تصحيح الجرد يضبط رصيداً **مطلقاً** (truth من عدّ
            // فعلي)، فهو يتعمّد الكتابة فوق أي تغيّر متزامن آخر (مثل شحن يُنقِص
            // نفس الدفعة أثناء الجرد) — بخلاف الإتلاف أدناه الذي يُصرَف كفارق
            // نسبي ويحتاج حارس تزامن صريح. WarehouseStockMove الخاص بذلك التغيّر
            // المتزامن يبقى في السجل حتى لو "كتبت" فوقه هذه العملية رصيد الدفعة.
            const updated = await prisma.$transaction(async (tx) => {
                const b = await tx.warehouseBatch.update({
                    where: { id: batch.id },
                    data: { quantity: newQuantity },
                });
                await tx.warehouseStockMove.create({
                    data: {
                        catalogItemId: batch.catalogItemId,
                        batchId: batch.id,
                        type: 'ADJUSTMENT',
                        quantity: moveQuantity,
                        reason: directedReason,
                        actorName: ctx.user.name ?? ctx.user.email ?? null,
                    },
                });
                return b;
            });

            return NextResponse.json({ batch: updated });
        }

        // ── إتلاف (DAMAGE) ────────────────────────────────────────────────────
        const damageQuantity = Number(body.quantity);
        const moveCheck = validateStockMove({
            type: 'DAMAGE',
            quantity: damageQuantity,
            batchQuantity: batch.quantity,
        });
        if (!moveCheck.ok) {
            return NextResponse.json({ error: moveCheck.error }, { status: 400 });
        }

        const updated = await prisma.$transaction(async (tx) => {
            // القراءة أعلاه (findFirst) لا تقفل الصف — إتلاف أو شحن آخر متزامن قد
            // يُنقِص نفس الدفعة بين تلك القراءة وهذا التحديث. الحارس: decrement
            // مشروط بـ quantity >= الكمية المطلوبة في شرط WHERE نفسه (ذرّي على
            // مستوى الصف)، فلا يمكن أبداً أن ينتج رصيد سالب — نفس نمط الحارس في
            // مسار الشحن (deductStockForShipment).
            const applied = await tx.warehouseBatch.updateMany({
                where: { id: batch.id, quantity: { gte: damageQuantity } },
                data: { quantity: { decrement: damageQuantity } },
            });
            if (applied.count !== 1) {
                throw new ConcurrentStockChangeError('تغيّر رصيد الدفعة أثناء المعالجة (عملية متزامنة أخرى) — أعد المحاولة.');
            }
            await tx.warehouseStockMove.create({
                data: {
                    catalogItemId: batch.catalogItemId,
                    batchId: batch.id,
                    type: 'DAMAGE',
                    quantity: damageQuantity,
                    reason,
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                },
            });
            return tx.warehouseBatch.findUniqueOrThrow({ where: { id: batch.id } });
        });

        return NextResponse.json({ batch: updated });
    } catch (e: any) {
        if (e instanceof ConcurrentStockChangeError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal stock adjust POST error:', e);
        return NextResponse.json({ error: 'فشل في تنفيذ العملية' }, { status: 500 });
    }
}
