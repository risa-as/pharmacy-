import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ error: "branchId is required" }, { status: 400 });
        }

        // We want all debt payments belonging to sales created in this branch
        // Or if the debt payment itself was created in this branch. 
        // Currently, DebtPayment is tied directly to Sale, which is tied to Branch.
        const payments = await prisma.debtPayment.findMany({
            where: {
                sale: { branchId: branchId }
            },
            orderBy: { createdAt: 'desc' },
            take: 200, // Limit to recent 200 to prevent massive payloads 
            include: {
                sale: {
                    select: { patientId: true }
                }
            }
        });

        // Map to return just the necessary info
        const payload = payments.map(p => ({
            id: p.id,
            saleId: p.saleId,
            amount: p.amount,
            method: p.method,
            note: p.note,
            createdAt: p.createdAt.toISOString(),
            patientId: p.sale?.patientId // Extracted for convenience
        }));

        console.log(`Sync debt payments: branchId=${branchId}, count=${payload.length}`);
        return NextResponse.json({ payments: payload });
    } catch (error: any) {
        console.error("Sync Debt Payments Error:", error);
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { branchId, payments } = body as {
            branchId: string;
            payments: Array<{
                id: string;
                saleId: string;
                amount: number;
                method: string;
                note?: string;
                createdAt: string;
            }>;
        };

        if (!branchId || !Array.isArray(payments) || payments.length === 0) {
            return NextResponse.json({ error: "branchId and payments are required" }, { status: 400 });
        }

        const syncedIds: string[] = [];

        for (const payment of payments) {
            // Verify the sale belongs to this branch
            const sale = await prisma.sale.findUnique({
                where: { id: payment.saleId },
                select: { branchId: true, patientId: true },
            });

            if (!sale || sale.branchId !== branchId) continue;

            // Skip if already synced
            const existing = await prisma.debtPayment.findUnique({ where: { id: payment.id } });
            if (existing) {
                syncedIds.push(payment.id);
                continue;
            }

            await prisma.$transaction(async (tx) => {
                await tx.debtPayment.create({
                    data: {
                        id: payment.id,
                        saleId: payment.saleId,
                        amount: payment.amount,
                        method: (payment.method || "CASH") as any,
                        note: payment.note || null,
                        createdAt: new Date(payment.createdAt),
                    },
                });

                if (sale.patientId) {
                    await tx.patient.update({
                        where: { id: sale.patientId },
                        data: { balance: { decrement: payment.amount } },
                    });
                }
            });

            syncedIds.push(payment.id);
        }

        console.log(`[Sync] Debt payments received: ${payments.length}, synced: ${syncedIds.length}`);
        return NextResponse.json({ syncedIds });
    } catch (error: any) {
        console.error("Sync Debt Payments POST Error:", error);
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}
