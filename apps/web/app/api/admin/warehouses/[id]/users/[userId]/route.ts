export const dynamic = 'force-dynamic';

// Feature 3 من الميزات الثلاث الأخيرة لنظام المذاخر (B2B): حظر دخول حساب
// مذخر من لوحة إدارة المنصة (SUPER_ADMIN) عبر User.isActive.
//
// Warehouse.isActive (مبني مسبقاً) يخفي المذخر عن دليل الصيدليات فقط ولا يمنع
// أحداً من تسجيل الدخول؛ User.isActive هو الحقل الذي يتحقق منه auth.ts فعلياً
// عند تسجيل الدخول (يرفض الدخول إن كان false، قبل حتى مقارنة كلمة المرور —
// فإعادة تعيين كلمة المرور لا تُعيد الوصول لحساب موقوف).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { canCreateWarehouse } from '@/app/lib/warehouse-access';
import { decideDeactivateUser } from '@/app/lib/warehouse-users';

export async function PATCH(
    req: NextRequest,
    props: { params: Promise<{ id: string; userId: string }> }
) {
    const params = await props.params;
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!canCreateWarehouse(session.user.role)) {
            return NextResponse.json({
                error: 'تغيير حالة حسابات المذاخر متاح لإدارة المنصة فقط.',
                code: 'SUPER_ADMIN_ONLY',
            }, { status: 403 });
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.isActive !== 'boolean') {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        // حرِج: التحقق أن userId ينتمي فعلاً لهذا المذخر تحديداً (params.id)
        // قبل أي تحديث — نفس نمط app/api/admin/warehouses/[id]/reset-password.
        const target = await prisma.user.findFirst({
            where: { id: params.userId, warehouseId: params.id },
            select: { id: true, isActive: true, warehouseUserType: true },
        });
        if (!target) {
            return NextResponse.json({ error: 'المستخدم غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        // نفس حارس القفل الأخير المستخدم في Feature 1 (بوابة المذخر) — يمنع
        // إيقاف آخر مالك فعّال في المذخر (سواء أوقفه SUPER_ADMIN هنا أو المالك
        // نفسه من البوابة).
        if (body.isActive === false) {
            let activeOwnerCount = 0;
            if (target.warehouseUserType === 'OWNER' && target.isActive) {
                activeOwnerCount = await prisma.user.count({
                    where: { warehouseId: params.id, warehouseUserType: 'OWNER', isActive: true },
                });
            }
            const decision = decideDeactivateUser({
                targetIsOwner: target.warehouseUserType === 'OWNER',
                targetIsActive: target.isActive,
                activeOwnerCount,
            });
            if (!decision.ok) {
                return NextResponse.json({ error: decision.error }, { status: 400 });
            }
        }

        const updated = await prisma.user.update({
            where: { id: target.id },
            data: { isActive: body.isActive },
            select: { id: true, email: true, warehouseUserType: true, isActive: true },
        });

        return NextResponse.json({ user: updated });
    } catch (e: any) {
        console.error('admin warehouse user PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تحديث حالة المستخدم' }, { status: 500 });
    }
}
