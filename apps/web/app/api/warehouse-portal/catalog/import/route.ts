export const dynamic = 'force-dynamic';

// المرحلة 3 من ميزة المذاخر: استيراد كتالوج المذخر من Excel.
// الواجهة تقرأ صفوف Excel محلياً وترسلها JSON — نفس نمط /api/inventory/import.
// المطابقة على الباركود عبر resolveCatalogDrug()؛ تقرير مطابقة كامل يعود للواجهة.
// ميزة نطاق المذخر: باركود غير مسجل لا يُفشل الصف بعد الآن إن حمل الصف عمود اسم
// تجاري — يُنشأ صف دواء تحت نطاق هذا المذخر (warehouseId) وينتظر ترقية الإدارة.
// صف بلا باركود، أو بباركود غير مسجل وبلا اسم، يبقى فاشلاً برسالته الصريحة.
import { NextRequest, NextResponse } from 'next/server';
import type { GlobalDrug } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { resolveCatalogDrug, EMPTY_BARCODE_MESSAGE, NEEDS_NAME_MESSAGE } from '@/app/lib/warehouse-catalog';
import { requireWarehousePermission, hasWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { validateCostPrice, validateMinStock } from '@/app/lib/warehouse-pricing';

interface ImportRow {
    barcode?: string;
    price?: number;
    isAvailable?: boolean;
    // ميزة نطاق المذخر: عمود الاسم التجاري (اختياري) — يُستعمل فقط للباركودات غير
    // المسجلة، ويُهمَل لباركود موجود أصلاً كي لا يُعيد استيرادٌ تسمية دواء عالمي.
    tradeName?: string;
    scientificName?: string;
    // اختياريان — انظر تعليق حلقة المعالجة أدناه: عمود/خلية غائبة (undefined)
    // تعني "اترك القيمة المخزَّنة كما هي"، وليست "صفّرها". الواجهة (CatalogClient.tsx)
    // تحذف المفتاح بالكامل من الصف حين تكون الخلية فارغة أو العمود غير موجود
    // في ملف الاستيراد أصلاً — لا يصل هذا المسار قيمة 0 اصطناعية أبداً لحقل لم يُملأ.
    costPrice?: number;
    minStock?: number;
}

// Import permission allows the workflow; edited fields retain their own permissions.
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canImportCatalog');
        if (!gate.ok) return gate.response;

        const { rows } = (await req.json()) as { rows?: ImportRow[] };

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ error: 'لا توجد بيانات للاستيراد' }, { status: 400 });
        }
        if (rows.length > 1000) {
            return NextResponse.json(
                { error: 'الحد الأقصى 1000 صف لكل طلب — قسّم الملف على دفعات' },
                { status: 400 }
            );
        }

        let imported = 0; // صفوف جديدة
        let updated = 0; // صفوف موجودة حُدّث سعرها
        let failed = 0;
        const errors: Array<{ row: number; barcode?: string; message: string }> = [];
        // مفتاحها الباركود — انظر تعليق الاستعمال داخل الحلقة.
        const createdThisRun = new Map<string, GlobalDrug>();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const barcode = (row.barcode ?? '').toString().trim();

            // صفوف أُنشئت في هذه الدفعة نفسها: ملف واحد قد يحمل نفس الباركود
            // المجهول مرتين، والإنشاء الثاني كان سيخالف @@unique([barcode, warehouseId]).
            const cached = createdThisRun.get(barcode);
            const resolved = cached
                ? ({ ok: true, drug: cached, scope: 'WAREHOUSE' } as const)
                : await resolveCatalogDrug(prisma, ctx.warehouseId, barcode);
            const rowTradeName = (row.tradeName ?? '').toString().trim();
            if (!resolved.ok && (resolved.reason === 'EMPTY_BARCODE' || !rowTradeName)) {
                failed += 1;
                errors.push({
                    row: i + 2, // +2: صف العناوين + الترقيم من 1
                    barcode: barcode || undefined,
                    message:
                        resolved.reason === 'EMPTY_BARCODE'
                            ? EMPTY_BARCODE_MESSAGE
                            : NEEDS_NAME_MESSAGE,
                });
                continue;
            }

            // الصف موجود ⇒ نستعمله. غير موجود ⇒ لا يُنشأ الآن: الإنشاء يُؤخَّر إلى
            // ما بعد التحقق من السعر والكلفة أدناه، وإلا خلّف صفٌّ فاشل السعر دواءً
            // يتيماً بلا بند كتالوج يظهر بعدها في لوحة الترقية كعدد وهمي.
            const existingDrug = resolved.ok ? resolved.drug : null;

            const price = Number(row.price);
            if (!Number.isFinite(price) || price <= 0) {
                failed += 1;
                errors.push({ row: i + 2, barcode, message: 'سعر غير صالح — يجب أن يكون موجباً.' });
                continue;
            }

            // costPrice/minStock: عمود/خلية غائبة (row.<field> === undefined) تعني
            // "لا تغيّر القيمة المخزَّنة" — يُعامَل تماماً كما في POST/PATCH
            // الفردي أعلاه (نفس دوال التحقق من warehouse-pricing.ts). خطأ تحقق هنا
            // يُسجَّل كصف فاشل في التقرير بدل إسقاطه صامتاً أو كتابة قيمة غير صالحة.
            let costPrice: number | undefined;
            if (row.costPrice !== undefined) {
                const validated = validateCostPrice(row.costPrice);
                if (!validated.ok) {
                    failed += 1;
                    errors.push({ row: i + 2, barcode, message: validated.error });
                    continue;
                }
                costPrice = validated.value;
            }

            let minStock: number | undefined;
            if (row.minStock !== undefined) {
                const validated = validateMinStock(row.minStock);
                if (!validated.ok) {
                    failed += 1;
                    errors.push({ row: i + 2, barcode, message: validated.error });
                    continue;
                }
                minStock = validated.value;
            }

            const isAvailable = row.isAvailable === false ? false : true;

            if (!existingDrug && (!hasWarehousePermission(gate.actor, 'canEditCatalog') || !hasWarehousePermission(gate.actor, 'canEditPricing'))) {
                failed++;
                errors.push({ row: i + 2, barcode, message: 'إنشاء صنف بسعر يتطلب صلاحية الكتالوج والتسعير.' });
                continue;
            }

            // كل التحقق نجح — الآن فقط يُنشأ صف الدواء تحت نطاق المذخر إن لزم.
            const drug =
                existingDrug ??
                (await (async () => {
                    const created = await prisma.globalDrug.create({
                        data: {
                            barcode,
                            tradeName: rowTradeName,
                            scientificName:
                                (row.scientificName ?? '').toString().trim() || rowTradeName,
                            warehouseId: ctx.warehouseId,
                        },
                    });
                    createdThisRun.set(barcode, created);
                    return created;
                })());

            const existing = await prisma.warehouseCatalogItem.findUnique({
                where: {
                    warehouseId_barcode: {
                        warehouseId: ctx.warehouseId,
                        barcode: drug.barcode,
                    },
                },
                select: { id: true, price: true, costPrice: true, isAvailable: true, minStock: true },
            });

            if (existing) {
                if ((price !== existing.price || (costPrice !== undefined && costPrice !== existing.costPrice)) &&
                    !hasWarehousePermission(gate.actor, 'canEditPricing')) {
                    failed += 1;
                    errors.push({ row: i + 2, barcode, message: 'تغيير السعر أو التكلفة يتطلب صلاحية تغيير الأسعار.' });
                    continue;
                }
                if ((isAvailable !== existing.isAvailable || (minStock !== undefined && minStock !== existing.minStock)) &&
                    !hasWarehousePermission(gate.actor, 'canEditCatalog')) {
                    failed += 1;
                    errors.push({ row: i + 2, barcode, message: 'تغيير التوفر أو حد المخزون يتطلب صلاحية تعديل الكتالوج.' });
                    continue;
                }
                // Never write fields the actor cannot edit, even if a concurrent
                // edit occurs after the comparison above.
                const updateData = {
                    ...(hasWarehousePermission(gate.actor, 'canEditPricing') ? { price, ...(costPrice !== undefined ? { costPrice } : {}) } : {}),
                    ...(hasWarehousePermission(gate.actor, 'canEditCatalog') ? { isAvailable, drugId: drug.id, ...(minStock !== undefined ? { minStock } : {}) } : {}),
                };
                await prisma.$transaction(async tx => {
                    await tx.$queryRaw`SELECT id FROM "WarehouseCatalogItem" WHERE id = ${existing.id} FOR UPDATE`;
                    const before = await tx.warehouseCatalogItem.findUniqueOrThrow({ where: { id: existing.id } });
                    await tx.warehouseCatalogItem.update({ where: { id: existing.id }, data: updateData });
                    await tx.auditLog.create({ data: { userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? ctx.user.id,
                        action: 'UPDATE', entity: 'WAREHOUSE_CATALOG', entityId: existing.id,
                        details: JSON.stringify({ warehouseId: ctx.warehouseId, source: 'IMPORT', before: { price: before.price, costPrice: before.costPrice }, changes: updateData }) } });
                });
                updated += 1;
            } else {
                if (!hasWarehousePermission(gate.actor, 'canEditCatalog') || !hasWarehousePermission(gate.actor, 'canEditPricing')) {
                    failed += 1;
                    errors.push({ row: i + 2, barcode, message: 'إضافة صنف تتطلب صلاحية تعديل الكتالوج.' });
                    continue;
                }
                const createData: {
                    warehouseId: string;
                    drugId: string;
                    barcode: string;
                    price: number;
                    isAvailable: boolean;
                    costPrice?: number;
                    minStock?: number;
                } = {
                    warehouseId: ctx.warehouseId,
                    drugId: drug.id,
                    barcode: drug.barcode,
                    price,
                    isAvailable,
                };
                if (costPrice !== undefined) createData.costPrice = costPrice;
                if (minStock !== undefined) createData.minStock = minStock;
                await prisma.warehouseCatalogItem.create({ data: createData });
                imported += 1;
            }
        }

        return NextResponse.json({ imported, updated, failed, errors });
    } catch (e: any) {
        console.error('warehouse-portal catalog import error:', e);
        return NextResponse.json({ error: 'فشل في استيراد الكتالوج' }, { status: 500 });
    }
}
