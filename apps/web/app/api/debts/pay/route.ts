import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export const dynamic = 'force-dynamic';

// POST /api/debts/pay
// Body: { patientId: string, amount: number, note?: string }
// Mobile sends a patient-level payment; we distribute it oldest-sale-first.
export async function POST(request: Request) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;
        if (!tenantCtx.userPermissions.canPayDebt) {
            return NextResponse.json({ error: 'ليس لديك صلاحية لتسجيل سداد الديون.' }, { status: 403 });
        }

        const { patientId, amount, note } = await request.json();

        if (!patientId || typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });
        }

        const patient = await prisma.patient.findUnique({
            where: { id: patientId },
            include: {
                sales: {
                    where: { payment: { method: 'CREDIT' } },
                    include: {
                        payment: true,
                        debtPayments: true,
                    },
                    orderBy: { createdAt: 'asc' }, // oldest first
                },
            },
        });

        if (!patient) {
            return NextResponse.json({ error: 'المريض غير موجود' }, { status: 404 });
        }

        if (patient.balance <= 0) {
            return NextResponse.json({ error: 'لا توجد ديون لهذا المريض' }, { status: 400 });
        }

        // Build remaining balance per sale
        const unpaidSales = patient.sales
            .map((sale: any) => {
                const totalPaid = sale.debtPayments.reduce((sum: any, dp: any) => sum + dp.amount, 0);
                const remaining = sale.total - sale.discount - totalPaid;
                return { ...sale, remaining };
            })
            .filter((s: any) => s.remaining > 0);

        if (unpaidSales.length === 0) {
            return NextResponse.json({ error: 'لا توجد فواتير غير مسددة' }, { status: 400 });
        }

        // Cap the payment at the patient's recorded balance
        const finalTotal = Math.min(amount, patient.balance);
        let leftover = finalTotal;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ops: any[] = [];

        for (const sale of unpaidSales) {
            if (leftover <= 0) break;

            const payForSale = Math.min(leftover, sale.remaining);
            leftover -= payForSale;

            ops.push(
                prisma.debtPayment.create({
                    data: {
                        saleId: sale.id,
                        amount: payForSale,
                        method: 'CASH',
                        note: note || null,
                    },
                })
            );

            // Mark the Payment record as COMPLETED when this sale is fully settled
            if (payForSale >= sale.remaining && sale.payment) {
                ops.push(
                    prisma.payment.update({
                        where: { saleId: sale.id },
                        data: { status: 'COMPLETED' },
                    })
                );
            }
        }

        // Decrement the patient's total debt balance
        ops.push(
            prisma.patient.update({
                where: { id: patientId },
                data: { balance: { decrement: finalTotal } },
            })
        );

        await prisma.$transaction(ops);

        return NextResponse.json({
            success: true,
            paid: finalTotal,
            newBalance: Math.max(0, patient.balance - finalTotal),
        });
    } catch (error) {
        console.error('Error recording debt payment:', error);
        return NextResponse.json({ error: 'فشل تسجيل الدفعة' }, { status: 500 });
    }
}
