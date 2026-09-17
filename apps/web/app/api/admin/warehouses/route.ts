export const dynamic = 'force-dynamic';

// Pass 3, Part A من ميزة المذاخر: شاشة تأسيس المذخر لإدارة المنصة (SUPER_ADMIN).
// منفصل عمداً عن POST /api/warehouses (الذي يبقى بعقده الحالي دون تغيير) لأن
// هذا المسار ينشئ صفّين معاً — المذخر وحساب مالكه — داخل معاملة واحدة، إذ لا
// فائدة من مذخر بلا مستخدم مرتبط به.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';
import { canCreateWarehouse } from '@/app/lib/warehouse-access';
import { validateWarehouseOnboarding } from '@/app/lib/warehouse-onboarding';

// GET: قائمة كل المذاخر لواجهة تأسيس المذخر (تحتاج عدّادات لا يحتاجها
// GET /api/warehouses العام: عدد الحسابات المرتبطة وعدد أصناف الكتالوج).
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!canCreateWarehouse(session.user.role)) {
            return NextResponse.json({
                error: 'هذه الصفحة متاحة لإدارة المنصة فقط.',
                code: 'SUPER_ADMIN_ONLY',
            }, { status: 403 });
        }

        // select صريح — لا include: الأخير يُرجع كل حقول Warehouse القياسية إلى
        // المتصفح، ومنها apiKey/apiEndpoint. حتى لو كان المسار محصوراً بـ
        // SUPER_ADMIN، لا داعي لإرسال مفاتيح اعتماد في حمولة JSON لصفحة ويب.
        const warehouses = await prisma.warehouse.findMany({
            select: {
                id: true,
                name: true,
                code: true,
                phone: true,
                city: true,
                address: true,
                contactPerson: true,
                isActive: true,
                _count: { select: { catalogItems: true, users: true } },
                // للعمود الجديد «البريد الإلكتروني» في جدول لوحة التحكم: يحتاج
                // المشغّل معرفة أي حساب دخول يخصّ أي مذخر لتسليم/استرجاع بيانات
                // الدخول. لا نستخدم Warehouse.email (حقل غير مُستخدم فعلياً —
                // النموذج لا يعرض له إدخالاً أصلاً).
                // isActive: يحتاجها Feature 3 (حظر الدخول من لوحة الإدارة) لعرض
                // حالة كل حساب وإتاحة توقيف/تفعيل من واجهة هذه الصفحة.
                users: { select: { id: true, email: true, warehouseUserType: true, isActive: true }, orderBy: { createdAt: 'asc' } },
            },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json({ warehouses });
    } catch (e: any) {
        console.error('admin warehouses GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب قائمة المذاخر' }, { status: 500 });
    }
}

// POST: تأسيس مذخر جديد + حساب مالكه معاً داخل معاملة واحدة.
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!canCreateWarehouse(session.user.role)) {
            return NextResponse.json({
                error: 'إنشاء المذاخر متاح لإدارة المنصة فقط.',
                code: 'SUPER_ADMIN_ONLY',
            }, { status: 403 });
        }

        const body = await req.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const validated = validateWarehouseOnboarding(body);
        if (!validated.ok) {
            return NextResponse.json({ error: validated.errors[0], errors: validated.errors }, { status: 400 });
        }
        const { warehouse, owner } = validated.value;

        // البريد الإلكتروني فريد عبر User.email — تحقق مسبق لإرجاع 409 ودّي
        // بدل ترك P2002 الخام يظهر كـ 500 (نفس نمط app/api/admin/provision-tenant).
        const existingUser = await prisma.user.findUnique({
            where: { email: owner.email },
            select: { id: true },
        });
        if (existingUser) {
            return NextResponse.json({ error: 'البريد الإلكتروني مستخدم بالفعل.' }, { status: 409 });
        }

        // كود المذخر فريد عبر المنصة بالكامل (اختياري) — نفس منطق التحقق المسبق.
        if (warehouse.code) {
            const existingCode = await prisma.warehouse.findUnique({
                where: { code: warehouse.code },
                select: { id: true },
            });
            if (existingCode) {
                return NextResponse.json({ error: 'كود المذخر مستخدم بالفعل.' }, { status: 409 });
            }
        }

        const hashedPassword = await bcrypt.hash(owner.password, 10);

        const result = await prisma.$transaction(async (tx) => {
            const createdWarehouse = await tx.warehouse.create({ data: warehouse });

            const ownerUser = await tx.user.create({
                data: {
                    email: owner.email,
                    name: owner.name ?? createdWarehouse.name,
                    password: hashedPassword,
                    role: 'WAREHOUSE',
                    warehouseId: createdWarehouse.id,
                    warehouseUserType: 'OWNER',
                    // حرِج: حساب مذخر يجب ألا يملك فرعاً أبداً، وإلا ينكسر عزل
                    // المستأجرين (warehouseOrderScope في warehouse-access.ts يرفض
                    // WAREHOUSE بشكل غير مشروط، لكن الحقل نفسه يجب أن يبقى فارغاً).
                    branchId: null,
                },
            });

            return {
                warehouse: createdWarehouse,
                owner: { id: ownerUser.id, email: ownerUser.email, name: ownerUser.name },
            };
        });

        return NextResponse.json({ warehouse: result.warehouse, owner: result.owner }, { status: 201 });
    } catch (e: any) {
        // سباق على البريد الإلكتروني أو كود المذخر بين التحقق المسبق والإنشاء.
        if (e?.code === 'P2002') {
            return NextResponse.json({ error: 'البريد الإلكتروني أو كود المذخر مستخدم بالفعل.' }, { status: 409 });
        }
        console.error('warehouse onboarding error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء المذخر' }, { status: 500 });
    }
}
