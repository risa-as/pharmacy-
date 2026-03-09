export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { verifyZainCashPayment } from "@/app/lib/actions/zaincash";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const token = searchParams.get("token");

    if (status === "success" && token) {
        const result = await verifyZainCashPayment(token);

        if ("success" in result && result.success) {
            // Redirect to success page
            return NextResponse.redirect(
                new URL("/dashboard/payments?message=تمت عملية الدفع بنجاح", request.url)
            );
        }
    }

    // Redirect to failure page
    return NextResponse.redirect(
        new URL("/dashboard/payments?error=فشلت عملية الدفع", request.url)
    );
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json({ error: "Token is required" }, { status: 400 });
        }

        const result = await verifyZainCashPayment(token);

        if ("success" in result && result.success) {
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: result.error }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
