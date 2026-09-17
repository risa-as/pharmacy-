import { describe, it, expect } from 'vitest';
import { getDefaultPermissions, getUserPermissions } from '../permissions';

// Regression coverage for the fail-closed fix made as part of Phase 3
// (الأدوار والصلاحيات) of the warehouse/B2B feature: getDefaultPermissions()
// used to fall through its switch's `default` branch straight to
// CASHIER_DEFAULTS, so any unrecognised role — most notably WAREHOUSE, added
// by an earlier phase — silently inherited a fairly permissive cashier
// permission set (canSell, canViewSales, canViewInventory, canViewPatients,
// canViewDebts, canPayDebt all true) it was never meant to have.

describe('getDefaultPermissions — fail-closed fallback', () => {
    it('WAREHOUSE no longer gets CASHIER’s permissive default set', () => {
        const warehouseDefaults = getDefaultPermissions('WAREHOUSE');
        const cashierDefaults = getDefaultPermissions('CASHIER');
        expect(warehouseDefaults).not.toEqual(cashierDefaults);
    });

    it('WAREHOUSE (and any other unrecognised role) is entirely false — fail closed', () => {
        const warehouseDefaults = getDefaultPermissions('WAREHOUSE');
        for (const value of Object.values(warehouseDefaults)) {
            expect(value).toBe(false);
        }
    });

    it('a garbage/typo role is also entirely false — fail closed', () => {
        const defaults = getDefaultPermissions('NOT_A_REAL_ROLE');
        for (const value of Object.values(defaults)) {
            expect(value).toBe(false);
        }
    });

    it('SUPER_ADMIN keeps full (ADMIN-equivalent) access — explicit case, not the fail-closed fallback', () => {
        expect(getDefaultPermissions('SUPER_ADMIN')).toEqual(getDefaultPermissions('ADMIN'));
    });

    it('ADMIN, PHARMACIST and CASHIER are unaffected by the fallback change', () => {
        expect(getDefaultPermissions('ADMIN').canManageUsers).toBe(true);
        expect(getDefaultPermissions('PHARMACIST').canSell).toBe(true);
        expect(getDefaultPermissions('CASHIER').canSell).toBe(true);
        expect(getDefaultPermissions('CASHIER').canManageUsers).toBe(false);
    });

    it('permission overrides are allowlisted and must be booleans', () => {
        const permissions = getUserPermissions({
            role: 'CASHIER',
            permissions: JSON.stringify({ canSell: 'false', canManageUsers: true, unknown: true }),
        });
        expect(permissions.canSell).toBe(true);
        expect(permissions.canManageUsers).toBe(true);
        expect((permissions as Record<string, unknown>).unknown).toBeUndefined();
    });
});
