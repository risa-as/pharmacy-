import { NextResponse } from "next/server";
import { getSupplierLedger } from "@/app/lib/actions/supplier-ledger-actions";
import { getTenantContext } from "@/app/lib/tenant-utils";

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return tenantCtx;

    try {
        const ledger = await getSupplierLedger(params.id);
        return NextResponse.json(ledger);
    } catch (error) {
        console.error("Supplier Ledger API Error:", error);
        return NextResponse.json({ message: "Failed to fetch ledger" }, { status: 500 });
    }
}
