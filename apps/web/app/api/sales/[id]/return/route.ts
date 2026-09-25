import { calculateRefund } from '@faramace/shared';
import { restoreSaleReturnStock } from '@/app/lib/sale-return-stock';
import { settleSaleLoyalty } from '@/app/lib/loyalty-settlement';
import { Prisma } from '@prisma/client';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

class DuplicateReturnError extends Error {}
class ReturnValidationError extends Error {}

async function isProcessedReturn(idempotencyKey: string, branchId: string): Promise<boolean> {
    const log = await prisma.syncActionLog.findUnique({ where: { idempotencyKey } });
    if (log && (log.branchId !== branchId || log.actionType !== 'SALE_RETURN'))
        throw new ReturnValidationError('مفتاح العملية مستخدم لعملية أخرى.');
    return !!log;
}

function duplicateResponse(idempotencyKey: string) {
    return NextResponse.json({
        success: true,
        duplicate: true,
        message: 'تم تسجيل هذا الإرجاع مسبقاً.',
        ack: { status: 'duplicate', idempotencyKey: idempotencyKey || null },
    });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    let idempotencyKey = '';
    let returnBranchId = '';
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        const { user } = tenantCtx;
        returnBranchId = user.branchId || '';

        if (!tenantCtx.userPermissions.canProcessReturn) {
            return NextResponse.json({ message: 'ليس لديك صلاحية لمعالجة المرتجعات.' }, { status: 403 });
        }

        if (!user.branchId && user.role !== 'SUPER_ADMIN') {
            return NextResponse.json({ message: 'No Branch Assigned' }, { status: 403 });
        }

        const saleId = params.id;
        const body = await request.json();
        const { items, notes, safeId } = body;

        if (!items || !items.length) {
            return NextResponse.json({ message: 'No items provided for return' }, { status: 400 });
        }

        // A retried request (e.g. the response was lost after the server
        // committed) carries the same key and must not create a second return.
        idempotencyKey = String(request.headers.get('x-idempotency-key') || body.clientActionId || '').trim();
        if (idempotencyKey && await isProcessedReturn(idempotencyKey, returnBranchId)) {
            return duplicateResponse(idempotencyKey);
        }

        // Fetch the original sale
        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: {
                items: true,
                returns: { include: { items: true } },
                patient: true,
                payment: true,
            }
        });

        if (!sale) {
            return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
        }

        if (sale.branchId !== user.branchId) {
            return NextResponse.json({ message: 'Sale does not belong to your branch' }, { status: 403 });
        }

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 0. Serialize returns on this sale: lock the sale row, then re-check
            //    the key and re-read previous returns inside the lock so two
            //    concurrent requests can never both pass validation.
            await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
            if (idempotencyKey) {
                const log = await tx.syncActionLog.findUnique({ where: { idempotencyKey } });
                if (log && (log.branchId !== returnBranchId || log.actionType !== 'SALE_RETURN')) throw new ReturnValidationError('مفتاح العملية مستخدم لعملية أخرى.');
                if (log) throw new DuplicateReturnError();
            }
            const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true, payment: true } });
            if (!sale || sale.branchId !== user.branchId) throw new ReturnValidationError('الفاتورة غير موجودة ضمن الفرع.');
            const priorReturns = await tx.saleReturn.findMany({
                where: { saleId },
                select: { total: true, items: { select: { drugId: true, quantity: true } } },
            });
            let refund;
            try { refund = calculateRefund({ ...sale, returns: priorReturns }, items); }
            catch (e) { throw new ReturnValidationError((e as Error).message); }
            const totalReturnAmount = refund.total;
            const returnItemsData = await restoreSaleReturnStock(tx, sale.branchId, sale.items, priorReturns, refund.items);

            const refundSafeId = safeId || sale.safeId;
            if (refundSafeId && !await tx.safe.findFirst({ where: { id: refundSafeId, branchId: sale.branchId }, select: { id: true } }))
                throw new ReturnValidationError('الصندوق لا يتبع فرع الفاتورة.');
            // 1. Create SaleReturn record
            const saleReturn = await tx.saleReturn.create({
                data: {
                    saleId: sale.id,
                    branchId: user.branchId!,
                    userId: user.id,
                    safeId: refundSafeId, // Use provided safe or original sale's safe
                    total: totalReturnAmount,
                    notes: notes || null,
                    items: {
                        create: returnItemsData
                    }
                }, include: { items: true }
            });

            // 2. Adjust Financials
            if (sale.patientId && sale.payment?.method === 'CREDIT') {
                // If it was a credit sale, reduce the patient's debt balance
                await tx.patient.update({
                    where: { id: sale.patientId },
                    data: {
                        balance: { decrement: totalReturnAmount }
                    }
                });
            } else if (saleReturn.safeId) {
                // Return cash from the safe
                await tx.safe.update({
                    where: { id: saleReturn.safeId },
                    data: {
                        balance: { decrement: totalReturnAmount }
                    }
                });

                // Record the transaction
                await tx.transaction.create({
                    data: {
                        safeId: saleReturn.safeId,
                        type: 'OUT',
                        amount: totalReturnAmount,
                        referenceType: 'SALE_RETURN',
                        referenceId: saleReturn.id,
                        description: `Return for sale ${sale.id}`,
                        userId: user.id
                    }
                });
            }

            // 3. Loyalty follows the refund: earned points taken back, redeemed
            //    points given back (idempotent, see settleSaleLoyalty).
            await settleSaleLoyalty(tx, sale.id);

            // 4. Record the key in the same transaction as the return itself
            if (idempotencyKey) {
                await tx.syncActionLog.create({
                    data: { idempotencyKey, actionType: 'SALE_RETURN', branchId: user.branchId!, status: 'PROCESSED' },
                });
            }

            return saleReturn;
        }, {
            // A concurrent return on the same invoice waits on the row lock.
            maxWait: 5000,
            timeout: 20000,
        });

        return NextResponse.json({
            success: true,
            saleReturn: result,
            message: result.items.some(i => i.stockStatus === 'QUARANTINED') ? 'تم رد المبلغ. اعزل الأصناف غير الموثقة؛ تنتظر فحص المدير في صفحة المرتجعات قبل إعادتها للبيع.' : 'تم الإرجاع إلى دفعات البيع الأصلية.',
            ack: { status: 'processed', idempotencyKey: idempotencyKey || null },
        });

    } catch (error: any) {
        if (error instanceof DuplicateReturnError) {
            return duplicateResponse(idempotencyKey);
        }
        if (error instanceof ReturnValidationError) {
            return NextResponse.json({ message: error.message }, { status: 400 });
        }
        // The same key reused for a different sale loses the race on the log's primary key.
        if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            try {
                if (await isProcessedReturn(idempotencyKey, returnBranchId)) return duplicateResponse(idempotencyKey);
            } catch { /* A foreign key collision is never an acknowledgement. */ }
            return NextResponse.json({ message: 'تعارض مفتاح العملية؛ راجع سجل الإرجاع.' }, { status: 409 });
        }
        console.error('API Sale Return Error:', error);
        return NextResponse.json(
            { message: error.message || 'Error processing return' },
            { status: 500 }
        );
    }
}
