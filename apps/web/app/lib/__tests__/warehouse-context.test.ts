import { describe, it, expect } from 'vitest';
import { decideWarehouseContext, isWarehouseRole } from '../warehouse-context';

// Stage 1 of the المذاخر (Warehouses/B2B) feature — identity-layer isolation.
// decideWarehouseContext() is the single gate deciding whether a caller may
// act as a warehouse. These tests are the exit criterion for Stage 1: the
// property that matters is that *possessing* a warehouseId on the identity
// never grants access without the WAREHOUSE role.

describe('decideWarehouseContext', () => {
    it('grants access to a WAREHOUSE role with a warehouseId', () => {
        const decision = decideWarehouseContext({ role: 'WAREHOUSE', warehouseId: 'wh-1' });
        expect(decision).toEqual({ ok: true, warehouseId: 'wh-1' });
    });

    it('fails closed for a WAREHOUSE role with no warehouseId (misconfigured account)', () => {
        const decision = decideWarehouseContext({ role: 'WAREHOUSE' });
        expect(decision).toEqual({ ok: false, status: 403, error: expect.any(String) });
    });

    it('fails closed for a WAREHOUSE role with an empty-string warehouseId', () => {
        const decision = decideWarehouseContext({ role: 'WAREHOUSE', warehouseId: '' });
        expect(decision.ok).toBe(false);
        expect((decision as any).status).toBe(403);
    });

    // The isolation property: each of these roles is rejected even when a
    // warehouseId is somehow present on the identity. Possessing the field
    // must not substitute for having the role.
    for (const role of ['ADMIN', 'SUPER_ADMIN', 'PHARMACIST', 'CASHIER']) {
        it(`rejects ${role} even when a warehouseId is present on the identity`, () => {
            const decision = decideWarehouseContext({ role, warehouseId: 'wh-1' });
            expect(decision).toEqual({ ok: false, status: 403, error: expect.any(String) });
        });
    }

    it('rejects an unknown/garbage role string', () => {
        const decision = decideWarehouseContext({ role: 'NOT_A_REAL_ROLE', warehouseId: 'wh-1' });
        expect(decision).toEqual({ ok: false, status: 403, error: expect.any(String) });
    });

    it('returns 401 when there is no role at all (no identity)', () => {
        const decision = decideWarehouseContext({ role: '' });
        expect(decision).toEqual({ ok: false, status: 401, error: expect.any(String) });
    });
});

describe('isWarehouseRole', () => {
    it('is true only for WAREHOUSE', () => {
        expect(isWarehouseRole('WAREHOUSE')).toBe(true);
    });

    for (const role of ['ADMIN', 'SUPER_ADMIN', 'PHARMACIST', 'CASHIER', '', 'GARBAGE']) {
        it(`is false for ${JSON.stringify(role)}`, () => {
            expect(isWarehouseRole(role)).toBe(false);
        });
    }
});
