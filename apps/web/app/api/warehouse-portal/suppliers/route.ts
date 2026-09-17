export const dynamic = 'force-dynamic';

// مشتريات المذخر وذممه الدائنة: الشركات الدوائية التي يشتري منها المذخر —
// معادل WarehouseCustomer بالاتجاه المعاكس (المورّد بدل الصيدلية). لا صلاحية
// مستقلة لإدارة الموردين في مواصفة هذه المهمة، فتُستخدَم canCreatePurchase
// نفسها لإنشاء/تعديل المورّد — قرار متعمَّد: إدارة الموردين جزء لا يتجزّأ من
// سير عمل تسجيل المشتريات (نفس من يستلم البضاعة وينشئ فاتورة الشراء هو من
// يضيف المورّد أصلاً)، وcanCreatePurchase محصورة أصلاً بـ OWNER/MANAGER/
// INVENTORY — نفس من يُفترض أن يدير قائمة الموردين.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

// GET: قائمة موردي مذخر الفاعل.
export async function GET() {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewPurchases');
        if (!gate.ok) return gate.response;

        const suppliers = await prisma.warehouseSupplier.findMany({
            where: { warehouseId: ctx.warehouseId },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ suppliers });
    } catch (e: any) {
        console.error('warehouse-portal suppliers GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب قائمة الموردين' }, { status: 500 });
    }
}

// POST: إضافة مورّد جديد — { name, phone?, contactPerson?, notes? }
export async function POST(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canCreatePurchase');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
            return NextResponse.json({ error: 'اسم المورّد مطلوب' }, { status: 400 });
        }

        const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
        const contactPerson = typeof body.contactPerson === 'string' ? body.contactPerson.trim() || null : null;
        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

        const supplier = await prisma.warehouseSupplier.create({
            data: { warehouseId: ctx.warehouseId, name, phone, contactPerson, notes },
        });

        return NextResponse.json({ supplier }, { status: 201 });
    } catch (e: any) {
        // @@unique([warehouseId, name]) — مورّد بنفس الاسم موجود بالفعل لدى هذا المذخر.
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'يوجد بالفعل مورّد بهذا الاسم لدى مذخرك.' },
                { status: 409 }
            );
        }
        console.error('warehouse-portal suppliers POST error:', e);
        return NextResponse.json({ error: 'فشل في إنشاء المورّد' }, { status: 500 });
    }
}
