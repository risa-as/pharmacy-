
import { getBaseUrl } from './api';

export const paymentService = {
    async createStripeIntent(amount: number) {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/payments/stripe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount }),
        });
        if (!response.ok) throw new Error('Stripe init failed');
        return await response.json();
    },

    async initZainCash(amount: number, orderId: string) {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/payments/zaincash`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, orderId }),
        });
        if (!response.ok) throw new Error('ZainCash init failed');
        return await response.json();
    },
};
