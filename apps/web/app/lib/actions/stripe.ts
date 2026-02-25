"use server";

import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover",
});

export interface CreatePaymentIntentResult {
    clientSecret: string;
    paymentIntentId: string;
}

// إنشاء نية دفع جديدة
export async function createStripePaymentIntent(
    amount: number,
    saleId: string,
    currency: string = "usd"
): Promise<CreatePaymentIntentResult | { error: string }> {
    try {
        // Convert amount to cents (Stripe uses smallest currency unit)
        const amountInCents = Math.round(amount * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency,
            metadata: {
                saleId,
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return {
            clientSecret: paymentIntent.client_secret!,
            paymentIntentId: paymentIntent.id,
        };
    } catch (error: any) {
        console.error("Stripe Error:", error);
        return { error: error.message || "فشل في إنشاء نية الدفع" };
    }
}

// تأكيد الدفع وتسجيله في قاعدة البيانات
export async function confirmStripePayment(
    paymentIntentId: string,
    saleId: string
) {
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === "succeeded") {
            // تسجيل الدفع في قاعدة البيانات
            await prisma.payment.create({
                data: {
                    saleId,
                    amount: paymentIntent.amount / 100, // Convert back from cents
                    method: "CARD",
                    referenceNumber: paymentIntentId,
                    status: "COMPLETED",
                },
            });

            revalidatePath("/dashboard/payments");
            revalidatePath("/dashboard/sales");

            return { success: true };
        } else {
            return { error: `Payment status: ${paymentIntent.status}` };
        }
    } catch (error: any) {
        console.error("Stripe Confirm Error:", error);
        return { error: error.message || "فشل في تأكيد الدفع" };
    }
}

// استرجاع دفعة
export async function refundStripePayment(paymentIntentId: string) {
    try {
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
        });

        // تحديث حالة الدفع في قاعدة البيانات
        await prisma.payment.updateMany({
            where: { referenceNumber: paymentIntentId },
            data: { status: "REFUNDED" },
        });

        revalidatePath("/dashboard/payments");

        return { success: true, refundId: refund.id };
    } catch (error: any) {
        console.error("Stripe Refund Error:", error);
        return { error: error.message || "فشل في استرجاع الدفع" };
    }
}

// جلب تفاصيل دفعة
export async function getStripePaymentDetails(paymentIntentId: string) {
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        return { paymentIntent };
    } catch (error: any) {
        return { error: error.message };
    }
}
