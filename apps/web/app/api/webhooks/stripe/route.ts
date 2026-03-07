import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/app/lib/prisma";

export async function POST(request: NextRequest) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover",
    });
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
        return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET || ""
        );
    } catch (error: any) {
        console.error("Webhook signature verification failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
        case "payment_intent.succeeded":
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            console.log("Payment succeeded:", paymentIntent.id);

            // Check if payment already recorded
            const existingPayment = await prisma.payment.findFirst({
                where: { referenceNumber: paymentIntent.id },
            });

            if (!existingPayment && paymentIntent.metadata.saleId) {
                await prisma.payment.create({
                    data: {
                        saleId: paymentIntent.metadata.saleId,
                        amount: paymentIntent.amount / 100,
                        method: "CARD",
                        referenceNumber: paymentIntent.id,
                        status: "COMPLETED",
                    },
                });
            }
            break;

        case "payment_intent.payment_failed":
            const failedPayment = event.data.object as Stripe.PaymentIntent;
            console.error("Payment failed:", failedPayment.id);
            break;

        case "charge.refunded":
            const refund = event.data.object as Stripe.Charge;
            console.log("Refund processed:", refund.id);

            await prisma.payment.updateMany({
                where: { referenceNumber: refund.payment_intent as string },
                data: { status: "REFUNDED" },
            });
            break;

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
}
