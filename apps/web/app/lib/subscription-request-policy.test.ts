import { describe, expect, it } from 'vitest';
import { subscriptionWriteDenied } from './subscription-request-policy';

describe('subscription request policy', () => {
    it('allows read-only requests while suspended', () => {
        for (const method of ['GET', 'HEAD', 'OPTIONS'])
            expect(subscriptionWriteDenied('suspended', method, '/api/inventory')).toBe(false);
    });
    it('blocks every business write method and Server Actions while suspended', () => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
            for (const path of ['/api/sales', '/api/inventory', '/dashboard/suppliers'])
                expect(subscriptionWriteDenied('suspended', method, path)).toBe(true);
    });
    it('preserves session recovery without exempting normal payment writes', () => {
        for (const path of ['/api/auth/refresh', '/api/auth/change-password'])
            expect(subscriptionWriteDenied('suspended', 'POST', path)).toBe(false);
        expect(subscriptionWriteDenied('suspended', 'POST', '/api/payments/stripe')).toBe(true);
    });
    it('preserves the existing grace-period business rules', () => {
        expect(subscriptionWriteDenied('grace', 'POST', '/api/inventory')).toBe(true);
        expect(subscriptionWriteDenied('grace', 'POST', '/api/sales')).toBe(false);
        expect(subscriptionWriteDenied('active', 'POST', '/api/inventory')).toBe(false);
    });
});
