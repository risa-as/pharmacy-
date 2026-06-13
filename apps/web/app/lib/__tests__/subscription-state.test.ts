import { describe, it, expect } from 'vitest';
import { getSubscriptionState } from '../subscription-state';

// Subscription lifecycle is the brain behind suspension/grace enforcement that
// now gates desktop login, mobile login, and sync (see api-guards / sync-auth).
// A regression here silently lets unpaid tenants keep operating or wrongly locks
// out paying ones — so every branch is pinned below.

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe('getSubscriptionState', () => {
    it('treats the manual suspension flag as overriding everything else', () => {
        const r = getSubscriptionState({ isSuspended: true, subscriptionEndsAt: daysFromNow(365) });
        expect(r.state).toBe('suspended');
    });

    it('treats a null expiry as a perpetual (active) subscription', () => {
        const r = getSubscriptionState({ isSuspended: false, subscriptionEndsAt: null });
        expect(r.state).toBe('active');
        expect(r.daysUntilExpiry).toBeNull();
    });

    it('is active when more than 7 days remain', () => {
        const r = getSubscriptionState({ isSuspended: false, subscriptionEndsAt: daysFromNow(30) });
        expect(r.state).toBe('active');
        expect(r.daysUntilExpiry).toBeGreaterThan(7);
    });

    it('warns inside the final 7-day window before expiry', () => {
        const r = getSubscriptionState({ isSuspended: false, subscriptionEndsAt: daysFromNow(3) });
        expect(r.state).toBe('warning');
        expect(r.daysUntilExpiry).toBeGreaterThan(0);
    });

    it('enters grace when expired but within the 5-day grace window', () => {
        const r = getSubscriptionState({ isSuspended: false, subscriptionEndsAt: daysFromNow(-2) });
        expect(r.state).toBe('grace');
        expect(r.graceEndsAt).toBeInstanceOf(Date);
    });

    it('auto-suspends once more than 5 days overdue', () => {
        const r = getSubscriptionState({ isSuspended: false, subscriptionEndsAt: daysFromNow(-10) });
        expect(r.state).toBe('suspended');
    });

    it('keeps a just-expired subscription in grace, not suspended (boundary)', () => {
        // A few minutes past expiry must be grace — the desktop/mobile login
        // guards only block on "suspended", so this boundary protects users
        // whose payment is processing.
        const r = getSubscriptionState({ isSuspended: false, subscriptionEndsAt: new Date(Date.now() - 60_000) });
        expect(r.state).toBe('grace');
    });
});
