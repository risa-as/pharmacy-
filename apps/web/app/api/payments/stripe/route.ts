export const dynamic = 'force-dynamic';


import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getTenantContext } from '@/app/lib/tenant-utils';

export async function POST(req: Request) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
        apiVersion: '2026-01-28.clover',
    });
    try {
        // Only authenticated tenants can create payment intents.
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const { amount, currency = 'usd' } = await req.json();

        // Validate the amount server-side so a client can't request an arbitrary
        // or negative charge. (Bounds: 1–100000 of the major unit.)
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100_000) {
            return NextResponse.json({ message: 'Invalid amount' }, { status: 400 });
        }

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(numericAmount * 100), // Stripe expects cents
            currency,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error: any) {
        console.error('Stripe error:', error);
        return NextResponse.json(
            { message: 'Payment processing error' },
            { status: 500 }
        );
    }
}
