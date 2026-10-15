import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem, CheckoutPatient, PaymentMethod } from '../context/CheckoutContext';

export interface CheckoutDraft {
    version: 1;
    cart: CartItem[];
    patient: CheckoutPatient | null;
    method: PaymentMethod | null;
    manualDiscount: number;
    pointsToRedeem: number;
    idempotencyKey: string;
}

export const checkoutDraftKey = (userId: string, branchId?: string | null) =>
    `faramace:checkout-draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(branchId ?? '')}`;

export function parseCheckoutDraft(raw: string | null): CheckoutDraft | null {
    if (!raw) return null;
    const draft = JSON.parse(raw) as CheckoutDraft;
    const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    if (draft.version !== 1 || !Array.isArray(draft.cart) ||
        !draft.cart.every(i => typeof i.id === 'string' && typeof i.name === 'string' && finite(i.price) && finite(i.quantity) && i.quantity > 0) ||
        !finite(draft.manualDiscount) || !finite(draft.pointsToRedeem) ||
        typeof draft.idempotencyKey !== 'string' || !draft.idempotencyKey ||
        ![null, 'CASH', 'CARD', 'CREDIT'].includes(draft.method) ||
        (draft.patient !== null && (!draft.patient || typeof draft.patient.id !== 'string' || typeof draft.patient.name !== 'string'))) {
        throw new Error('Invalid checkout draft');
    }
    return draft;
}

const writesByScope = new Map<string, Promise<void>>();

/** Ordered writes prevent an older save resurrecting an already cleared sale. */
export function createCheckoutDraftStore(key: string) {
    const pending = () => writesByScope.get(key) ?? Promise.resolve();
    return {
        load: async () => { await pending().catch(() => {}); return parseCheckoutDraft(await AsyncStorage.getItem(key)); },
        save(draft: CheckoutDraft) {
            const serialized = JSON.stringify(draft);
            const next = pending().catch(() => {}).then(() => AsyncStorage.setItem(key, serialized));
            writesByScope.set(key, next);
            return next;
        },
        flush: () => pending(),
    };
}
