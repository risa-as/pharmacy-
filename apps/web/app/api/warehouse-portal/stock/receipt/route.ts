export const dynamic = 'force-dynamic';

// المرحلة ب من ميزة تتبّع مخزون المذخر: استلام دفعة جديدة — { catalogItemId,
// batchNumber, expiryDate, quantity, costPrice?, supplierName? }. ينشئ
// WarehouseBatch + WarehouseStockMove(RECEIPT) في معاملة واحدة، ويحدّث
// WarehouseCatalogItem.costPrice بأسلوب "آخر كلفة" (last-cost) — نفس استراتيجية
// تحديث Inventory.cost في app/api/purchases/[id]/receive/route.ts.
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canReceiveStock (OWNER/MANAGER/
// INVENTORY حسب المصفوفة). ملاحظة توافق: قبل هذه المرحلة كان أي STAFF فعّال
// يستطيع الاستلام (requireActiveActor لم يكن يفحص أكثر من isActive)؛ STAFF
// القديم (deprecated) يُعامَل الآن كمرادف لـ SALES، وSALES لا يملك
// canReceiveStock افتراضياً — فحساب STAFF قديم لم يُعَد دوره صراحةً يفقد
// هذه القدرة حتى يُسنَد له دور INVENTORY أو MANAGER (أو تخصيص فردي صريح).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { validateStockMove } from '@/app/lib/warehouse-stock';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

// POST: تسجيل استلام دفعة على صنف من كتالوج مذخري حصراً.
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canReceiveStock');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const catalogItemId: string | undefined = body.catalogItemId;
        const batchNumber = typeof body.batchNumber === 'string' ? body.batchNumber.trim() : '';
        const quantity = Number(body.quantity);
        const supplierName =
            typeof body.supplierName === 'string' && body.supplierName.trim() ? body.supplierName.trim() : null;

        if (!catalogItemId) {
            return NextResponse.json({ error: 'catalogItemId مطلوب' }, { status: 400 });
        }
        if (!batchNumber) {
            return NextResponse.json({ error: 'رقم الدفعة مطلوب' }, { status: 400 });
        }

        const moveCheck = validateStockMove({ type: 'RECEIPT', quantity });
        if (!moveCheck.ok) {
            return NextResponse.json({ error: moveCheck.error }, { status: 400 });
        }

        const expiryRaw = body.expiryDate ? new Date(body.expiryDate) : null;
        if (!expiryRaw || Number.isNaN(expiryRaw.getTime())) {
            return NextResponse.json({ error: 'تاريخ انتهاء غير صالح' }, { status: 400 });
        }
        // استلام دواء منتهي الصلاحية خطأ دائماً — لا استثناء، حتى لو كان
        // المذخر يريد تسجيله للإتلاف الفوري (استخدم /stock/adjust للإتلاف
        // على دفعة مستلمة أصلاً وقت كانت صالحة).
        if (expiryRaw.getTime() <= Date.now()) {
            return NextResponse.json(
                { error: 'لا يمكن استلام دفعة منتهية الصلاحية بالفعل — تحقق من تاريخ الانتهاء.' },
                { status: 400 }
            );
        }

        let costPrice: number | undefined;
        if (body.costPrice !== undefined && body.costPrice !== null) {
            const c = Number(body.costPrice);
            if (!Number.isFinite(c) || c < 0) {
                return NextResponse.json({ error: 'كلفة الشراء يجب أن تكون رقماً غير سالب' }, { status: 400 });
            }
            costPrice = c;
        }

        // الملكية: الصنف يجب أن ينتمي لكتالوج مذخر الفاعل حصراً.
        const catalogItem = await prisma.warehouseCatalogItem.findFirst({
            where: { id: catalogItemId, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!catalogItem) {
            return NextResponse.json({ error: 'الصنف غير موجود في كتالوج مذخرك' }, { status: 404 });
        }

        const batch = await prisma.$transaction(async (tx) => {
            const created = await tx.warehouseBatch.create({
                data: {
                    catalogItemId: catalogItem.id,
                    batchNumber,
                    expiryDate: expiryRaw,
                    quantity,
                    initialQuantity: quantity,
                    costPrice: costPrice ?? 0,
                    supplierName,
                },
            });

            await tx.warehouseStockMove.create({
                data: {
                    catalogItemId: catalogItem.id,
                    batchId: created.id,
                    type: 'RECEIPT',
                    quantity,
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                },
            });

            // استراتيجية آخر كلفة (last-cost) — فقط إن أرسل الطالب كلفة فعلاً؛
            // بلا قيمة مُرسَلة تبقى كلفة الصنف كما هي بدل تصفيرها بالخطأ.
            if (costPrice !== undefined) {
                await tx.warehouseCatalogItem.update({
                    where: { id: catalogItem.id },
                    data: { costPrice },
                });
            }

            return created;
        });

        return NextResponse.json({ batch }, { status: 201 });
    } catch (e: any) {
        console.error('warehouse-portal stock receipt POST error:', e);
        return NextResponse.json({ error: 'فشل في تسجيل الاستلام' }, { status: 500 });
    }
}
