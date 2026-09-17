export const dynamic = 'force-dynamic';

// مشتريات المذخر وذممه الدائنة: تسجيل دفعة سداد صادرة من المذخر لمورّد على
// فاتورة شراء — الاتجاه المعاكس تماماً لـ
// POST /api/warehouse-portal/invoices/[id]/payments، والمطابق له حرفياً في
// الانضباط: applyPayment()/computeInvoiceStatus() من warehouse-accounts.ts
// نقيّتان تماماً من اتجاه العلاقة (تُدخِلان فقط {total, paidAmount, payment})
// فتُستخدَمان هنا بلا أي تعديل — لا نسخة موازية للذمم الدائنة. الكتابة
// الفعلية تتم عبر نفس تحديث ذري مشروط (compare-and-swap على paidAmount كما
// قُرئ) كي لا تُطبَّق دفعتان متزامنتان معاً على نفس الرصيد القديم.
//
// Phase 3 (الأدوار والصلاحيات): يتطلب canPaySupplier (OWNER وACCOUNTANT
// فقط افتراضياً — MANAGER مستثنى عمداً، مرآة نفس فصل الواجبات في
// canRecordPayment).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { applyPayment } from '@/app/lib/warehouse-accounts';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';

/** يُرمى عند تغيّر paidAmount بين القراءة والكتابة (دفعة متزامنة أخرى على نفس الفاتورة). */
class ConcurrentSupplierPaymentError extends Error {}

// POST: تسجيل دفعة لمورّد — { amount, method?, reference?, notes? }
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;

    try {
        const gate = await requireWarehousePermission(ctx, 'canPaySupplier');
        if (!gate.ok) return gate.response;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
        }

        const amount = Number(body.amount);
        const method = typeof body.method === 'string' && body.method.trim() ? body.method.trim() : 'CASH';
        const reference = typeof body.reference === 'string' ? body.reference.trim() || null : null;
        const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

        // ملكية فاتورة الشراء: يجب أن تنتمي لمذخر الفاعل حصراً.
        const purchase = await prisma.warehousePurchase.findFirst({
            where: { id: params.id, warehouseId: ctx.warehouseId },
            select: { id: true, total: true, paidAmount: true, status: true },
        });
        if (!purchase) {
            return NextResponse.json({ error: 'فاتورة الشراء غير موجودة ضمن هذا المذخر' }, { status: 404 });
        }

        if (purchase.status === 'CANCELLED') {
            return NextResponse.json({ error: 'لا يمكن تسجيل دفعة على فاتورة شراء مُلغاة.' }, { status: 400 });
        }

        const result = applyPayment({ total: purchase.total, paidAmount: purchase.paidAmount, payment: amount });
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const updated = await prisma.$transaction(async (tx) => {
            // الحارس: تحديث مشروط بـ paidAmount كما قُرئ أعلاه بالضبط — نفس
            // انضباط POST /api/warehouse-portal/invoices/[id]/payments حرفياً.
            const applied = await tx.warehousePurchase.updateMany({
                where: { id: purchase.id, paidAmount: purchase.paidAmount },
                data: { paidAmount: result.newPaid, status: result.newStatus },
            });
            if (applied.count !== 1) {
                throw new ConcurrentSupplierPaymentError(
                    'تغيّر رصيد فاتورة الشراء أثناء المعالجة (دفعة متزامنة أخرى) — أعد المحاولة.'
                );
            }

            const payment = await tx.warehouseSupplierPayment.create({
                data: {
                    purchaseId: purchase.id,
                    warehouseId: ctx.warehouseId,
                    amount,
                    method,
                    reference,
                    notes,
                    actorName: ctx.user.name ?? ctx.user.email ?? null,
                },
            });

            const freshPurchase = await tx.warehousePurchase.findUniqueOrThrow({ where: { id: purchase.id } });

            return { purchase: freshPurchase, payment };
        });

        return NextResponse.json(updated, { status: 201 });
    } catch (e: any) {
        if (e instanceof ConcurrentSupplierPaymentError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        console.error('warehouse-portal purchase payments POST error:', e);
        return NextResponse.json({ error: 'فشل في تسجيل الدفعة' }, { status: 500 });
    }
}
