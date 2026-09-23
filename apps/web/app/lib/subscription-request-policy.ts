import { isBlockedInGracePeriod } from './grace-period-guard';

// Set by middleware, never accepted from a caller. Used by Node-side guards
// after reading the current organisation, not by the stale edge JWT.
export const REQUEST_METHOD_HEADER = 'x-faramace-request-method';
export const REQUEST_PATH_HEADER = 'x-faramace-request-path';
export const SUBSCRIPTION_READ_ONLY = 'SUBSCRIPTION_READ_ONLY';

const recoveryPaths = new Set([
    '/api/auth/change-password', '/api/auth/login', '/api/auth/refresh',
    '/api/payment/callback',
    // Acknowledging one's notifications is session metadata, not a business write.
    '/api/notifications/in-app',
]);

export function subscriptionWriteDenied(state: string, method: string, pathname: string): boolean {
    if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return false;
    if (recoveryPaths.has(pathname) || pathname.startsWith('/api/auth/')) return false;
    if (state === 'suspended') return true;
    return state === 'grace' && isBlockedInGracePeriod(pathname, method);
}
