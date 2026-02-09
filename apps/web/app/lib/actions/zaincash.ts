"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

const prisma = new PrismaClient();

// Zain Cash Configuration
const ZAINCASH_MERCHANT_ID = process.env.ZAINCASH_MERCHANT_ID || "";
const ZAINCASH_SECRET = process.env.ZAINCASH_SECRET || "";
const ZAINCASH_BASE_URL = process.env.ZAINCASH_BASE_URL || "https://test.zaincash.iq";
const ZAINCASH_SUCCESS_URL = process.env.ZAINCASH_SUCCESS_URL || "";
const ZAINCASH_FAILURE_URL = process.env.ZAINCASH_FAILURE_URL || "";

interface ZainCashTransactionResult {
    transactionId: string;
    redirectUrl: string;
}

// Helper function to generate JWT token for Zain Cash
function generateZainCashToken(payload: object): string {
    const header = { alg: "HS256", typ: "JWT" };

    const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");

    const signature = crypto
        .createHmac("sha256", ZAINCASH_SECRET)
        .update(`${base64Header}.${base64Payload}`)
        .digest("base64url");

    return `${base64Header}.${base64Payload}.${signature}`;
}

// Helper function to verify JWT token from Zain Cash
function verifyZainCashToken(token: string): object | null {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;

        const [header, payload, signature] = parts;

        const expectedSignature = crypto
            .createHmac("sha256", ZAINCASH_SECRET)
            .update(`${header}.${payload}`)
            .digest("base64url");

        if (signature !== expectedSignature) return null;

        return JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
        return null;
    }
}

// إنشاء معاملة Zain Cash جديدة
export async function createZainCashTransaction(
    amount: number,
    saleId: string,
    serviceType: string = "pharmacy_payment"
): Promise<ZainCashTransactionResult | { error: string }> {
    try {
        const transactionData = {
            amount: amount,
            serviceType,
            msisdn: ZAINCASH_MERCHANT_ID,
            orderId: saleId,
            redirectUrl: ZAINCASH_SUCCESS_URL,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
        };

        const token = generateZainCashToken(transactionData);

        // Call Zain Cash API
        const response = await fetch(`${ZAINCASH_BASE_URL}/transaction/init`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                token,
                merchantId: ZAINCASH_MERCHANT_ID,
                lang: "ar",
            }),
        });

        const result = await response.json();

        if (result.err) {
            return { error: result.err.msg || "فشل في إنشاء معاملة Zain Cash" };
        }

        return {
            transactionId: result.id,
            redirectUrl: `${ZAINCASH_BASE_URL}/transaction/pay?id=${result.id}`,
        };
    } catch (error: any) {
        console.error("Zain Cash Error:", error);
        return { error: error.message || "فشل في إنشاء معاملة Zain Cash" };
    }
}

// التحقق من دفعة Zain Cash
export async function verifyZainCashPayment(token: string) {
    try {
        const payload = verifyZainCashToken(token) as any;

        if (!payload) {
            return { error: "Invalid token" };
        }

        if (payload.status === "success") {
            // تسجيل الدفع في قاعدة البيانات
            await prisma.payment.create({
                data: {
                    saleId: payload.orderId,
                    amount: payload.amount,
                    method: "MOBILE_WALLET",
                    referenceNumber: payload.transactionId,
                    status: "COMPLETED",
                },
            });

            revalidatePath("/dashboard/payments");
            revalidatePath("/dashboard/sales");

            return { success: true, transactionId: payload.transactionId };
        } else {
            return { error: `Payment failed: ${payload.msg}` };
        }
    } catch (error: any) {
        console.error("Zain Cash Verify Error:", error);
        return { error: error.message || "فشل في التحقق من الدفع" };
    }
}

// استعلام عن حالة معاملة
export async function checkZainCashTransactionStatus(transactionId: string) {
    try {
        const payload = {
            id: transactionId,
            msisdn: ZAINCASH_MERCHANT_ID,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const token = generateZainCashToken(payload);

        const response = await fetch(`${ZAINCASH_BASE_URL}/transaction/get`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                token,
                merchantId: ZAINCASH_MERCHANT_ID,
            }),
        });

        const result = await response.json();

        if (result.err) {
            return { error: result.err.msg };
        }

        return {
            status: result.status,
            amount: result.amount,
            orderId: result.orderId,
        };
    } catch (error: any) {
        console.error("Zain Cash Status Error:", error);
        return { error: error.message };
    }
}
