import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { recordSupplierPayment } from "@/app/lib/actions/supplier-ledger-actions";

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const payments = await prisma.supplierPayment.findMany({
            where: { supplierId: params.id },
            include: { branch: { select: { name: true } } },
            orderBy: { date: 'desc' }
        });
        return NextResponse.json(payments);
    } catch (error) {
        console.error("Supplier Payments API Error:", error);
        return NextResponse.json({ message: "Failed to fetch payments" }, { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const body = await req.json();
        const result = await recordSupplierPayment({
            supplierId: params.id,
            branchId: body.branchId,
            amount: parseFloat(body.amount),
            method: body.method || 'CASH',
            reference: body.reference,
            notes: body.notes,
            date: body.date,
        });

        if (!result.success) {
            return NextResponse.json({ message: result.error }, { status: 400 });
        }

        return NextResponse.json({ message: "تم تسجيل الدفعة بنجاح" });
    } catch (error) {
        console.error("Record Payment API Error:", error);
        return NextResponse.json({ message: "Failed to record payment" }, { status: 500 });
    }
}
