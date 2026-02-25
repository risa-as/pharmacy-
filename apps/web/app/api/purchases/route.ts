import { NextResponse } from "next/server";
import { getPurchases } from "@/app/lib/actions/purchase-actions";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId') || undefined;

        const purchases = await getPurchases(branchId);

        return NextResponse.json(purchases);
    } catch (error) {
        console.error("Get Purchases API Error:", error);
        return NextResponse.json({ message: "Failed to fetch purchases" }, { status: 500 });
    }
}
