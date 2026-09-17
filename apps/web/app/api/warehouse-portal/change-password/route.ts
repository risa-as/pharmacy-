export const dynamic = 'force-dynamic';

// Feature 2 من الميزات الثلاث الأخيرة لنظام المذاخر (B2B): تغيير كلمة المرور
// الذاتي لحسابات المذاخر. app/api/auth/change-password/route.ts يستخدم
// getTenantContext() الذي يرفض دور WAREHOUSE صراحة، فهذا المسار غير قابل
// للوصول إطلاقاً لحساب مذخر — هذا مسار مواز مبني على getWarehouseContext().
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { enforceRateLimit } from '@/app/lib/rate-limit';
import { validatePasswordChange } from '@/app/lib/warehouse-users';

export async function POST(req: NextRequest) {
    const limited = await enforceRateLimit(req, 'warehouse-change-password', 10, 60_000);
    if (limited) return limited;

    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        // تحقق شكلي بحت (طول كلمة المرور الجديدة + أنها تختلف عن الحالية) —
        // لا يتحقق بعد من صحة كلمة المرور الحالية فعلياً؛ ذلك يتطلب bcrypt
        // مقابل الهاش المحفوظ ويحدث أدناه.
        const validated = validatePasswordChange(body);
        if (!validated.ok) {
            return NextResponse.json({ error: validated.errors[0], errors: validated.errors }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: ctx.user.id },
            select: { id: true, password: true },
        });
        if (!user) {
            return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
        }

        // حرِج: جلسة مسجّلة وحدها لا تكفي لتغيير كلمة المرور — يجب التحقق من
        // كلمة المرور الحالية أولاً.
        const isValid = await bcrypt.compare(validated.value.currentPassword, user.password);
        if (!isValid) {
            return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 401 });
        }

        const hashedPassword = await bcrypt.hash(validated.value.newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });

        // لا تُعاد كلمة المرور في الاستجابة أبداً.
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('warehouse-portal change-password error:', e);
        return NextResponse.json({ error: 'فشل في تغيير كلمة المرور' }, { status: 500 });
    }
}
