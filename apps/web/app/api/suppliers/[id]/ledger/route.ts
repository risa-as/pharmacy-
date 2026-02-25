import { NextResponse } from "next/server";
import { getSupplierLedger } from "@/app/lib/actions/supplier-ledger-actions";

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const ledger = await getSupplierLedger(params.id);
        return NextResponse.json(ledger);
    } catch (error) {
        console.error("Supplier Ledger API Error:", error);
        return NextResponse.json({ message: "Failed to fetch ledger" }, { status: 500 });
    }
}
