import { describe, it, expect } from 'vitest';
import { warehouseOrderScope, canCreateWarehouse, resolveOrderBranch } from '../warehouse-access';

// Regression coverage for the Stage 0 warehouse hardening (cross-tenant read
// leak on GET /api/warehouses/orders, and the cross-tenant write via
// POST /api/warehouses which previously trusted any ADMIN role). These pure
// functions decide the tenant scope; the route handlers are I/O-only wrappers
// around them and are not directly testable under this vitest config.

describe('warehouseOrderScope', () => {
    it('gives SUPER_ADMIN an unscoped filter', () => {
        const scope = warehouseOrderScope({ role: 'SUPER_ADMIN' });
        expect(scope).toEqual({});
    });

    it('gives ADMIN an org-scoped filter via the branch relation', () => {
        const scope = warehouseOrderScope({ role: 'ADMIN', organizationId: 'org-1' });
        expect(scope).toEqual({ branch: { organizationId: 'org-1' } });
    });

    it('gives MANAGER an org-scoped filter via the branch relation', () => {
        const scope = warehouseOrderScope({ role: 'MANAGER', organizationId: 'org-1' });
        expect(scope).toEqual({ branch: { organizationId: 'org-1' } });
    });

    it('rejects ADMIN with no organizationId', () => {
        const scope = warehouseOrderScope({ role: 'ADMIN' });
        expect(scope).toBeNull();
    });

    it('gives PHARMACIST a branchId filter', () => {
        const scope = warehouseOrderScope({ role: 'PHARMACIST', branchId: 'branch-1' });
        expect(scope).toEqual({ branchId: 'branch-1' });
    });

    it('gives CASHIER a branchId filter', () => {
        const scope = warehouseOrderScope({ role: 'CASHIER', branchId: 'branch-1' });
        expect(scope).toEqual({ branchId: 'branch-1' });
    });

    it('rejects a non-admin with no branchId (=> 403)', () => {
        const scope = warehouseOrderScope({ role: 'CASHIER' });
        expect(scope).toBeNull();
    });

    it('ignores organizationId/branchId noise for SUPER_ADMIN and stays unscoped', () => {
        const scope = warehouseOrderScope({ role: 'SUPER_ADMIN', organizationId: 'org-1', branchId: 'branch-1' });
        expect(scope).toEqual({});
    });

    // Stage 1 regression: a WAREHOUSE identity (app/lib/warehouse-context.ts)
    // has no branchId/organizationId by design and must never reach a
    // pharmacy-tenant WarehouseOrder query. Without this, WAREHOUSE would
    // fall through to the generic non-admin branch below and — because it
    // has no branchId — would correctly get `null` today, but only by
    // accident of that fallback's shape. Assert the safe behavior explicitly
    // so it can't silently regress if that fallback ever changes.
    it('rejects WAREHOUSE unconditionally — never an unscoped {} and never a scope at all', () => {
        const scope = warehouseOrderScope({ role: 'WAREHOUSE' });
        expect(scope).toBeNull();
        expect(scope).not.toEqual({});
    });

    it('rejects WAREHOUSE even if a branchId/organizationId is somehow present on the identity', () => {
        // Possessing these fields must not grant a pharmacy-tenant scope —
        // the same isolation property warehouse-context.test.ts asserts for
        // decideWarehouseContext().
        const scope = warehouseOrderScope({ role: 'WAREHOUSE', branchId: 'branch-1', organizationId: 'org-1' });
        expect(scope).toBeNull();
    });
});

describe('canCreateWarehouse', () => {
    it('is true for SUPER_ADMIN', () => {
        expect(canCreateWarehouse('SUPER_ADMIN')).toBe(true);
    });

    // This is the regression that matters: warehouses are a globally-shared,
    // platform-owned table (Warehouse.code is @unique with no organizationId).
    // Any pharmacy ADMIN being able to create one lets them squat another
    // tenant's warehouse code. Only SUPER_ADMIN may create warehouses now.
    it('is false for ADMIN', () => {
        expect(canCreateWarehouse('ADMIN')).toBe(false);
    });

    it('is false for MANAGER', () => {
        expect(canCreateWarehouse('MANAGER')).toBe(false);
    });

    it('is false for PHARMACIST', () => {
        expect(canCreateWarehouse('PHARMACIST')).toBe(false);
    });

    it('is false for CASHIER', () => {
        expect(canCreateWarehouse('CASHIER')).toBe(false);
    });
});

describe('resolveOrderBranch', () => {
    it('always uses the caller\'s own branchId, ignoring a requested branchId', () => {
        const result = resolveOrderBranch(
            { role: 'CASHIER', branchId: 'my-branch' },
            'someone-elses-branch'
        );
        expect(result).toEqual({ branchId: 'my-branch' });
    });

    it('uses the caller\'s own branchId when no branchId was requested', () => {
        const result = resolveOrderBranch({ role: 'PHARMACIST', branchId: 'my-branch' });
        expect(result).toEqual({ branchId: 'my-branch' });
    });

    it('requires organization validation for an admin requested branch', () => {
        expect(resolveOrderBranch({role:'ADMIN',organizationId:'org',branchId:'own'},'foreign')).toEqual({needsOrgBranchCheck:'foreign'});
    });

    it('flags a requested branchId for an org-check when the caller has no own branch', () => {
        const result = resolveOrderBranch(
            { role: 'ADMIN', organizationId: 'org-1' },
            'requested-branch'
        );
        expect(result).toEqual({ needsOrgBranchCheck: 'requested-branch' });
    });

    it('rejects when the caller has no own branch and no requested branch', () => {
        const result = resolveOrderBranch({ role: 'ADMIN', organizationId: 'org-1' });
        expect(result).toBeNull();
    });
});
