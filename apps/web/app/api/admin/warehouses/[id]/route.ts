export const dynamic = 'force-dynamic';

// Tasks 3 & 4 من شاشة تأسيس المذخر لإدارة المنصة (SUPER_ADMIN):
//   - Task 3: تفعيل/تعطيل المذخر (Warehouse.isActive).
//   - Task 4: تعديل بيانات المذخر (الاسم/الهاتف/المدينة/الشخص المسؤول/العنوان).
// معالج واحد لكليهما — الجسم قد يحمل isActive و/أو الحقول القابلة للتعديل معاً.
//
// عمداً لا يلمس User.isActive (حظر الدخول بالكامل — إجراء منفصل غير مغطّى هنا)
// ولا Warehouse.email (حقل غير مُستخدم فعلياً — النموذج لا يعرض له إدخالاً) ولا
// بريد المالك (User.email — تغيير هوية له اعتبارات تفرّد خاصة، خارج نطاق هذه المهمة).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { canCreateWarehouse } from '@/app/lib/warehouse-access';
import { validateWarehouseFields } from '@/app/lib/warehouse-onboarding';

const EDITABLE_FIELD_KEYS = ['name', 'phone', 'city', 'contactPerson', 'address'] as const;
type EditableFieldKey = (typeof EDITABLE_FIELD_KEYS)[number];

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!canCreateWarehouse(session.user.role)) {
            return NextResponse.json({
                error: 'تعديل المذاخر متاح لإدارة المنصة فقط.',
                code: 'SUPER_ADMIN_ONLY',
            }, { status: 403 });
        }

        const existing = await prisma.warehouse.findUnique({
            where: { id: params.id },
            select: { id: true, name: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'المذخر غير موجود' }, { status: 404 });
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const updateData: Record<string, unknown> = {};

        // ---- Task 3: isActive ----
        // التعطيل يخفي المذخر عن دليل الصيدليات فقط (GET /api/warehouses/directory
        // يفلتر isActive: true) فلا تصله طلبات جديدة؛ لا يسجّل خروج المالك ولا
        // يمنع دخوله، والطلبات الجارية تبقى قابلة للتسعير والشحن والتسليم عمداً
        // — انظر التعليق في صفحة الواجهة لنفس المنطق موجّهاً للمشغّل.
        if (typeof body.isActive === 'boolean') {
            updateData.isActive = body.isActive;
        }

        // ---- Task 4: name/phone/city/contactPerson/address ----
        const presentKeys = EDITABLE_FIELD_KEYS.filter((k) => k in body);
        if (presentKeys.length > 0) {
            const validated = validateWarehouseFields({
                // إن لم يُرسل الاسم ضمن هذا الطلب (تعديل جزئي، مثلاً الهاتف فقط)
                // نستخدم الاسم الحالي المحفوظ حتى لا يفشل التحقق زوراً بسبب حقل
                // لم يُقصد المتصل تعديله أصلاً.
                name: 'name' in body ? body.name : existing.name,
                phone: body.phone,
                city: body.city,
                contactPerson: body.contactPerson,
                address: body.address,
            });
            if (!validated.ok) {
                return NextResponse.json({ error: validated.errors[0], errors: validated.errors }, { status: 400 });
            }

            if ('name' in body) {
                updateData.name = validated.value.name;
            }
            // لكل حقل اختياري أُرسل صراحة ضمن الجسم: قيمة مُنقّحة إن وُجدت، وإلا
            // null صراحةً (يمسح الحقل — العامل تعمّد تفريغه في نموذج التعديل).
            // حقل غائب عن الجسم بالكامل يبقى بلا لمس (لا يُدرج في updateData).
            for (const key of EDITABLE_FIELD_KEYS) {
                if (key === 'name') continue;
                if (key in body) {
                    updateData[key] = (validated.value as Record<EditableFieldKey, string | undefined>)[key] ?? null;
                }
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'لا توجد تغييرات لحفظها' }, { status: 400 });
        }

        const updated = await prisma.warehouse.update({
            where: { id: params.id },
            data: updateData,
            include: {
                _count: { select: { catalogItems: true, users: true } },
                users: { select: { id: true, email: true, warehouseUserType: true, isActive: true }, orderBy: { createdAt: 'asc' } },
            },
        });

        return NextResponse.json({ warehouse: updated });
    } catch (e: any) {
        console.error('admin warehouse PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تحديث بيانات المذخر' }, { status: 500 });
    }
}
