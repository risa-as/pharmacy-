/**
 * subscription-state.ts
 *
 * Computes the current subscription lifecycle state for an organisation.
 * Used by dashboard/layout.tsx (banner injection) and middleware.ts (grace enforcement).
 */

export type SubscriptionState = "active" | "warning" | "grace" | "suspended";

interface SubscriptionInput {
    subscriptionEndsAt: Date | null;
    isSuspended: boolean;
}

export interface SubscriptionResult {
    state: SubscriptionState;
    /** Days remaining until expiry (positive). Null when already expired or no expiry set. */
    daysUntilExpiry: number | null;
    /** Timestamp when the grace period ends. Null when not in grace. */
    graceEndsAt: Date | null;
}

const GRACE_PERIOD_DAYS = 5;
const WARNING_DAYS_THRESHOLD = 7;

/**
 * Derives the subscription state from the organisation's expiry/suspension data.
 *
 *  isSuspended=true               → 'suspended'
 *  subscriptionEndsAt=null        → 'active' (no expiry set = perpetual)
 *  0 < days_remaining ≤ 7        → 'warning'
 *  -5 ≤ days_overdue < 0         → 'grace'
 *  days_overdue > 5               → 'suspended' (auto-suspended post-grace)
 *  days_remaining > 7             → 'active'
 */
export function getSubscriptionState(org: SubscriptionInput): SubscriptionResult {
    if (org.isSuspended) {
        return { state: "suspended", daysUntilExpiry: null, graceEndsAt: null };
    }

    if (!org.subscriptionEndsAt) {
        // No expiry → perpetual / lifetime subscription
        return { state: "active", daysUntilExpiry: null, graceEndsAt: null };
    }

    const now = Date.now();
    const expiryMs = org.subscriptionEndsAt.getTime();
    const msDiff = expiryMs - now;
    const daysDiff = msDiff / (1000 * 60 * 60 * 24);

    if (daysDiff > WARNING_DAYS_THRESHOLD) {
        return { state: "active", daysUntilExpiry: Math.ceil(daysDiff), graceEndsAt: null };
    }

    if (daysDiff > 0) {
        // Inside the warning window (≤ 7 days left)
        return { state: "warning", daysUntilExpiry: Math.ceil(daysDiff), graceEndsAt: null };
    }

    // Past expiry — check grace window
    const daysOverdue = -daysDiff;
    if (daysOverdue <= GRACE_PERIOD_DAYS) {
        const graceEndsAt = new Date(expiryMs + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        return { state: "grace", daysUntilExpiry: null, graceEndsAt };
    }

    // More than 5 days overdue → auto-suspended
    return { state: "suspended", daysUntilExpiry: null, graceEndsAt: null };
}
