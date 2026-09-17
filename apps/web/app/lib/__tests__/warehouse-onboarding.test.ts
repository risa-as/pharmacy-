import { describe, it, expect } from 'vitest';
import {
    validateWarehouseOnboarding,
    validateWarehouseFields,
    validatePasswordReset,
} from '../warehouse-onboarding';

// Coverage for the Pass 3 مذخر-onboarding validator. The route handler
// (app/api/admin/warehouses/route.ts) is I/O-only and not directly testable
// under this repo's vitest config, so all the actual validation/normalisation
// logic lives here and is exercised directly.

const validInput = {
    warehouse: {
        name: '  مذخر النور  ',
        code: 'WM-001',
        phone: '07700000001',
        city: 'بغداد',
    },
    owner: {
        email: '  OWNER@Example.COM  ',
        password: 'secret123',
        name: 'أبو أحمد',
    },
};

describe('validateWarehouseOnboarding', () => {
    it('rejects a missing warehouse name', () => {
        const result = validateWarehouseOnboarding({
            warehouse: {},
            owner: { email: 'owner@example.com', password: 'secret1' },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('اسم المذخر مطلوب');
        }
    });

    it('rejects a blank (whitespace-only) warehouse name', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: '   ' },
            owner: { email: 'owner@example.com', password: 'secret1' },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('اسم المذخر مطلوب');
        }
    });

    it('rejects an invalid owner email', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: 'مذخر النور' },
            owner: { email: 'not-an-email', password: 'secret1' },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('البريد الإلكتروني غير صالح');
        }
    });

    it('rejects a missing owner email', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: 'مذخر النور' },
            owner: { password: 'secret1' },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('البريد الإلكتروني لحساب المذخر مطلوب');
        }
    });

    it('rejects a password shorter than 6 characters', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: 'مذخر النور' },
            owner: { email: 'owner@example.com', password: '12345' },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        }
    });

    it('accepts a fully valid input and normalises the values', () => {
        const result = validateWarehouseOnboarding(validInput);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.warehouse.name).toBe('مذخر النور');
            expect(result.value.owner.email).toBe('owner@example.com');
            expect(result.value.owner.password).toBe('secret123');
            expect(result.value.warehouse.code).toBe('WM-001');
            expect(result.value.warehouse.city).toBe('بغداد');
        }
    });

    it('accumulates multiple errors at once rather than stopping at the first', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: '' },
            owner: { email: 'bad-email', password: '123' },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('never lets a valid result carry a branchId, even if the caller tries to smuggle one in', () => {
        const result = validateWarehouseOnboarding({
            // @ts-expect-error — deliberately probing with fields outside the declared shape
            branchId: 'sneaky-branch',
            warehouse: { name: 'مذخر النور' },
            owner: {
                email: 'owner@example.com',
                password: 'secret123',
                // @ts-expect-error — deliberately probing with fields outside the declared shape
                branchId: 'sneaky-branch',
            },
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).not.toHaveProperty('branchId');
            expect(result.value.owner).not.toHaveProperty('branchId');
            expect(result.value.warehouse).not.toHaveProperty('branchId');
            expect(JSON.stringify(result.value)).not.toContain('branchId');
        }
    });

    // مالك المذخر هو نفسه «الشخص المسؤول» — لا يوجد حقل «اسم المالك» في النموذج،
    // فاسم حساب المالك يُشتق من contactPerson ثم من اسم المذخر كملاذ أخير.
    it('يشتق اسم المالك من الشخص المسؤول عند غيابه', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: 'نسيم البحر', contactPerson: 'اياد قائد اسماعيل' },
            owner: { email: 'a@b.com', password: 'secret123' },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.owner.name).toBe('اياد قائد اسماعيل');
    });

    it('يعود لاسم المذخر عندما لا يوجد شخص مسؤول', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: 'نسيم البحر' },
            owner: { email: 'a@b.com', password: 'secret123' },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.owner.name).toBe('نسيم البحر');
    });

    it('يحترم owner.name الصريح إن أُرسل عبر الـ API', () => {
        const result = validateWarehouseOnboarding({
            warehouse: { name: 'نسيم البحر', contactPerson: 'الشخص المسؤول' },
            owner: { email: 'a@b.com', password: 'secret123', name: 'اسم صريح' },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.owner.name).toBe('اسم صريح');
    });
});

// Coverage for the Task 4 (PATCH /api/admin/warehouses/[id]) shared field
// validator — extracted out of validateWarehouseOnboarding so both the
// onboarding route and the edit route enforce identical rules.
describe('validateWarehouseFields', () => {
    it('rejects a missing name', () => {
        const result = validateWarehouseFields({});
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('اسم المذخر مطلوب');
    });

    it('rejects a blank (whitespace-only) name', () => {
        const result = validateWarehouseFields({ name: '   ' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('اسم المذخر مطلوب');
    });

    it('trims a valid name', () => {
        const result = validateWarehouseFields({ name: '  مذخر الفرات  ' });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.name).toBe('مذخر الفرات');
    });

    it('normalises blank optional fields to undefined (absent from value)', () => {
        const result = validateWarehouseFields({
            name: 'مذخر الفرات',
            phone: '   ',
            city: '',
            contactPerson: undefined,
            address: '   ',
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).not.toHaveProperty('phone');
            expect(result.value).not.toHaveProperty('city');
            expect(result.value).not.toHaveProperty('contactPerson');
            expect(result.value).not.toHaveProperty('address');
        }
    });

    it('trims and keeps valid optional fields', () => {
        const result = validateWarehouseFields({
            name: 'مذخر الفرات',
            phone: ' 07700000002 ',
            city: ' بغداد ',
            contactPerson: ' أبو علي ',
            address: ' شارع الرشيد ',
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.phone).toBe('07700000002');
            expect(result.value.city).toBe('بغداد');
            expect(result.value.contactPerson).toBe('أبو علي');
            expect(result.value.address).toBe('شارع الرشيد');
        }
    });
});

// Coverage for the Task 2 (POST /api/admin/warehouses/[id]/reset-password)
// pure password-length rule — mirrors auth.ts's z.string().min(6).
describe('validatePasswordReset', () => {
    it('rejects a password shorter than 6 characters', () => {
        const result = validatePasswordReset({ password: '12345' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toContain('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    });

    it('rejects a missing password', () => {
        const result = validatePasswordReset({});
        expect(result.ok).toBe(false);
    });

    it('accepts a password of exactly 6 characters', () => {
        const result = validatePasswordReset({ password: '123456' });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.password).toBe('123456');
    });

    it('accepts a longer password', () => {
        const result = validatePasswordReset({ password: 'a-much-longer-secret' });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.password).toBe('a-much-longer-secret');
    });
});
