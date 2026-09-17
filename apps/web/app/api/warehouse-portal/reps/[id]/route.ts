export const dynamic = 'force-dynamic';

// المندوبون (مذاخر B2B): تفاصيل مندوب واحد (بضاعة سيارته + مبيعاته الميدانية
// + تحصيلاته) وتعديل بياناته. GET يتطلب canViewReps، PATCH يتطلب canManageReps.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import type { CommissionBasisValue } from '@/app/lib/warehouse-reps';

const COMMISSION_BASES: CommissionBasisValue[] = ['SALES', 'PROFIT', 'COLLECTION'];

// GET: تفاصيل مندوب — بضاعة سيارته الحالية، مبيعاته الميدانية، وتحصيلاته.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canViewReps');
        if (!gate.ok) return gate.response;

        const rep = await prisma.warehouseRep.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
        });
        if (!rep) {
            return NextResponse.json({ error: 'المندوب غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        const [stock, sales, collections] = await Promise.all([
            prisma.warehouseRepStock.findMany({
                where: { repId: rep.id, quantity: { gt: 0 } },
                include: {
                    batch: {
                        select: {
                            batchNumber: true,
                            expiryDate: true,
                            costPrice: true,
                            catalogItem: { select: { barcode: true, drug: { select: { tradeName: true } } } },
                        },
                    },
                },
                orderBy: { batch: { expiryDate: 'asc' } },
            }),
            prisma.warehouseFieldSale.findMany({
                where: { repId: rep.id },
                orderBy: { soldAt: 'desc' },
                include: { items: true },
            }),
            prisma.warehouseRepCollection.findMany({
                where: { repId: rep.id },
                orderBy: { collectedAt: 'desc' },
            }),
        ]);

        return NextResponse.json({
            rep,
            stock: stock.map((s) => ({
                batchId: s.batchId,
                quantity: s.quantity,
                batchNumber: s.batch.batchNumber,
                expiryDate: s.batch.expiryDate,
                costPrice: s.batch.costPrice,
                barcode: s.batch.catalogItem.barcode,
                tradeName: s.batch.catalogItem.drug.tradeName,
            })),
            fieldSales: sales,
            collections,
        });
    } catch (e: any) {
        console.error('warehouse-portal rep detail GET error:', e);
        return NextResponse.json({ error: 'فشل في جلب تفاصيل المندوب' }, { status: 500 });
    }
}

// PATCH: تعديل بيانات مندوب — { name?, phone?, commissionBasis?, commissionRate?, isActive?, userId? }
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canManageReps');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const existing = await prisma.warehouseRep.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'المندوب غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        const data: {
            name?: string;
            phone?: string | null;
            commissionBasis?: CommissionBasisValue;
            commissionRate?: number;
            isActive?: boolean;
            userId?: string | null;
        } = {};

        if ('name' in body) {
            const v = typeof body.name === 'string' ? body.name.trim() : '';
            if (!v) return NextResponse.json({ error: 'اسم المندوب مطلوب' }, { status: 400 });
            data.name = v;
        }

        if ('phone' in body) {
            if (body.phone !== null && typeof body.phone !== 'string') {
                return NextResponse.json({ error: 'رقم الهاتف غير صالح.' }, { status: 400 });
            }
            data.phone = body.phone === null ? null : body.phone.trim() || null;
        }

        if ('commissionBasis' in body) {
            if (!COMMISSION_BASES.includes(body.commissionBasis)) {
                return NextResponse.json(
                    { error: 'نمط العمولة يجب أن يكون أحد: SALES أو PROFIT أو COLLECTION.' },
                    { status: 400 }
                );
            }
            data.commissionBasis = body.commissionBasis;
        }

        if ('commissionRate' in body) {
            const v = Number(body.commissionRate);
            if (!Number.isFinite(v) || v < 0) {
                return NextResponse.json({ error: 'نسبة العمولة يجب أن تكون رقماً غير سالب.' }, { status: 400 });
            }
            data.commissionRate = v;
        }

        if ('isActive' in body) {
            if (typeof body.isActive !== 'boolean') {
                return NextResponse.json({ error: 'قيمة التفعيل يجب أن تكون true/false.' }, { status: 400 });
            }
            data.isActive = body.isActive;
        }

        if ('userId' in body) {
            if (body.userId === null) {
                data.userId = null;
            } else if (typeof body.userId === 'string' && body.userId) {
                const user = await prisma.user.findFirst({
                    where: { id: body.userId, warehouseId: ctx.warehouseId },
                    select: { id: true },
                });
                if (!user) {
                    return NextResponse.json({ error: 'حساب الدخول غير موجود ضمن هذا المذخر.' }, { status: 404 });
                }
                data.userId = user.id;
            } else {
                return NextResponse.json({ error: 'معرّف حساب الدخول غير صالح.' }, { status: 400 });
            }
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'لا توجد حقول صالحة للتحديث' }, { status: 400 });
        }

        const updated = await prisma.warehouseRep.update({ where: { id: existing.id }, data });

        return NextResponse.json({ rep: updated });
    } catch (e: any) {
        if (e?.code === 'P2002') {
            return NextResponse.json(
                { error: 'حساب الدخول هذا مرتبط بمندوب آخر بالفعل — كل حساب دخول يخدم مندوباً واحداً فقط.' },
                { status: 409 }
            );
        }
        console.error('warehouse-portal rep PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تحديث بيانات المندوب' }, { status: 500 });
    }
}
