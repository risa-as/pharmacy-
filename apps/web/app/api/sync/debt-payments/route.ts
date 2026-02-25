import { NextResponse } from "next/server";
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
