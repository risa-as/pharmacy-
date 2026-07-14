import { describe, it, expect } from 'vitest';
import { evaluateSubscriptionState, type OfflineTokenPayload } from '../offline-token';

// evaluateSubscriptionState is the offline "time-bomb" brain: with no network,
// it decides whether the desktop app stays usable, locks, or flags tampering.
// Wrong logic here either lets an unpaid pharmacy run forever offline or locks
// out a paying one — so each priority branch is pinned.

const DAY = 24 * 60 * 60 * 1000;

function makePayload(overrides: Partial<OfflineTokenPayload> = {}): OfflineTokenPayload {
    return {
        organizationId: 'org-1',
        subscriptionEndsAt: new Date(Date.now() + 30 * DAY).toISOString(),
        gracePeriodEndsAt: null,
        isSuspended: false,
        issuedAt: new Date(Date.now() - 1 * DAY).toISOString(), // issued yesterday
        maxOfflineDays: 14,
        ...overrides,
    };
}

describe('evaluateSubscriptionState', () => {
    it('returns active for a healthy, recently-issued token', () => {
        expect(evaluateSubscriptionState(makePayload(), null)).toBe('active');
    });

    it('detects clock rollback when system time is before issuedAt', () => {
        const payload = makePayload({ issuedAt: new Date(Date.now() + 5 * DAY).toISOString() });
        expect(evaluateSubscriptionState(payload, null)).toBe('clock-tampered');
    });

    it('detects clock rollback when system time is before the last online check-in', () => {
        const lastSeen = new Date(Date.now() + 2 * DAY); // future → clock was moved back
        expect(evaluateSubscriptionState(makePayload(), lastSeen)).toBe('clock-tampered');
    });

    it('locks once offline longer than maxOfflineDays', () => {
        const payload = makePayload({
            issuedAt: new Date(Date.now() - 20 * DAY).toISOString(),
            maxOfflineDays: 14,
        });
        expect(evaluateSubscriptionState(payload, null)).toBe('offline-limit-exceeded');
    });

    it('honours the manual suspension flag', () => {
        expect(evaluateSubscriptionState(makePayload({ isSuspended: true }), null)).toBe('suspended');
    });

    it('suspends once past the grace-period end', () => {
        const payload = makePayload({
            subscriptionEndsAt: new Date(Date.now() - 10 * DAY).toISOString(),
            gracePeriodEndsAt: new Date(Date.now() - 1 * DAY).toISOString(),
        });
        expect(evaluateSubscriptionState(payload, null)).toBe('suspended');
    });

    it('reports grace when the subscription has expired but grace has not', () => {
        const payload = makePayload({
            subscriptionEndsAt: new Date(Date.now() - 1 * DAY).toISOString(),
            gracePeriodEndsAt: new Date(Date.now() + 3 * DAY).toISOString(),
        });
        expect(evaluateSubscriptionState(payload, null)).toBe('grace');
    });

    it('prioritises clock-tamper over an exceeded offline limit', () => {
        // Both conditions true: rollback must win (it is checked first).
        const payload = makePayload({
            issuedAt: new Date(Date.now() + 30 * DAY).toISOString(),
            maxOfflineDays: 1,
        });
        expect(evaluateSubscriptionState(payload, null)).toBe('clock-tampered');
    });
});
