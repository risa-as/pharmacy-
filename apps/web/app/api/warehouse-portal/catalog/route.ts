export const dynamic = 'force-dynamic';

// المرحلة 3 من ميزة المذاخر: كتالوج المذخر — قراءة/إضافة/تعديل.
// الكتابة تمر عبر resolveCatalogDrug(): الصف العالمي أولاً، ثم صف المذخر الخاص.
// ميزة نطاق المذخر: باركود غير مسجل لم يعد مرفوضاً — يكفي أن يُرسل المذخر الاسم
// التجاري فيُنشأ صف GlobalDrug تحت نطاق مذخره (warehouseId)، ويظهر لإدارة المنصة
// في /dashboard/admin/drugs تحت بند «المذاخر» لترقيته إلى الكتالوج العالمي.
// الأصناف بلا باركود تبقى مرفوضة برسالة صريحة (الباركود هو مفتاح المطابقة).
//
// Phase 3 (الأدوار والصلاحيات): canViewCatalog للقراءة، canEditCatalog
// لإضافة/حذف صنف، canEditPricing تحديداً عند تغيّر السعر. POST يستخدم upsert
// (قد يكون فعلياً "تعديل سعر صنف موجود" لا إضافة جديد) — فإن كان الصنف
// موجوداً فعلاً والسعر المُرسَل يختلف عن سعره المخزَّن، يُطلَب canEditPricing
// أيضاً، وإلا يستطيع مستخدم يملك canEditCatalog فقط (كـ INVENTORY) تغيير سعر
// صنف قائم عبر هذا المسار متجاوزاً بوابة PATCH أدناه المخصصة لذلك بالضبط.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { resolveCatalogDrug, NEEDS_NAME_MESSAGE } from '@/app/lib/warehouse-catalog';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { hasWarehousePermission, WAREHOUSE_PERMISSION_LABELS, type WarehousePermissions } from '@/app/lib/warehouse-permissions';
import { validateCostPrice, validateMinStock, validateBonusThreshold, validateBonusQuantity } from '@/app/lib/warehouse-pricing';

// GET: كتالوج مذخري (بحث بالاسم أو الباركود).
export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewCatalog');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const search = (searchParams.get('search') || '').trim();

        const items = await prisma.warehouseCatalogItem.findMany({
            where: {
                warehouseId: ctx.warehouseId,
                ...(search
                    ? {
                          OR: [
                              { drug: { tradeName: { contains: search, mode: 'insensitive' } } },
                              { barcode: { contains: search } },
                          ],
                      }
                    : {}),
            },
            include: { drug: { select: { tradeName: true, scientificName: true } } },
            orderBy: { drug: { tradeName: 'asc' } },
            take: 500,
        });

        return NextResponse.json({ items });
    } catch (e: any) {
        console.error('warehouse-portal catalog GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب الكتالوج' }, { status: 500 });
    }
}

// POST: إضافة صنف للكتالوج — { barcode, price, isAvailable?, costPrice?, minStock? }
// الواجهة عادةً ترسل دفعة عبر /import؛ هذا المسار للإضافة الفردية.
// costPrice/minStock اختياريان: غيابهما لا يصفّر قيمة مخزَّنة سابقاً على
// update (انظر تعليق بناء updateData أدناه)، ويستخدم افتراضي العمود (0) على create.
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditCatalog');
        if (!gate.ok) return gate.response;

        const body = await req.json();
        const barcode: string | undefined = body?.barcode;
        const price: number | undefined = body?.price;
        const isAvailable: boolean = body?.isAvailable ?? true;
        // ميزة نطاق المذخر: هذه الحقول تُستعمل فقط حين يكون الباركود غير مسجل —
        // فتُنشئ صف دواء تحت نطاق هذا المذخر. تُهمَل تماماً إن كان الباركود مسجلاً
        // أصلاً (عالمياً أو لدى المذخر) كي لا يُعيد مذخرٌ تسمية دواء عالمي.
        const tradeName: string | undefined =
            typeof body?.tradeName === 'string' ? body.tradeName.trim() || undefined : undefined;
        const scientificName: string | undefined =
            typeof body?.scientificName === 'string' ? body.scientificName.trim() || undefined : undefined;
        const origin: string | undefined =
            typeof body?.origin === 'string' ? body.origin.trim() || undefined : undefined;

        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
            return NextResponse.json({ error: 'السعر مطلوب ويجب أن يكون موجباً' }, { status: 400 });
        }

        // costPrice وminStock اختياريان دائماً — انظر warehouse-pricing.ts:
        // costPrice غائب/صفر يعني "تكلفة غير معروفة" (marginByItem يتعامل معها
        // كذلك)، وminStock صفر يعني "بلا تنبيه نقص مخزون" (isLowStock). كلاهما
        // undefined هنا إن لم يُرسَل صراحةً في الجسم — هذا التمييز حاسم أدناه
        // لضمان أن upsert لا يصفّر قيمة مخزَّنة سابقاً لمجرد غيابها عن الطلب.
        let costPrice: number | undefined;
        if (body?.costPrice !== undefined) {
            const validated = validateCostPrice(body.costPrice);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            costPrice = validated.value;
        }

        let minStock: number | undefined;
        if (body?.minStock !== undefined) {
            const validated = validateMinStock(body.minStock);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            minStock = validated.value;
        }

        // ميزة البونص: bonusThreshold/bonusQuantity اختياريان بنفس فلسفة
        // costPrice/minStock أعلاه — غيابهما لا يصفّر قاعدة بونص مخزَّنة سابقاً.
        let bonusThreshold: number | undefined;
        if (body?.bonusThreshold !== undefined) {
            const validated = validateBonusThreshold(body.bonusThreshold);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            bonusThreshold = validated.value;
        }

        let bonusQuantity: number | undefined;
        if (body?.bonusQuantity !== undefined) {
            const validated = validateBonusQuantity(body.bonusQuantity);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            bonusQuantity = validated.value;
        }

        const resolved = await resolveCatalogDrug(prisma, ctx.warehouseId, barcode);
        if (!resolved.ok && resolved.reason === 'EMPTY_BARCODE') {
            return NextResponse.json(
                { error: 'الصنف بلا باركود صالح ولا يمكن إضافته للكتالوج.', reason: 'EMPTY_BARCODE' },
                { status: 400 }
            );
        }

        // باركود غير مسجل: لم يُعد رفضاً. إن لم يرسل المذخر اسماً تجارياً نطلبه
        // بـ reason: 'NEEDS_NAME' — فتُظهر الواجهة حقل الاسم وتعيد الإرسال.
        const existingDrug = resolved.ok ? resolved.drug : null;
        if (!existingDrug && !tradeName) {
            return NextResponse.json(
                { error: NEEDS_NAME_MESSAGE, reason: 'NEEDS_NAME' },
                { status: 400 }
            );
        }

        // باركود الصف الموجود قد يختلف عن المُرسَل بالمسافات الطرفية فقط — والقصّ
        // يجعلهما متطابقين، فيصلح المُرسَل مفتاحاً لبحث بند الكتالوج قبل إنشاء أي دواء.
        const effectiveBarcode = existingDrug ? existingDrug.barcode : String(barcode).trim();

        // upsert يعني أن هذا الطلب قد يكون فعلياً "تغيير سعر صنف موجود" — انظر
        // تعليق رأس الملف. فحص إضافي شرطي هنا (بلا استعلام Prisma ثانٍ عن
        // الفاعل — إعادة استخدام gate.actor مباشرة).
        const existing = await prisma.warehouseCatalogItem.findUnique({
            where: { warehouseId_barcode: { warehouseId: ctx.warehouseId, barcode: effectiveBarcode } },
            select: { id: true, price: true, costPrice: true, bonusThreshold: true, bonusQuantity: true },
        });

        if (existing && existing.price !== price && !hasWarehousePermission(gate.actor, 'canEditPricing')) {
            const label = WAREHOUSE_PERMISSION_LABELS.canEditPricing.label;
            return NextResponse.json(
                { error: `لا تملك صلاحية "${label}" اللازمة لتغيير سعر صنف موجود عبر هذا المسار.` },
                { status: 403 }
            );
        }

        // نفس حراسة السعر أعلاه حرفياً، لكن لتغيير كلفة صنف موجود — كلفة الشراء
        // حسّاسة تجارياً بنفس درجة السعر (تكشف الهامش). لا فحص مماثل لـ minStock:
        // هو إعداد تشغيلي بحت، وcanEditCatalog (المطلوبة أصلاً لكل POST) تكفيه.
        if (
            existing &&
            costPrice !== undefined &&
            existing.costPrice !== costPrice &&
            !hasWarehousePermission(gate.actor, 'canEditPricing')
        ) {
            const label = WAREHOUSE_PERMISSION_LABELS.canEditPricing.label;
            return NextResponse.json(
                { error: `لا تملك صلاحية "${label}" اللازمة لتغيير كلفة صنف موجود عبر هذا المسار.` },
                { status: 403 }
            );
        }

        // نفس حراسة السعر/الكلفة أعلاه حرفياً، لكن لتغيير قاعدة بونص صنف موجود
        // — بونص شرط تجاري («اشترِ X خذ Y مجاناً») حسّاس بنفس درجة السعر، فمن
        // يملك canEditCatalog فقط (كـ INVENTORY) لا يُغيّره عبر هذا المسار
        // متجاوزاً بوابة PATCH المخصصة (نفس الثغرة الموثَّقة أعلاه لـ price/costPrice).
        if (
            existing &&
            ((bonusThreshold !== undefined && existing.bonusThreshold !== bonusThreshold) ||
                (bonusQuantity !== undefined && existing.bonusQuantity !== bonusQuantity)) &&
            !hasWarehousePermission(gate.actor, 'canEditPricing')
        ) {
            const label = WAREHOUSE_PERMISSION_LABELS.canEditPricing.label;
            return NextResponse.json(
                { error: `لا تملك صلاحية "${label}" اللازمة لتغيير قاعدة بونص صنف موجود عبر هذا المسار.` },
                { status: 403 }
            );
        }

        // كل بوابات التحقق والصلاحيات مرّت — الآن فقط يُنشأ صف الدواء تحت نطاق
        // المذخر إن كان الباركود مجهولاً. الإنشاء قبل البوابات كان سيخلّف دواءً
        // يتيماً بلا بند كتالوج عند أي رفض، فيظهر في لوحة الترقية كعدد وهمي.
        const drug =
            existingDrug ??
            (await prisma.globalDrug.create({
                data: {
                    barcode: effectiveBarcode,
                    tradeName: tradeName as string,
                    scientificName: scientificName || (tradeName as string),
                    origin: origin || null,
                    warehouseId: ctx.warehouseId,
                },
            }));

        // مفاتيح costPrice/minStock/bonusThreshold/bonusQuantity تُضاف لكائن
        // update/create فقط حين تُرسَل صراحةً — إغفالها يعني "اتركها كما هي" على
        // update (Prisma لا يلمس عموداً غائباً عن data)، و"استخدم افتراضي
        // العمود" (0) على create.
        const updateData: {
            price: number;
            isAvailable: boolean;
            drugId: string;
            costPrice?: number;
            minStock?: number;
            bonusThreshold?: number;
            bonusQuantity?: number;
        } = {
            price,
            isAvailable,
            drugId: drug.id,
        };
        if (costPrice !== undefined) updateData.costPrice = costPrice;
        if (minStock !== undefined) updateData.minStock = minStock;
        if (bonusThreshold !== undefined) updateData.bonusThreshold = bonusThreshold;
        if (bonusQuantity !== undefined) updateData.bonusQuantity = bonusQuantity;

        const createData: {
            warehouseId: string;
            drugId: string;
            barcode: string;
            price: number;
            isAvailable: boolean;
            costPrice?: number;
            minStock?: number;
            bonusThreshold?: number;
            bonusQuantity?: number;
        } = {
            warehouseId: ctx.warehouseId,
            drugId: drug.id,
            barcode: drug.barcode,
            price,
            isAvailable,
        };
        if (costPrice !== undefined) createData.costPrice = costPrice;
        if (minStock !== undefined) createData.minStock = minStock;
        if (bonusThreshold !== undefined) createData.bonusThreshold = bonusThreshold;
        if (bonusQuantity !== undefined) createData.bonusQuantity = bonusQuantity;

        const item = await prisma.warehouseCatalogItem.upsert({
            where: {
                warehouseId_barcode: {
                    warehouseId: ctx.warehouseId,
                    barcode: drug.barcode,
                },
            },
            update: updateData,
            create: createData,
        });

        // scope يخبر الواجهة أي رسالة تُظهر: صنف عالمي أُضيف كما كان دائماً، أم صنف
        // جديد تحت نطاق هذا المذخر ينتظر ترقية الإدارة.
        return NextResponse.json(
            { item, scope: drug.warehouseId ? 'WAREHOUSE' : 'GLOBAL' },
            { status: existing ? 200 : 201 }
        );
    } catch (e: any) {
        console.error('warehouse-portal catalog POST error:', e);
        return NextResponse.json({ error: 'فشل في إضافة الصنف' }, { status: 500 });
    }
}

// PATCH: تعديل صنف موجود — { id, price?, isAvailable?, costPrice?, minStock?, bonusThreshold?, bonusQuantity? }
export async function PATCH(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const body = await req.json();
        const id: string | undefined = body?.id;
        if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 });

        // المفتاح المطلوب يعتمد على الحقل المُرسَل فعلياً: تغيير السعر أو كلفة
        // الشراء أو قاعدة البونص يتطلب canEditPricing (كلها شروط تجارية حسّاسة
        // — الكلفة تكشف الهامش، والبونص خصم فعلي)، وتغيير التوفر (isAvailable)
        // أو حد إعادة الطلب (minStock) يتطلب canEditCatalog (إعدادات تشغيلية).
        // إرسال أكثر من حقل في نفس الطلب يتطلب كل الصلاحيات المقابلة معاً. جسم
        // بلا أي حقل صالح لا يزال يتطلب canEditCatalog كحد أدنى (بدل السماح
        // لأي حساب فعّال بالوصول إلى رسالة "لا توجد حقول للتعديل" بلا أي فحص
        // صلاحية أصلاً).
        const requiredKeys: (keyof WarehousePermissions)[] = [];
        if (body.price !== undefined) requiredKeys.push('canEditPricing');
        if (body.isAvailable !== undefined) requiredKeys.push('canEditCatalog');
        if (body.costPrice !== undefined) requiredKeys.push('canEditPricing');
        if (body.minStock !== undefined) requiredKeys.push('canEditCatalog');
        if (body.bonusThreshold !== undefined) requiredKeys.push('canEditPricing');
        if (body.bonusQuantity !== undefined) requiredKeys.push('canEditPricing');
        if (requiredKeys.length === 0) requiredKeys.push('canEditCatalog');

        const gate = await requireWarehousePermission(ctx, Array.from(new Set(requiredKeys)));
        if (!gate.ok) return gate.response;

        const existing = await prisma.warehouseCatalogItem.findFirst({
            where: { id, warehouseId: ctx.warehouseId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'الصنف غير موجود في كتالوج مذخرك' }, { status: 404 });
        }

        const data: {
            price?: number;
            isAvailable?: boolean;
            costPrice?: number;
            minStock?: number;
            bonusThreshold?: number;
            bonusQuantity?: number;
        } = {};
        if (body.price !== undefined) {
            if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0) {
                return NextResponse.json({ error: 'السعر يجب أن يكون موجباً' }, { status: 400 });
            }
            data.price = body.price;
        }
        if (body.isAvailable !== undefined) {
            if (typeof body.isAvailable !== 'boolean') {
                return NextResponse.json({ error: 'isAvailable يجب أن يكون منطقياً' }, { status: 400 });
            }
            data.isAvailable = body.isAvailable;
        }
        if (body.costPrice !== undefined) {
            const validated = validateCostPrice(body.costPrice);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            data.costPrice = validated.value;
        }
        if (body.minStock !== undefined) {
            const validated = validateMinStock(body.minStock);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            data.minStock = validated.value;
        }
        if (body.bonusThreshold !== undefined) {
            const validated = validateBonusThreshold(body.bonusThreshold);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            data.bonusThreshold = validated.value;
        }
        if (body.bonusQuantity !== undefined) {
            const validated = validateBonusQuantity(body.bonusQuantity);
            if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
            data.bonusQuantity = validated.value;
        }
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'لا توجد حقول للتعديل' }, { status: 400 });
        }

        const item = await prisma.warehouseCatalogItem.update({ where: { id }, data });
        return NextResponse.json({ item });
    } catch (e: any) {
        console.error('warehouse-portal catalog PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تعديل الصنف' }, { status: 500 });
    }
}

// DELETE: حذف صنف من الكتالوج — ?id=
export async function DELETE(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditCatalog');
        if (!gate.ok) return gate.response;

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 });

        const existing = await prisma.warehouseCatalogItem.findFirst({
            where: { id, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'الصنف غير موجود في كتالوج مذخرك' }, { status: 404 });
        }

        await prisma.warehouseCatalogItem.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('warehouse-portal catalog DELETE error:', e);
        return NextResponse.json({ error: 'فشل في حذف الصنف' }, { status: 500 });
    }
}
