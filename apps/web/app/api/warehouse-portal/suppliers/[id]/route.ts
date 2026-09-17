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
