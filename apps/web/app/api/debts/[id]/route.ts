import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getTenantContext } from '@/app/lib/tenant-utils';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const patient = await prisma.patient.findFirst({
            where: { id: params.id, ...tenantCtx.tenantBranchWhere },
            include: {
                sales: {
                    orderBy: { createdAt: 'desc' },
                    take: 30,
                    include: {
                        items: {
                            include: {
                                drug: {
                                    select: {
                                        tradeName: true,
                                    },
                                },
                            },
                        },
                        debtPayments: true,
                        payment: true,
                    },
                },
            },
        });

        if (!patient) {
            return NextResponse.json(
                { message: 'المريض غير موجود' },
                { status: 404 }
            );
        }

        // Collect all debt payments from credit sales
        const allPayments: any[] = [];
        const salesMapped = patient.sales.map((sale: any) => {
            // Collect payments from each sale
            if (sale.debtPayments) {
                sale.debtPayments.forEach((dp: any) => {
                    allPayments.push({
                        id: dp.id,
                        amount: dp.amount,
                        createdAt: dp.createdAt,
                        note: dp.note || '',
                    });
                });
            }

            return {
                id: sale.id,
                total: sale.total,
                createdAt: sale.createdAt,
                status: sale.payment?.method === 'CREDIT' || !sale.payment ? 'آجل' : 'مدفوع',
                items: sale.items.map((item: any) => ({
                    name: item.drug?.tradeName || 'منتج',
                    quantity: item.quantity,
                    price: item.price,
                })),
            };
        });

        // Sort payments by date
        allPayments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return NextResponse.json({
            patient: {
                id: patient.id,
                name: patient.name,
                phone: patient.phone,
                balance: patient.balance,
                updatedAt: patient.updatedAt,
            },
            sales: salesMapped,
            payments: allPayments,
        });

    } catch (error) {
        console.error('Error fetching debtor details:', error);
        return NextResponse.json(
            { message: 'فشل تحميل تفاصيل العميل' },
            { status: 500 }
        );
    }
}
