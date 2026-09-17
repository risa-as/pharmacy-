export const dynamic = 'force-dynamic';

// Task 2 من شاشة تأسيس المذخر لإدارة المنصة (SUPER_ADMIN) — أعلى أولوية:
// حالياً لا توجد أي وسيلة لتغيير أو استرجاع كلمة مرور حساب مذخر. مسار تغيير
// كلمة المرور الذاتي (app/api/auth/change-password/route.ts) يستخدم
// getTenantContext() الذي يرفض دور WAREHOUSE بشكل صريح (لا branchId له،
// وisWarehouseRole يرفضه)، فكلمة مرور منسية لحساب مذخر تعني حساباً غير قابل
// للاستخدام إطلاقاً بلا هذا المسار.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { canCreateWarehouse } from '@/app/lib/warehouse-access';
import { validatePasswordReset } from '@/app/lib/warehouse-onboarding';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!canCreateWarehouse(session.user.role)) {
            return NextResponse.json({
                error: 'إعادة تعيين كلمة المرور متاحة لإدارة المنصة فقط.',
                code: 'SUPER_ADMIN_ONLY',
            }, { status: 403 });
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.userId !== 'string' || !body.userId) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const validated = validatePasswordReset(body);
        if (!validated.ok) {
            return NextResponse.json({ error: validated.errors[0], errors: validated.errors }, { status: 400 });
        }

        // حرِج: التحقق أن userId ينتمي فعلاً لهذا المذخر تحديداً (params.id) قبل
        // أي تحديث. بدون هذا الشرط يستطيع SUPER_ADMIN إعادة تعيين كلمة مرور أي
        // مستخدم على المنصة بتمرير id عشوائي — بما فيه حساب مدير صيدلية — عبر
        // مسار يُفترض أنه مخصص لحسابات المذاخر فقط.
        const target = await prisma.user.findFirst({
            where: { id: body.userId, warehouseId: params.id },
            select: { id: true },
        });
        if (!target) {
            return NextResponse.json({ error: 'المستخدم غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        const hashedPassword = await bcrypt.hash(validated.value.password, 10);
        await prisma.user.update({
            where: { id: target.id },
            data: { password: hashedPassword },
        });

        // لا تُعاد كلمة المرور في الاستجابة أبداً.
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('admin warehouse reset-password error:', e);
        return NextResponse.json({ error: 'فشل في إعادة تعيين كلمة المرور' }, { status: 500 });
    }
}
