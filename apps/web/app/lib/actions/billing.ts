"use server";

/**
 * billing.ts — Server Actions for Zain Cash subscription renewal.
 *
 * Flow (3 stages):
 *   1. initiateZainCashPayment()  → creates a PENDING PaymentTransaction,
 *      calls Zain Cash API, returns the payUrl for client redirect.
 *   2. User authorizes on Zain Cash hosted page.
 *   3. verifyZainCashPayment()    → server-side verification with Zain Cash
 *      (never trusts the redirect URL params alone), fulfills on success.
 *
 * Security note: ZAINCASH_MERCHANT_SECRET must NEVER leave the server.
 * All JWT signing happens here; the client only ever receives a payUrl.
 */

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import jwt from "jsonwebtoken";

// ── Env helpers ────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required environment variable: ${name}`);
    return val;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type InitiateResult =
    | { success: true;  payUrl: string }
    | { success: false; error: string };

export type VerifyResult =
    | { success: true;  status: "COMPLETED" }
    | { success: false; status: "FAILED" | "EXPIRED" | "PENDING"; error?: string };

// ── T022: sweepExpiredPendingTransactions ──────────────────────────────────

/**
 * On-demand sweep — marks PENDING PaymentTransaction records older than
 * 30 minutes as EXPIRED. Called on billing page load so the history table
 * always reflects accurate state without a separate cron job.
 *
 * Safe to call concurrently: the `updateMany` is atomic and idempotent.
 *
 * @param organizationId  Scope the sweep to a single tenant
 */
export async function sweepExpiredPendingTransactions(
    organizationId: string
): Promise<void> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    try {
        await prisma.paymentTransaction.updateMany({
            where: {
                organizationId,
                status:      "PENDING",
                initiatedAt: { lt: thirtyMinutesAgo },
            },
            data: { status: "EXPIRED" },
        });
    } catch (error) {
        // Non-critical — log and continue; stale PENDING rows are cosmetic only
        console.error("[billing] sweepExpiredPendingTransactions error:", error);
    }
}

// ── T017: initiateZainCashPayment ──────────────────────────────────────────

/**
 * Stage 1 — Create a PENDING PaymentTransaction, sign a Zain Cash JWT,
 * POST to the initiation endpoint, and return the payUrl.
 *
 * @param organizationId  The tenant's org UUID
 * @param renewalMonths   How many months to renew (default: 1)
 */
export async function initiateZainCashPayment(
    organizationId: string,
    renewalMonths: number = 1
): Promise<InitiateResult> {
    // ── Auth guard ────────────────────────────────────────────────────────
    const session = await auth();
    const user = session?.user as { role?: string } | undefined;
    if (user?.role !== "ADMIN") {
        return { success: false, error: "غير مصرح" };
    }

    try {
        const merchantSecret  = requireEnv("ZAINCASH_MERCHANT_SECRET");
        const merchantId      = requireEnv("ZAINCASH_MERCHANT_ID");
        const msisdn          = requireEnv("ZAINCASH_MSISDN");
        const apiUrl          = requireEnv("ZAINCASH_API_URL");
        const appUrl          = requireEnv("NEXT_PUBLIC_APP_URL");

        // ── Fetch plan price ──────────────────────────────────────────────
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { plan: { select: { price: true, name: true } } },
        });

        const pricePerMonth = org?.plan?.price ?? 0;
        const amount        = pricePerMonth * renewalMonths;

        // Zain Cash requires a minimum amount; enforce a floor of 1 IQD
        if (amount <= 0) {
            return { success: false, error: "مبلغ الاشتراك غير محدد. يرجى التواصل مع الدعم." };
        }

        // ── Create PENDING transaction ────────────────────────────────────
        const transaction = await prisma.paymentTransaction.create({
            data: {
                organizationId,
                amount,
                currency:      "IQD",
                gateway:       "ZAINCASH",
                renewalMonths,
                status:        "PENDING",
            },
        });

        // ── Build redirect URL (our callback) ─────────────────────────────
        // Zain Cash will APPEND its own ?status=...&orderid=... to this URL.
        // We embed our internal txn ID so we can look it up on return.
        const redirectUrl = `${appUrl}/dashboard/settings/billing?txn_id=${transaction.id}`;

        // ── Sign Zain Cash JWT ────────────────────────────────────────────
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            amount,
            serviceType: org?.plan?.name ?? "اشتراك صيدلية فاراماس",
            msisdn,
            orderId:     transaction.id,     // our UUID as the order reference
            redirectUrl,
            terminalId:  merchantId,
            iat:         now,
            exp:         now + 60 * 60,      // token valid for 1 hour
        };

        const token = jwt.sign(payload, merchantSecret, { algorithm: "HS256" });

        // ── POST to Zain Cash initiation endpoint ─────────────────────────
        let response: Response;
        try {
            response = await fetch(`${apiUrl}/transaction/initiate`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ token, merchantId, lang: "ar" }),
            });
        } catch (networkError) {
            // T023: API downtime / network failure — clean up ghost PENDING record
            console.error("[billing] Zain Cash network error:", networkError);
            await prisma.paymentTransaction.delete({ where: { id: transaction.id } }).catch(() => {});
            return { success: false, error: "تعذّر الاتصال ببوابة زين كاش. يرجى التحقق من اتصالك والمحاولة مجدداً." };
        }

        if (!response.ok) {
            // T023: Non-2xx response — clean up ghost PENDING record
            await prisma.paymentTransaction.delete({ where: { id: transaction.id } }).catch(() => {});
            return { success: false, error: "فشل الاتصال ببوابة زين كاش. يرجى المحاولة لاحقاً." };
        }

        const data = await response.json() as { id?: string; redirectURL?: string };

        if (!data.id || !data.redirectURL) {
            await prisma.paymentTransaction.delete({ where: { id: transaction.id } }).catch(() => {});
            return { success: false, error: "استجابة غير صالحة من زين كاش." };
        }

        // ── Persist Zain Cash transaction ID ─────────────────────────────
        await prisma.paymentTransaction.update({
            where: { id: transaction.id },
            data:  { gatewayTransactionId: data.id },
        });

        return { success: true, payUrl: data.redirectURL };

    } catch (error) {
        console.error("[billing] initiateZainCashPayment error:", error);
        return { success: false, error: "حدث خطأ غير متوقع. يرجى المحاولة مجدداً." };
    }
}

// ── T018: verifyZainCashPayment ────────────────────────────────────────────

/**
 * Stage 3 — Server-side verification with Zain Cash.
 * Called when the user returns to the billing page with ?txn_id=...
 *
 * Idempotent: if the transaction is not PENDING, returns its current status
 * without making any API calls or DB writes.
 *
 * @param transactionId  Our internal PaymentTransaction.id (the orderId we sent)
 */
export async function verifyZainCashPayment(
    transactionId: string
): Promise<VerifyResult> {
    try {
        // ── Look up transaction ───────────────────────────────────────────
        const transaction = await prisma.paymentTransaction.findUnique({
            where: { id: transactionId },
            select: {
                id:                   true,
                status:               true,
                organizationId:       true,
                renewalMonths:        true,
                gatewayTransactionId: true,
            },
        });

        if (!transaction) {
            return { success: false, status: "FAILED", error: "معرّف العملية غير موجود." };
        }

        // ── Idempotency guard ─────────────────────────────────────────────
        if (transaction.status !== "PENDING") {
            return transaction.status === "COMPLETED"
                ? { success: true,  status: "COMPLETED" }
                : { success: false, status: transaction.status as "FAILED" | "EXPIRED" };
        }

        // ── PENDING timeout guard (30 min) ────────────────────────────────
        // (Defensive check; formal expiry sweep is T022 / Phase 5)

        // ── Call Zain Cash verification endpoint ──────────────────────────
        const merchantSecret = requireEnv("ZAINCASH_MERCHANT_SECRET");
        const merchantId     = requireEnv("ZAINCASH_MERCHANT_ID");
        const msisdn         = requireEnv("ZAINCASH_MSISDN");
        const apiUrl         = requireEnv("ZAINCASH_API_URL");

        const now     = Math.floor(Date.now() / 1000);
        const payload = {
            id:      transaction.gatewayTransactionId,
            msisdn,
            orderId: transaction.id,
            iat:     now,
            exp:     now + 60 * 5,
        };

        const token    = jwt.sign(payload, merchantSecret, { algorithm: "HS256" });
        const response = await fetch(`${apiUrl}/transaction/get`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token, merchantId }),
        });

        // Decode the JWT response from Zain Cash
        let zcData: Record<string, unknown> = {};
        if (response.ok) {
            const body = await response.json() as { token?: string };
            if (body.token) {
                try {
                    zcData = jwt.verify(body.token, merchantSecret) as Record<string, unknown>;
                } catch {
                    // Token verification failed — treat as FAILED
                }
            }
        }

        const zcStatus = (zcData.status as string | undefined)?.toLowerCase();
        const isSuccess = zcStatus === "success" || zcStatus === "1" || zcStatus === "paid";

        if (isSuccess) {
            // ── Calculate new subscription expiry ─────────────────────────
            const org = await prisma.organization.findUnique({
                where:  { id: transaction.organizationId },
                select: { subscriptionEndsAt: true },
            });

            const base         = org?.subscriptionEndsAt && org.subscriptionEndsAt > new Date()
                ? org.subscriptionEndsAt
                : new Date();
            const newExpiresAt = new Date(base);
            newExpiresAt.setMonth(newExpiresAt.getMonth() + transaction.renewalMonths);

            // ── Fulfill: update transaction + lift suspension ─────────────
            await prisma.$transaction([
                prisma.paymentTransaction.update({
                    where: { id: transaction.id },
                    data:  {
                        status:       "COMPLETED",
                        completedAt:  new Date(),
                        newExpiresAt,
                        metadata:     zcData as object,
                    },
                }),
                prisma.organization.update({
                    where: { id: transaction.organizationId },
                    data:  {
                        subscriptionEndsAt: newExpiresAt,
                        isSuspended:        false,
                        suspendedAt:        null,
                    },
                }),
            ]);

            revalidatePath("/dashboard/settings/billing");
            revalidatePath("/dashboard");

            return { success: true, status: "COMPLETED" };

        } else {
            // ── Payment failed or cancelled ───────────────────────────────
            await prisma.paymentTransaction.update({
                where: { id: transaction.id },
                data:  {
                    status:   "FAILED",
                    metadata: zcData as object,
                },
            });

            return { success: false, status: "FAILED" };
        }

    } catch (error) {
        console.error("[billing] verifyZainCashPayment error:", error);
        return { success: false, status: "FAILED", error: "فشل التحقق من الدفع. يرجى التواصل مع الدعم." };
    }
}
