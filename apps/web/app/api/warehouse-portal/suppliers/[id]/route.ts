export const dynamic = 'force-dynamic';

// مشتريات المذخر وذممه الدائنة: تعديل بيانات مورّد أو إيقافه — { name?,
// phone?, contactPerson?, notes?, isActive? }. Phase 3: يتطلب canCreatePurchase
// (انظر تعليق app/api/warehouse-portal/suppliers/route.ts لسبب استخدام نفس
// الصلاحية بلا مفتاح منفصل لإدارة الموردين).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canCreatePurchase');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        // ملكية الصف: يجب أن ينتمي لمذخر الفاعل حصراً.
        const existing = await prisma.warehouseSupplier.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'المورّد غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        const data: {
            name?: string;
            phone?: string | null;
            contactPerson?: string | null;
            notes?: string | null;
            isActive?: boolean;
        } = {};

        if ('name' in body) {
            const v = typeof body.name === 'string' ? body.name.trim() : '';
            if (!v) {
                return NextResponse.json({ error: 'اسم المورّد لا يمكن أن يكون فارغاً.' }, { status: 400 });
            }
            data.name = v;
        }
        if ('phone' in body) {
            if (body.phone !== null && typeof body.phone !== 'string') {
                return NextResponse.json({ error: 'رقم الهاتف غير صالح.' }, { status: 400 });
            }
            data.phone = body.phone === null ? null : body.phone.trim() || null;
        }
        if ('contactPerson' in body) {
            if (body.contactPerson !== null && typeof body.contactPerson !== 'string') {
                return NextResponse.json({ error: 'اسم جهة الاتصال غير صالح.' }, { status: 400 });
            }
            data.contactPerson = body.contactPerson === null ? null : body.contactPerson.trim() || null;
        }
        if ('notes' in body) {
            if (body.notes !== null && typeof body.notes !== 'string') {
                return NextResponse.json({ error: 'الملاحظات غير صالحة.' }, { status: 400 });
            }
            data.notes = body.notes === null ? null : body.notes.trim() || null;
        }
        if ('isActive' in body) {
            if (typeof body.isActive !== 'boolean') {
                return NextResponse.json({ error: 'قيمة الحالة يجب أن تكون true/false.' }, { status: 400 });
            }
            data.isActive = body.isActive;
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'لا توجد حقول صالحة للتحديث' }, { status: 400 });
        }

        const supplier = await prisma.warehouseSupplier.update({ where: { id: params.id }, data });

        return NextResponse.json({ supplier });
    } catch (e: any) {
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'يوجد بالفعل مورّد بهذا الاسم لدى مذخرك.' },
                { status: 409 }
            );
        }
        console.error('warehouse-portal supplier PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تعديل بيانات المورّد' }, { status: 500 });
    }
}

// DELETE: حذف مورّد أُضيف بالخطأ (فحص 2026-09-17، فجوة G5).
//
// كان المسار PATCH فقط، فمورّد أُنشئ بخطأ إملائي أو تجربةً يبقى في القائمة
// إلى الأبد — والإيقاف (isActive: false) يُخفيه من الاختيار لكنه يبقى في
// القائمة وفي أي تجميع.
//
// الحذف مشروط بألّا يكون للمورّد **أي** تاريخ: لا فاتورة شراء ولا دفعة سداد.
// وجود أيٍّ منهما يعني أن الحذف سيقطع سند فاتورة قائمة، فيُرفض ويُوجَّه
// المستخدم إلى الإيقاف — وهو السلوك الصحيح لمورّد حقيقي توقّف التعامل معه.
//
// onDelete على WarehousePurchase.supplier ليس Cascade (علاقة إلزامية بلا
// حذف متتالٍ)، فحذف مورّد له فواتير يفشل في قاعدة البيانات أصلاً — الفحص
// هنا يحوّل ذلك الفشل الغامض إلى رسالة عربية تقول ماذا يفعل المستخدم.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canCreatePurchase');
        if (!gate.ok) return gate.response;

        // warehouseId في الشرط يمنع حذف مورّد مذخر آخر بتخمين المعرّف.
        const supplier = await prisma.warehouseSupplier.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true, name: true },
        });
        if (!supplier) {
            return NextResponse.json({ error: 'المورّد غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        const [purchaseCount, paymentCount] = await Promise.all([
            prisma.warehousePurchase.count({ where: { supplierId: supplier.id } }),
            // الدفعة مرتبطة بفاتورة لا بمورّد مباشرةً، فتُعدّ عبر العلاقة.
            prisma.warehouseSupplierPayment.count({
                where: { purchase: { supplierId: supplier.id } },
            }),
        ]);

        if (purchaseCount > 0 || paymentCount > 0) {
            return NextResponse.json(
                {
                    error:
                        `لا يمكن حذف «${supplier.name}»: مرتبط بـ${purchaseCount} فاتورة شراء ` +
                        `و${paymentCount} دفعة سداد. أوقفه بدل حذفه كي يبقى سند فواتيره سليماً.`,
                    code: 'SUPPLIER_HAS_HISTORY',
                },
                { status: 409 }
            );
        }

        await prisma.warehouseSupplier.delete({ where: { id: supplier.id } });

        return NextResponse.json({ success: true, deletedId: supplier.id });
    } catch (e: any) {
        console.error('warehouse-portal supplier DELETE error:', e);
        return NextResponse.json({ error: 'فشل في حذف المورّد' }, { status: 500 });
    }
}
