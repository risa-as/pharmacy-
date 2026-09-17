export const dynamic = 'force-dynamic';

// المرحلة 5 (الصقل التجاري) §Part 5: تعديل الملف التجاري للمذخر — الحقول
// التي كانت موجودة أصلاً على Warehouse (name, phone, city, address,
// contactPerson, email, notes) لكن بلا أي مسار بوابة يعدّلها. warehouseId
// يأتي من السياق حصراً — لا يُقبَل من الجسم إطلاقاً. يتطلب canChangeSettings.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

const EDITABLE_STRING_FIELDS = ['name', 'phone', 'address', 'city', 'contactPerson', 'email', 'notes'] as const;

export async function PATCH(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canChangeSettings');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const data: Record<string, string | null> = {};
        for (const field of EDITABLE_STRING_FIELDS) {
            if (!(field in body)) continue;
            const value = body[field];
            if (value !== null && typeof value !== 'string') {
                return NextResponse.json({ error: `الحقل ${field} غير صالح` }, { status: 400 });
            }
            data[field] = value === null ? null : value.trim() || null;
        }

        // name لا يجوز أن يصبح فارغاً — كل الحقول الأخرى تقبل null (اختيارية أصلاً).
        if ('name' in data && !data.name) {
            return NextResponse.json({ error: 'اسم المذخر مطلوب ولا يمكن أن يكون فارغاً.' }, { status: 400 });
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'لا توجد حقول صالحة للتحديث' }, { status: 400 });
        }

        const warehouse = await prisma.warehouse.update({ where: { id: ctx.warehouseId }, data });

        return NextResponse.json({ warehouse });
    } catch (e: any) {
        console.error('warehouse-portal profile PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تحديث بيانات المذخر' }, { status: 500 });
    }
}
