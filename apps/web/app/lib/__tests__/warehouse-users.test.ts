import { describe, it, expect } from 'vitest';
import {
    canManageWarehouseUsers,
    decideDeactivateUser,
    decideOwnerRoleChange,
    validateStaffUserInput,
    buildStaffUserData,
    validatePasswordChange,
    validateWarehouseUserType,
    ASSIGNABLE_WAREHOUSE_USER_TYPES,
} from '../warehouse-users';

// Coverage for the three end-of-B2B warehouse features (STAFF accounts,
// self-service password change, admin login block). The route handlers are
// I/O-only and not directly testable under this repo's vitest config, so all
// the actual decision/validation logic lives here and is exercised directly.

describe('canManageWarehouseUsers', () => {
    it('allows an OWNER', () => {
        expect(canManageWarehouseUsers({ warehouseUserType: 'OWNER' })).toBe(true);
    });

    it('rejects a STAFF account', () => {
        expect(canManageWarehouseUsers({ warehouseUserType: 'STAFF' })).toBe(false);
    });

    it('rejects a null warehouseUserType', () => {
        expect(canManageWarehouseUsers({ warehouseUserType: null })).toBe(false);
    });

    it('rejects a missing/undefined warehouseUserType', () => {
        expect(canManageWarehouseUsers({})).toBe(false);
    });

    it('rejects an unrecognised/garbage value', () => {
        expect(canManageWarehouseUsers({ warehouseUserType: 'ADMIN' })).toBe(false);
    });
});

describe('decideDeactivateUser', () => {
    it('blocks deactivating the last active OWNER (activeOwnerCount === 1 includes the target itself)', () => {
        const result = decideDeactivateUser({
            targetIsOwner: true,
            targetIsActive: true,
            activeOwnerCount: 1,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('آخر مالك فعّال');
        }
    });

    it('allows deactivating an active STAFF account regardless of owner count', () => {
        const result = decideDeactivateUser({
            targetIsOwner: false,
            targetIsActive: true,
            activeOwnerCount: 1,
        });
        expect(result.ok).toBe(true);
    });

    it('allows deactivating an active OWNER when another active OWNER remains', () => {
        const result = decideDeactivateUser({
            targetIsOwner: true,
            targetIsActive: true,
            activeOwnerCount: 2,
        });
        expect(result.ok).toBe(true);
    });

    it('is a no-op/allowed when reactivating (target is currently inactive, so nothing active is being lost)', () => {
        const result = decideDeactivateUser({
            targetIsOwner: true,
            targetIsActive: false,
            activeOwnerCount: 0,
        });
        expect(result.ok).toBe(true);
    });

    it('allows re-deactivating an already-inactive STAFF account (also covered by the targetIsActive === false branch)', () => {
        const result = decideDeactivateUser({
            targetIsOwner: false,
            targetIsActive: false,
            activeOwnerCount: 5,
        });
        expect(result.ok).toBe(true);
    });
});

describe('validateStaffUserInput', () => {
    it('rejects a missing email', () => {
        const result = validateStaffUserInput({ password: 'secret123' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('البريد الإلكتروني مطلوب');
    });

    it('rejects an invalid email', () => {
        const result = validateStaffUserInput({ email: 'not-an-email', password: 'secret123' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('البريد الإلكتروني غير صالح');
    });

    it('rejects a password shorter than 6 characters', () => {
        const result = validateStaffUserInput({ email: 'staff@example.com', password: '123' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    });

    it('accumulates multiple errors at once', () => {
        const result = validateStaffUserInput({ email: 'bad', password: '1' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('trims and lower-cases a valid email, and keeps the password verbatim', () => {
        const result = validateStaffUserInput({ email: '  Staff@Example.COM  ', password: 'secret123' });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.email).toBe('staff@example.com');
            expect(result.value.password).toBe('secret123');
            expect(result.value).not.toHaveProperty('name');
        }
    });

    it('keeps a trimmed optional name when provided', () => {
        const result = validateStaffUserInput({ email: 'staff@example.com', password: 'secret123', name: '  أحمد  ' });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.name).toBe('أحمد');
    });
});

describe('buildStaffUserData', () => {
    it('forces role/branchId, uses the passed-in warehouseId, and honours the passed-in warehouseUserType', () => {
        const data = buildStaffUserData('warehouse-1', 'SALES', {
            email: 'staff@example.com',
            hashedPassword: '$2a$10$hashedvalue',
        });
        expect(data.role).toBe('WAREHOUSE');
        expect(data.warehouseUserType).toBe('SALES');
        expect(data.branchId).toBeNull();
        expect(data.warehouseId).toBe('warehouse-1');
        expect(data.email).toBe('staff@example.com');
        expect(data.password).toBe('$2a$10$hashedvalue');
    });

    it('accepts any of the five assignable roles', () => {
        for (const role of ASSIGNABLE_WAREHOUSE_USER_TYPES) {
            const data = buildStaffUserData('warehouse-1', role, { email: 'a@b.com', hashedPassword: 'x' });
            expect(data.warehouseUserType).toBe(role);
        }
    });

    it('includes name only when provided', () => {
        const withName = buildStaffUserData('warehouse-1', 'SALES', {
            email: 'a@b.com',
            hashedPassword: 'x',
            name: 'موظف',
        });
        expect(withName.name).toBe('موظف');

        const withoutName = buildStaffUserData('warehouse-1', 'SALES', { email: 'a@b.com', hashedPassword: 'x' });
        expect(withoutName).not.toHaveProperty('name');
    });

    // Privilege-escalation regression test: a caller-supplied role/branchId/
    // warehouseId/warehouseUserType anywhere in the INPUT OBJECT must be
    // structurally ignored — only the separately-passed, already-validated
    // warehouseUserType argument (2nd positional param) may ever land in the
    // output, never a value smuggled inside `input`.
    it('ignores a maliciously-shaped input carrying role/branchId/warehouseId/warehouseUserType, honouring only the real argument', () => {
        const maliciousInput = {
            email: 'attacker@example.com',
            hashedPassword: 'x',
            // @ts-expect-error — deliberately probing with fields outside the declared shape
            role: 'ADMIN',
            // @ts-expect-error — deliberately probing with fields outside the declared shape
            branchId: 'some-pharmacy-branch',
            // @ts-expect-error — deliberately probing with fields outside the declared shape
            warehouseId: 'attacker-controlled-other-warehouse',
            // @ts-expect-error — deliberately probing with fields outside the declared shape
            warehouseUserType: 'OWNER',
        };
        const data = buildStaffUserData('real-caller-warehouse', 'SALES', maliciousInput);

        expect(data.role).toBe('WAREHOUSE');
        // The real 2nd-argument role wins — never the one smuggled inside `input`.
        expect(data.warehouseUserType).toBe('SALES');
        expect(data.branchId).toBeNull();
        // The real context's warehouseId wins — never the attacker-supplied one.
        expect(data.warehouseId).toBe('real-caller-warehouse');
        expect(data.warehouseId).not.toBe('attacker-controlled-other-warehouse');
    });
});

describe('validateWarehouseUserType', () => {
    it('accepts each of the five assignable roles', () => {
        for (const role of ASSIGNABLE_WAREHOUSE_USER_TYPES) {
            const result = validateWarehouseUserType(role);
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value).toBe(role);
        }
    });

    it('rejects the legacy STAFF value — it is not newly assignable', () => {
        const result = validateWarehouseUserType('STAFF');
        expect(result.ok).toBe(false);
    });

    it('rejects garbage/unrecognised/missing values', () => {
        expect(validateWarehouseUserType('ADMIN').ok).toBe(false);
        expect(validateWarehouseUserType(null).ok).toBe(false);
        expect(validateWarehouseUserType(undefined).ok).toBe(false);
        expect(validateWarehouseUserType(123).ok).toBe(false);
    });
});

describe('decideOwnerRoleChange', () => {
    it('blocks changing the role of the last active OWNER away from OWNER', () => {
        const result = decideOwnerRoleChange({ targetIsOwner: true, targetIsActive: true, activeOwnerCount: 1 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('آخر مالك فعّال');
    });

    it('allows changing the role of an OWNER when another active OWNER remains', () => {
        const result = decideOwnerRoleChange({ targetIsOwner: true, targetIsActive: true, activeOwnerCount: 2 });
        expect(result.ok).toBe(true);
    });

    it('allows changing the role of a non-OWNER regardless of owner count', () => {
        const result = decideOwnerRoleChange({ targetIsOwner: false, targetIsActive: true, activeOwnerCount: 1 });
        expect(result.ok).toBe(true);
    });

    it('allows changing the role of an inactive (already deactivated) OWNER', () => {
        const result = decideOwnerRoleChange({ targetIsOwner: true, targetIsActive: false, activeOwnerCount: 0 });
        expect(result.ok).toBe(true);
    });
});

describe('validatePasswordChange', () => {
    it('rejects a missing current password', () => {
        const result = validatePasswordChange({ newPassword: 'newsecret1' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('كلمة المرور الحالية مطلوبة');
    });

    it('rejects a new password shorter than 6 characters', () => {
        const result = validatePasswordChange({ currentPassword: 'oldsecret1', newPassword: '123' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    });

    it('rejects a new password equal to the current one (both >= 6 chars, so this exercises the equality branch specifically)', () => {
        const result = validatePasswordChange({ currentPassword: 'secret123', newPassword: 'secret123' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية');
    });

    it('accepts a valid change', () => {
        const result = validatePasswordChange({ currentPassword: 'oldsecret1', newPassword: 'newsecret2' });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.currentPassword).toBe('oldsecret1');
            expect(result.value.newPassword).toBe('newsecret2');
        }
    });
});
