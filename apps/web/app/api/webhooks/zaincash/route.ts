export const dynamic = 'force-dynamic';

/**
 * Zain Cash Server-to-Server Webhook
 *
 * Handles cases where the user closes the browser after authorizing payment
 * on the Zain Cash page, so the redirect back to our billing page never fires.
 *
 * Zain Cash POSTs a signed JWT to this endpoint when a transaction settles.
 * We verify the JWT signature, extract the orderId (our internal txn UUID),
 * and call verifyZainCashPayment() — which is fully idempotent, so a duplicate
 * call from both the redirect AND the webhook is safe.
 *
 * Security:
 *  - The JWT is signed with ZAINCASH_MERCHANT_SECRET — we verify before acting.
 *  - We always return 200 OK to Zain Cash (even on errors) to prevent retries
 *    for permanently-failed transactions. Internal errors are logged server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { verifyZainCashPayment } from "@/app/lib/actions/billing";

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return val;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const merchantSecret = requireEnv("ZAINCASH_MERCHANT_SECRET");

        // Zain Cash sends: { token: "<signed-jwt>" }
        const body = await req.json() as { token?: string };

        if (!body.token) {
            console.warn("[webhook/zaincash] Missing token in request body");
            return NextResponse.json({ received: true }, { status: 200 });
        }

        // ── Verify JWT signature ───────────────────────────────────────────
        let payload: Record<string, unknown>;
        try {
            payload = jwt.verify(body.token, merchantSecret) as Record<string, unknown>;
        } catch (err) {
            // Invalid signature — could be a spoofed request; log and discard
            console.error("[webhook/zaincash] JWT verification failed:", err);
            return NextResponse.json({ received: true }, { status: 200 });
        }

        // ── Extract our internal transaction ID (orderId) ─────────────────
        const orderId = payload.orderId as string | undefined;

        if (!orderId) {
            console.warn("[webhook/zaincash] No orderId in JWT payload:", payload);
            return NextResponse.json({ received: true }, { status: 200 });
        }

        // ── Delegate to the idempotent verify action ───────────────────────
        const result = await verifyZainCashPayment(orderId);
        console.log(`[webhook/zaincash] verifyZainCashPayment(${orderId}):`, result);

    } catch (error) {
        console.error("[webhook/zaincash] Unexpected error:", error);
    }

    // Always return 200 so Zain Cash doesn't retry
    return NextResponse.json({ received: true }, { status: 200 });
}
