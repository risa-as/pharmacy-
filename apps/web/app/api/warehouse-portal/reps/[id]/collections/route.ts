export const dynamic = 'force-dynamic';

// المندوبون (مذاخر B2B): تسجيل تحصيل نقدي من مندوب. إن حُدِّد fieldSaleId
// يُطبَّق المبلغ على تلك الفاتورة الميدانية تحديداً عبر applyPayment/
// computeInvoiceStatus من app/lib/warehouse-accounts.ts حرفياً — نفس الدالتين
// المستخدَمتين في POST /api/warehouse-portal/invoices/[id]/payments، بنفس
// compare-and-swap على paidAmount كما قُرئ (لا نسخة موازية لهذا المنطق هنا).
// وإلا فهو تحصيل غير مخصَّص لفاتورة بعينها (دفعة على الحساب العام للمندوب).
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canSellField.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { applyPayment } from '@/app/lib/warehouse-accounts';

/** يُرمى عند تغيّر paidAmount بين القراءة والكتابة (تحصيل/دفعة متزامنة أخرى على نفس الفاتورة الميدانية). */
class ConcurrentFieldSalePaymentError extends Error {}

// POST: تسجيل تحصيل — { amount, fieldSaleId?, notes? }
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canSellField');
        if (!gate.ok) return gate.response;

        const rep = await prisma.warehouseRep.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true },
        });
        if (!rep) {
            return NextResponse.json({ error: 'المندوب غير موجود ضمن هذا المذخر' }, { status: 404 });
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ error: 'مبلغ التحصيل يجب أن يكون رقماً موجباً صالحاً.' }, { status: 400 });
        }

        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
        const fieldSaleId = typeof body.fieldSaleId === 'string' && body.fieldSaleId ? body.fieldSaleId : null;

        // ── تحصيل غير مخصَّص لفاتورة بعينها ──────────────────────────────────
        if (!fieldSaleId) {
            const collection = await prisma.warehouseRepCollection.create({
                data: { repId: rep.id, warehouseId: ctx.warehouseId, fieldSaleId: null, amount, notes },
            });
            return NextResponse.json({ collection }, { status: 201 });
        }

        // ── تحصيل مُطبَّق على فاتورة ميدانية محدَّدة ──────────────────────────
        // ملكية الفاتورة: يجب أن تنتمي لهذا المندوب ولهذا المذخر حصراً.
        const sale = await prisma.warehouseFieldSale.findFirst({
            where: { id: fieldSaleId, repId: rep.id, warehouseId: ctx.warehouseId },
            select: { id: true, total: true, paidAmount: true, status: true },
        });
        if (!sale) {
            return NextResponse.json({ error: 'الفاتورة الميدانية غير موجودة ضمن مبيعات هذا المندوب' }, { status: 404 });
        }
        if (sale.status === 'CANCELLED') {
            return NextResponse.json({ error: 'لا يمكن تسجيل تحصيل على فاتورة ميدانية مُلغاة.' }, { status: 400 });
        }

        const result = applyPayment({ total: sale.total, paidAmount: sale.paidAmount, payment: amount });
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const updated = await prisma.$transaction(async (tx) => {
            // الحارس: تحديث مشروط بـ paidAmount كما قُرئ أعلاه بالضبط — نفس
            // انضباط POST /api/warehouse-portal/invoices/[id]/payments حرفياً.
            const applied = await tx.warehouseFieldSale.updateMany({
                where: { id: sale.id, paidAmount: sale.paidAmount },
                data: { paidAmount: result.newPaid, status: result.newStatus },
            });
            if (applied.count !== 1) {
                throw new ConcurrentFieldSalePaymentError(
                    'تغيّر رصيد الفاتورة الميدانية أثناء المعالجة (تحصيل متزامن آخر) — أعد المحاولة.'
                );
            }

            const collection = await tx.warehouseRepCollection.create({
                data: { repId: rep.id, warehouseId: ctx.warehouseId, fieldSaleId: sale.id, amount, notes },
            });

            const freshSale = await tx.warehouseFieldSale.findUniqueOrThrow({ where: { id: sale.id } });

            return { fieldSale: freshSale, collection };
        });

        return NextResponse.json(updated, { status: 201 });
    } catch (e: any) {
        if (e instanceof ConcurrentFieldSalePaymentError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal rep collections POST error:', e);
        return NextResponse.json({ error: 'فشل في تسجيل التحصيل' }, { status: 500 });
    }
}
