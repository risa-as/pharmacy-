export const dynamic = 'force-dynamic';

// Feature 1 من الميزات الثلاث الأخيرة لنظام المذاخر (B2B): حسابات موظفين
// يديرها مالك المذخر (OWNER) أو أي حساب يملك صلاحية canManageUsers (Phase 3:
// الأدوار والصلاحيات). حالياً كل مذخر يملك تسجيل دخول واحداً فقط، فإن أراد
// صاحب المذخر تفويض موظف يضطر لمشاركة كلمة مروره الخاصة — هذا المسار يسمح
// بإنشاء/سرد/تعديل حسابات تابعة لمذخره فقط.
//
// Phase 3: قبل هذه المرحلة كان كل موظف STAFF واحداً بلا تمايز — الآن لكل
// حساب دور من خمسة (OWNER/MANAGER/SALES/INVENTORY/ACCOUNTANT، أو STAFF قديم
// معطَّل الإسناد الجديد) + تخصيصات صلاحيات فردية اختيارية فوق افتراضيات
// الدور، محفوظة في نفس عمود User.permissions المستخدَم أصلاً في جانب
// الصيدلية (JSON نصي).
//
// أمان حرِج (هذا هو صلب الميزة):
//   - warehouseId يأتي حصراً من getWarehouseContext() — لا يُقرأ أبداً من
//     الجسم/الاستعلام/المعاملات. مذخر لا يستطيع أبداً إنشاء أو تعديل مستخدم
//     في مذخر آخر.
//   - الحساب الجديد يُجبر دائماً على role: 'WAREHOUSE'، branchId: null،
//     warehouseId: <من السياق>. warehouseUserType يُقبَل من الجسم لكن يُمرَّر
//     عبر validateWarehouseUserType() أولاً (خمسة أدوار مسموحة فقط، ليس
//     STAFF) — buildStaffUserData() لا تملك حتى مساراً برمجياً يقرأ role/
//     branchId/warehouseId من input.
//   - requireWarehousePermission() يستعلم عن الفاعل من قاعدة البيانات مباشرة
//     (وليس من الجلسة — warehouseUserType/permissions ليسا فيها، انظر
//     warehouse-context.ts)، فتخفيض صلاحية حساب أو إيقافه ينفذ فوراً بدل
//     انتظار انتهاء صلاحية الجلسة.
//   - حارس القفل (decideDeactivateUser/decideOwnerRoleChange): لا يمكن إيقاف
//     أو تغيير دور آخر مالك فعّال في المذخر بعيداً عن OWNER — بما في ذلك
//     مالك يغيّر دوره الخاص.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import {
    validateStaffUserInput,
    buildStaffUserData,
    decideDeactivateUser,
    decideOwnerRoleChange,
    validateWarehouseUserType,
    type AssignableWarehouseUserType,
} from '@/app/lib/warehouse-users';

const USER_SELECT = {
    id: true,
    email: true,
    name: true,
    warehouseUserType: true,
    permissions: true,
    isActive: true,
    createdAt: true,
} as const;

async function countActiveOwners(warehouseId: string) {
    return prisma.user.count({ where: { warehouseId, warehouseUserType: 'OWNER', isActive: true } });
}

// GET: قائمة مستخدمي مذخر الفاعل — لمن يملك صلاحية canManageUsers فقط.
export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canManageUsers');
        if (!gate.ok) return gate.response;

        const users = await prisma.user.findMany({
            where: { warehouseId: ctx.warehouseId },
            select: USER_SELECT,
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json({ users });
    } catch (e: any) {
        console.error('warehouse-portal users GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب قائمة المستخدمين' }, { status: 500 });
    }
}

// POST: إنشاء حساب جديد تابع لمذخر الفاعل — { email, password, name?, warehouseUserType? }.
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canManageUsers');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        // الدور: افتراضي SALES إن لم يُرسَل — لا يُقبَل STAFF كإسناد جديد
        // (دور قديم/deprecated، انظر تعليق enum WarehouseUserType في schema.prisma).
        const roleResult = validateWarehouseUserType(body.warehouseUserType ?? 'SALES');
        if (!roleResult.ok) {
            return NextResponse.json({ error: roleResult.error }, { status: 400 });
        }

        // validateStaffUserInput لا تقرأ سوى email/password/name من body — أي
        // role/branchId/warehouseId/warehouseUserType مُرسَل هنا يُتجاهل بنيوياً.
        const validated = validateStaffUserInput(body);
        if (!validated.ok) {
            return NextResponse.json({ error: validated.errors[0], errors: validated.errors }, { status: 400 });
        }

        // تحقق مسبق من تفرّد البريد الإلكتروني — لإرجاع 409 ودّي بدل ترك
        // P2002 الخام يظهر كـ 500 (نفس نمط app/api/admin/warehouses).
        const existing = await prisma.user.findUnique({
            where: { email: validated.value.email },
            select: { id: true },
        });
        if (existing) {
            return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل.' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(validated.value.password, 10);

        // warehouseId يأتي من ctx حصراً — انظر تعليق أعلى الملف.
        const data = buildStaffUserData(ctx.warehouseId, roleResult.value, {
            email: validated.value.email,
            hashedPassword,
            ...(validated.value.name !== undefined && { name: validated.value.name }),
        });

        const created = await prisma.user.create({
            data,
            select: USER_SELECT,
        });

        return NextResponse.json({ user: created }, { status: 201 });
    } catch (e: any) {
        if (e?.code === 'P2002') {
            return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل.' }, { status: 409 });
        }
        console.error('warehouse-portal users POST error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء المستخدم' }, { status: 500 });
    }
}

// PATCH: تعديل مستخدم تابع لمذخر الفاعل — { userId, isActive?, warehouseUserType?, permissions? }.
export async function PATCH(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canManageUsers');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.userId !== 'string' || !body.userId) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const hasIsActive = 'isActive' in body;
        const hasRole = 'warehouseUserType' in body;
        const hasPermissions = 'permissions' in body;

        if (!hasIsActive && !hasRole && !hasPermissions) {
            return NextResponse.json({ error: 'لا توجد حقول للتعديل' }, { status: 400 });
        }

        if (hasIsActive && typeof body.isActive !== 'boolean') {
            return NextResponse.json({ error: 'isActive يجب أن يكون منطقياً' }, { status: 400 });
        }

        let newRole: AssignableWarehouseUserType | undefined;
        if (hasRole) {
            const roleResult = validateWarehouseUserType(body.warehouseUserType);
            if (!roleResult.ok) {
                return NextResponse.json({ error: roleResult.error }, { status: 400 });
            }
            newRole = roleResult.value;
        }

        // الصلاحيات الفردية: null يمسح التخصيص (يعود للافتراضي حسب الدور)،
        // نص JSON صالح لكائن (وليس مصفوفة/بدائي) يُحفَظ كما هو — نفس نمط
        // PATCH /api/users/[id] في جانب الصيدلية. لا تحقق من محتوى المفاتيح
        // هنا: getWarehousePermissions() في وقت القراءة تتجاهل أي مفتاح غير
        // معروف أو قيمة غير منطقية بصمت (قائمة بيضاء)، فلا حاجة لتكرار ذلك
        // التحقق عند الكتابة.
        let newPermissions: string | null | undefined;
        if (hasPermissions) {
            if (body.permissions === null) {
                newPermissions = null;
            } else if (typeof body.permissions === 'string') {
                try {
                    const parsed = JSON.parse(body.permissions);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        throw new Error('shape');
                    }
                } catch {
                    return NextResponse.json({ error: 'صيغة الصلاحيات غير صالحة' }, { status: 400 });
                }
                newPermissions = body.permissions;
            } else {
                return NextResponse.json({ error: 'صيغة الصلاحيات غير صالحة' }, { status: 400 });
            }
        }

        // حرِج: التحقق أن المستخدم الهدف ينتمي فعلاً لمذخر الفاعل تحديداً —
        // يمنع مذخراً من تعديل مستخدم في مذخر آخر.
        const target = await prisma.user.findFirst({
            where: { id: body.userId, warehouseId: ctx.warehouseId },
            select: { id: true, isActive: true, warehouseUserType: true },
        });
        if (!target) {
            return NextResponse.json({ error: 'المستخدم غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        // حارس القفل (نفس فئة الحماية لكلا الانتقالين: إيقاف الحساب، أو تغيير
        // دوره بعيداً عن OWNER) — يُحسَب عدد الملاك الفعّالين مرة واحدة فقط
        // إن كان الهدف حالياً مالكاً فعّالاً وأحد الانتقالين المطلوبين يزيله
        // من تلك الحالة.
        const targetIsCurrentlyActiveOwner = target.warehouseUserType === 'OWNER' && target.isActive;
        const removesActiveOwnerStatus =
            targetIsCurrentlyActiveOwner &&
            ((hasIsActive && body.isActive === false) || (hasRole && newRole !== 'OWNER'));

        const activeOwnerCount = removesActiveOwnerStatus ? await countActiveOwners(ctx.warehouseId) : 0;

        if (hasIsActive && body.isActive === false) {
            const decision = decideDeactivateUser({
                targetIsOwner: target.warehouseUserType === 'OWNER',
                targetIsActive: target.isActive,
                activeOwnerCount,
            });
            if (!decision.ok) {
                return NextResponse.json({ error: decision.error }, { status: 400 });
            }
        }

        if (hasRole && targetIsCurrentlyActiveOwner && newRole !== 'OWNER') {
            const decision = decideOwnerRoleChange({
                targetIsOwner: true,
                targetIsActive: true,
                activeOwnerCount,
            });
            if (!decision.ok) {
                return NextResponse.json({ error: decision.error }, { status: 400 });
            }
        }

        const data: { isActive?: boolean; warehouseUserType?: AssignableWarehouseUserType; permissions?: string | null } = {};
        if (hasIsActive) data.isActive = body.isActive;
        if (hasRole) data.warehouseUserType = newRole;
        if (hasPermissions) data.permissions = newPermissions ?? null;

        const updated = await prisma.user.update({
            where: { id: target.id },
            data,
            select: USER_SELECT,
        });

        return NextResponse.json({ user: updated });
    } catch (e: any) {
        console.error('warehouse-portal users PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تحديث المستخدم' }, { status: 500 });
    }
}
