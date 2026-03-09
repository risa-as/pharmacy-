/**
 * grace-period-guard.ts
 *
 * CTO-approved list of write operations blocked during the grace period.
 * Reference: spec FR-019.
 *
 * Blocked: create user/branch, admin settings, inventory batch, supplier, drug import.
 * Allowed: POS sale, payment, invoice, return, prescription, patient, insurance, reports.
 */

interface BlockedPattern {
    /** Pathname prefix to match (startsWith) */
    path: string;
    /** HTTP method to match. If omitted, all methods are blocked for this path. */
    method?: string;
}

export const GRACE_PERIOD_BLOCKED_OPERATIONS: BlockedPattern[] = [
    { path: "/api/users",      method: "POST" },
    { path: "/api/branches",   method: "POST" },
    { path: "/api/admin",      method: "POST" },
    { path: "/api/settings",   method: "PATCH" },
    { path: "/api/settings",   method: "POST" },
    { path: "/api/inventory",  method: "POST" },
    { path: "/api/suppliers",  method: "POST" },
    { path: "/api/drugs",      method: "POST" },
];

/**
 * Returns true if the request should be blocked during the grace period.
 *
 * @param pathname  The request pathname (e.g. "/api/users")
 * @param method    The HTTP method (e.g. "POST")
 */
export function isBlockedInGracePeriod(pathname: string, method: string): boolean {
    return GRACE_PERIOD_BLOCKED_OPERATIONS.some((pattern: any) => {
        const pathMatches =
            pathname === pattern.path || pathname.startsWith(pattern.path + "/");
        if (!pathMatches) return false;
        if (pattern.method) return method.toUpperCase() === pattern.method;
        return true;
    });
}
