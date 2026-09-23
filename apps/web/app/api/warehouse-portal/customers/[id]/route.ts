export const dynamic = 'force-dynamic';

// Phase 2 (الحسابات والعملاء) من نظام المذاخر B2B: تعديل شروط التعامل التجاري
// مع صيدلية — حدّ الائتمان، مهلة السداد، شريحة التسعير، والحظر.
// Phase 3 (الأدوار والصلاحيات): يتطلب canEditCustomerTerms.
import { NextRequest, NextResponse } from 'next/server';
import { WarehouseOperationError } from '@/app/lib/warehouse-operation';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

// PATCH: تحديث شروط عميل — { creditLimit?, paymentTermDays?, priceTier?, isBlocked?, notes? }
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canEditCustomerTerms');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        // ملكية الصف: يجب أن ينتمي لمذخر الفاعل حصراً — مذخر لا يعدّل شروط عميل مذخر آخر.
        const existing = await prisma.warehouseCustomer.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'العميل غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        const data: {
            creditLimit?: number;
            paymentTermDays?: number;
            openingBalance?: number;
            priceTier?: string | null;
            isBlocked?: boolean;
            notes?: string | null;
        } = {};

        if ('creditLimit' in body) {
            const v = Number(body.creditLimit);
            if (!Number.isFinite(v) || v < 0) {
                return NextResponse.json({ error: 'حدّ الائتمان يجب أن يكون رقماً غير سالب.' }, { status: 400 });
            }
            data.creditLimit = v;
        }

        // رصيد سابق: نفس نمط تحقّق creditLimit — رقم منتهٍ غير سالب. تعديله هنا
        // لا يُعيد حساب أي شيء تلقائياً (لا الفواتير ولا المستحق المعروض سابقاً)؛
        // القيمة الجديدة تدخل حساب "المستحق" من الاستعلام التالي فقط.
        if ('openingBalance' in body) {
            const v = Number(body.openingBalance);
            if (!Number.isFinite(v) || v < 0) {
                return NextResponse.json({ error: 'الرصيد السابق يجب أن يكون رقماً غير سالب.' }, { status: 400 });
            }
            data.openingBalance = v;
        }

        if ('paymentTermDays' in body) {
            const v = Number(body.paymentTermDays);
            if (!Number.isInteger(v) || v < 0) {
                return NextResponse.json({ error: 'مهلة السداد يجب أن تكون عدداً صحيحاً غير سالب.' }, { status: 400 });
            }
            data.paymentTermDays = v;
        }

        if ('priceTier' in body) {
            if (body.priceTier !== null && typeof body.priceTier !== 'string') {
                return NextResponse.json({ error: 'شريحة التسعير غير صالحة.' }, { status: 400 });
            }
            data.priceTier = body.priceTier === null ? null : body.priceTier.trim() || null;
        }

        if ('isBlocked' in body) {
            if (typeof body.isBlocked !== 'boolean') {
                return NextResponse.json({ error: 'قيمة الحظر يجب أن تكون true/false.' }, { status: 400 });
            }
            data.isBlocked = body.isBlocked;
        }

        if ('notes' in body) {
            if (body.notes !== null && typeof body.notes !== 'string') {
                return NextResponse.json({ error: 'الملاحظات غير صالحة.' }, { status: 400 });
            }
            data.notes = body.notes === null ? null : body.notes.trim() || null;
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'لا توجد حقول صالحة للتحديث' }, { status: 400 });
        }

        const updated = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "WarehouseCustomer" WHERE id = ${existing.id} FOR UPDATE`;
            const before = await tx.warehouseCustomer.findUniqueOrThrow({ where: { id: existing.id } });
            if (data.openingBalance !== undefined && data.openingBalance !== before.openingBalance) {
                const payment = await tx.warehouseSettlement.findFirst({ where: { warehouseId: ctx.warehouseId, sourceId: before.id, kind: 'OPENING_PAYMENT' } });
                if (payment) throw new WarehouseOperationError('سُجل سداد على الرصيد الافتتاحي؛ لا يمكن استبداله من تعديل الشروط. استخدم سندات السداد.');
                await tx.auditLog.create({ data: { userId: ctx.user.id, userName: ctx.user.name ?? ctx.user.email ?? ctx.user.id,
                    action: 'OPENING_BALANCE_CHANGED', entity: 'WAREHOUSE_CUSTOMER', entityId: before.id,
                    details: JSON.stringify({ warehouseId: ctx.warehouseId, before: before.openingBalance, after: data.openingBalance }) } });
            }
            return tx.warehouseCustomer.update({ where: { id: existing.id }, data });
        });

        return NextResponse.json({ customer: updated });
    } catch (e: any) {
        if (e instanceof WarehouseOperationError) return NextResponse.json({ error: e.message }, { status: e.status });
        console.error('warehouse-portal customers PATCH error:', e);
        return NextResponse.json({ error: 'فشل في تحديث بيانات العميل' }, { status: 500 });
    }
}
