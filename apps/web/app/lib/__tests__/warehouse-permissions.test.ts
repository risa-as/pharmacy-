import { describe, it, expect } from 'vitest';
import {
    accessiblePages,
    getWarehouseDefaultPermissions,
    getWarehousePermissions,
    hasWarehousePermission,
    ineffectivePermissions,
    WAREHOUSE_PAGES,
    WAREHOUSE_PERMISSION_LABELS,
    type WarehousePermissions,
} from '../warehouse-permissions';

// Phase 3 (الأدوار والصلاحيات) من نظام المذاخر B2B — coverage for the pure
// role-defaults matrix and the per-user JSON override merge. Mirrors the
// spirit of app/lib/permissions.ts's own (currently untested) design, but
// this module gets its own explicit table-driven suite per the brief.

const ALL_KEYS: (keyof WarehousePermissions)[] = [
    'canViewOrders', 'canQuoteOrders', 'canShipOrders',
    'canViewCatalog', 'canEditCatalog', 'canEditPricing', 'canImportCatalog',
    'canViewStock', 'canReceiveStock', 'canAdjustStock', 'canWriteOffStock',
    'canViewCustomers', 'canEditCustomerTerms', 'canViewFinance', 'canRecordPayment',
    'canViewPurchases', 'canCreatePurchase', 'canPaySupplier',
    'canViewReports', 'canManageUsers', 'canChangeSettings',
    'canViewReps', 'canManageReps', 'canSellField',
];

function allFalse(): WarehousePermissions {
    return Object.fromEntries(ALL_KEYS.map((k) => [k, false])) as unknown as WarehousePermissions;
}

// The exact matrix from the brief — table-driven, full-object assertions per role.
const MATRIX: Record<string, WarehousePermissions> = {
    OWNER: {
        canViewOrders: true, canQuoteOrders: true, canShipOrders: true,
        canViewCatalog: true, canEditCatalog: true, canEditPricing: true, canImportCatalog: true,
        canViewStock: true, canReceiveStock: true, canAdjustStock: true, canWriteOffStock: true,
        canViewCustomers: true, canEditCustomerTerms: true, canViewFinance: true, canRecordPayment: true,
        canViewPurchases: true, canCreatePurchase: true, canPaySupplier: true,
        canViewReports: true, canManageUsers: true, canChangeSettings: true,
        canViewReps: true, canManageReps: true, canSellField: true,
    },
    MANAGER: {
        canViewOrders: true, canQuoteOrders: true, canShipOrders: true,
        canViewCatalog: true, canEditCatalog: true, canEditPricing: true, canImportCatalog: true,
        canViewStock: true, canReceiveStock: true, canAdjustStock: true, canWriteOffStock: true,
        canViewCustomers: true, canEditCustomerTerms: true, canViewFinance: true, canRecordPayment: false,
        canViewPurchases: true, canCreatePurchase: true, canPaySupplier: false,
        canViewReports: true, canManageUsers: false, canChangeSettings: false,
        canViewReps: true, canManageReps: true, canSellField: true,
    },
    SALES: {
        canViewOrders: true, canQuoteOrders: true, canShipOrders: true,
        canViewCatalog: true, canEditCatalog: false, canEditPricing: false, canImportCatalog: false,
        canViewStock: true, canReceiveStock: false, canAdjustStock: false, canWriteOffStock: false,
        canViewCustomers: true, canEditCustomerTerms: false, canViewFinance: false, canRecordPayment: false,
        canViewPurchases: false, canCreatePurchase: false, canPaySupplier: false,
        canViewReports: true, canManageUsers: false, canChangeSettings: false,
        // SALES يملك canViewReps: صفحة /warehouse/reps محروسة به، وبدونه يُمنع
        // مندوب المبيعات من الصفحة التي يبيع منها فتصبح canSellField بلا أثر.
        // canManageReps تبقى للمالك/المدير — المندوب لا يضبط عمولة نفسه.
        canViewReps: true, canManageReps: false, canSellField: true,
    },
    INVENTORY: {
        canViewOrders: true, canQuoteOrders: false, canShipOrders: true,
        canViewCatalog: true, canEditCatalog: true, canEditPricing: false, canImportCatalog: true,
        canViewStock: true, canReceiveStock: true, canAdjustStock: true, canWriteOffStock: true,
        canViewCustomers: false, canEditCustomerTerms: false, canViewFinance: false, canRecordPayment: false,
        canViewPurchases: true, canCreatePurchase: true, canPaySupplier: false,
        canViewReports: true, canManageUsers: false, canChangeSettings: false,
        canViewReps: false, canManageReps: false, canSellField: false,
    },
    ACCOUNTANT: {
        canViewOrders: true, canQuoteOrders: false, canShipOrders: false,
        canViewCatalog: true, canEditCatalog: false, canEditPricing: false, canImportCatalog: false,
        canViewStock: false, canReceiveStock: false, canAdjustStock: false, canWriteOffStock: false,
        canViewCustomers: true, canEditCustomerTerms: false, canViewFinance: true, canRecordPayment: true,
        canViewPurchases: true, canCreatePurchase: false, canPaySupplier: true,
        canViewReports: true, canManageUsers: false, canChangeSettings: false,
        canViewReps: true, canManageReps: false, canSellField: false,
    },
};

describe('getWarehouseDefaultPermissions — full role matrix', () => {
    for (const [role, expected] of Object.entries(MATRIX)) {
        it(`returns the exact matrix for ${role}`, () => {
            expect(getWarehouseDefaultPermissions(role)).toEqual(expected);
        });
    }

    it('legacy STAFF is an exact synonym for SALES', () => {
        expect(getWarehouseDefaultPermissions('STAFF')).toEqual(MATRIX.SALES);
    });

    it('null fails closed: every key false', () => {
        expect(getWarehouseDefaultPermissions(null)).toEqual(allFalse());
    });

    it('undefined fails closed: every key false', () => {
        expect(getWarehouseDefaultPermissions(undefined)).toEqual(allFalse());
    });

    it('empty string fails closed: every key false', () => {
        expect(getWarehouseDefaultPermissions('')).toEqual(allFalse());
    });

    it('an unrecognised/garbage role fails closed: every key false', () => {
        expect(getWarehouseDefaultPermissions('SUPER_ADMIN')).toEqual(allFalse());
        expect(getWarehouseDefaultPermissions('WAREHOUSE_ADMIN_TYPO')).toEqual(allFalse());
    });
});

describe('getWarehousePermissions — per-user JSON override', () => {
    it('with no permissions column set, returns exactly the role default', () => {
        expect(getWarehousePermissions({ warehouseUserType: 'SALES', permissions: null })).toEqual(MATRIX.SALES);
    });

    it('an override flips exactly one key without disturbing the others', () => {
        const result = getWarehousePermissions({
            warehouseUserType: 'SALES',
            permissions: JSON.stringify({ canRecordPayment: true }),
        });
        expect(result).toEqual({ ...MATRIX.SALES, canRecordPayment: true });
    });

    it('an override can turn OFF a key that defaults to true, without disturbing the others', () => {
        const result = getWarehousePermissions({
            warehouseUserType: 'OWNER',
            permissions: JSON.stringify({ canManageUsers: false }),
        });
        expect(result).toEqual({ ...MATRIX.OWNER, canManageUsers: false });
    });

    it('malformed JSON in permissions falls back to role defaults without throwing', () => {
        expect(() =>
            getWarehousePermissions({ warehouseUserType: 'MANAGER', permissions: '{not valid json' })
        ).not.toThrow();
        const result = getWarehousePermissions({ warehouseUserType: 'MANAGER', permissions: '{not valid json' });
        expect(result).toEqual(MATRIX.MANAGER);
    });

    it('a non-object JSON value (array/string/number) falls back to role defaults', () => {
        expect(getWarehousePermissions({ warehouseUserType: 'SALES', permissions: '[1,2,3]' })).toEqual(MATRIX.SALES);
        expect(getWarehousePermissions({ warehouseUserType: 'SALES', permissions: '"hello"' })).toEqual(MATRIX.SALES);
        expect(getWarehousePermissions({ warehouseUserType: 'SALES', permissions: '42' })).toEqual(MATRIX.SALES);
    });

    it('unknown keys and non-boolean values in the override are ignored (whitelist)', () => {
        const result = getWarehousePermissions({
            warehouseUserType: 'SALES',
            permissions: JSON.stringify({ canManageUsers: 'yes', totallyMadeUpKey: true, canRecordPayment: true }),
        });
        // canManageUsers stays false (junk non-boolean value rejected), the
        // made-up key is dropped, and the one valid boolean override lands.
        expect(result).toEqual({ ...MATRIX.SALES, canRecordPayment: true });
    });

    // Design decision (documented in warehouse-permissions.ts): overrides are
    // NOT capped by the role's ceiling — mirrors
    // app/ui/users/permissions-editor.tsx on the pharmacy side, which stores
    // the raw diff from getDefaultPermissions(role) with no ceiling check.
    // An override CAN grant a capability that is false by default for that
    // role.
    it('an override CAN grant a capability that is false by default for that role (uncapped by design)', () => {
        const result = getWarehousePermissions({
            warehouseUserType: 'SALES', // canRecordPayment is false by default for SALES
            permissions: JSON.stringify({ canRecordPayment: true }),
        });
        expect(result.canRecordPayment).toBe(true);

        const inventoryResult = getWarehousePermissions({
            warehouseUserType: 'INVENTORY', // canManageUsers is false by default for INVENTORY
            permissions: JSON.stringify({ canManageUsers: true }),
        });
        expect(inventoryResult.canManageUsers).toBe(true);
    });

    // The one ceiling that DOES hold: fail-closed binds the override too. An
    // unrecognised/null warehouseUserType must not be rescued into ANY
    // capability by a permissive override JSON blob — the override is
    // ignored entirely, not just capped.
    it('fail-closed applies to the override too: unknown type + permissive override JSON -> still all false', () => {
        const result = getWarehousePermissions({
            warehouseUserType: null,
            permissions: JSON.stringify({
                canManageUsers: true,
                canRecordPayment: true,
                canWriteOffStock: true,
                canChangeSettings: true,
            }),
        });
        expect(result).toEqual(allFalse());
    });

    it('fail-closed + permissive override also holds for an unrecognised/garbage type string', () => {
        const result = getWarehousePermissions({
            warehouseUserType: 'GARBAGE_ROLE',
            permissions: JSON.stringify({ canManageUsers: true }),
        });
        expect(result).toEqual(allFalse());
    });
});

describe('hasWarehousePermission', () => {
    it('reads a single key through the same merge logic', () => {
        expect(hasWarehousePermission({ warehouseUserType: 'ACCOUNTANT' }, 'canRecordPayment')).toBe(true);
        expect(hasWarehousePermission({ warehouseUserType: 'ACCOUNTANT' }, 'canAdjustStock')).toBe(false);
    });

    it('fails closed for an unrecognised type regardless of override', () => {
        expect(
            hasWarehousePermission(
                { warehouseUserType: undefined, permissions: JSON.stringify({ canManageUsers: true }) },
                'canManageUsers'
            )
        ).toBe(false);
    });
});

// ── accessiblePages / ineffectivePermissions ─────────────────────────────
// Pure helpers added for the permissions-panel redesign (product owner's
// ask: "make it obvious which pages/actions a toggle actually unlocks").
// Both read WAREHOUSE_PAGES / WAREHOUSE_PERMISSION_LABELS as their only
// source of truth — the same constant app/warehouse/layout.tsx now derives
// its TABS from — so this suite doubles as a pin against that constant
// drifting from the brief's page→permission table.

function allTrue(): WarehousePermissions {
    return Object.fromEntries(ALL_KEYS.map((k) => [k, true])) as unknown as WarehousePermissions;
}

describe('accessiblePages', () => {
    it('with every permission off, still includes the two ungated pages (الرئيسية والإعدادات) and nothing else', () => {
        const result = accessiblePages(getWarehouseDefaultPermissions(null)); // fail-closed: all false
        expect(result).toEqual([
            { href: '/warehouse', label: 'الرئيسية' },
            { href: '/warehouse/settings', label: 'الإعدادات' },
        ]);
    });

    it('canViewOrders alone unlocks الطلبات and الإرجاعات together, alongside the two ungated pages', () => {
        const result = accessiblePages({ ...allFalse(), canViewOrders: true });
        expect(result).toEqual([
            { href: '/warehouse', label: 'الرئيسية' },
            { href: '/warehouse/orders', label: 'الطلبات' },
            { href: '/warehouse/returns', label: 'الإرجاعات' },
            { href: '/warehouse/settings', label: 'الإعدادات' },
        ]);
    });

    it('with every permission on, returns exactly the WAREHOUSE_PAGES table, in order (pins the page↔permission map to the brief)', () => {
        const result = accessiblePages(allTrue());
        expect(result).toEqual(
            WAREHOUSE_PAGES.map((p) => ({ href: p.href, label: p.label }))
        );
        expect(result).toEqual([
            { href: '/warehouse', label: 'الرئيسية' },
            { href: '/warehouse/orders', label: 'الطلبات' },
            { href: '/warehouse/returns', label: 'الإرجاعات' },
            { href: '/warehouse/reps', label: 'المندوبون' },
            { href: '/warehouse/catalog', label: 'أدويتي' },
            { href: '/warehouse/stock', label: 'المخزون' },
            { href: '/warehouse/labels', label: 'الملصقات' },
            { href: '/warehouse/customers', label: 'العملاء' },
            { href: '/warehouse/accounts', label: 'الحسابات' },
            { href: '/warehouse/purchases', label: 'المشتريات' },
            { href: '/warehouse/reports', label: 'التقارير' },
            { href: '/warehouse/users', label: 'المستخدمون' },
            { href: '/warehouse/settings', label: 'الإعدادات' },
        ]);
    });
});

// مشتريات المذخر وذممه الدائنة: المفاتيح الثلاثة الجديدة تتبع المصفوفة
// المحدَّدة في هذه المهمة حرفياً (canViewPurchases: OWNER/MANAGER/INVENTORY/
// ACCOUNTANT بلا SALES؛ canCreatePurchase: OWNER/MANAGER/INVENTORY فقط؛
// canPaySupplier: OWNER/ACCOUNTANT فقط، مرآة فصل الواجبات في canRecordPayment).
// التأكيدات الكاملة على المصفوفة موجودة أصلاً ضمن MATRIX أعلاه — هذا القسم
// اختبار مباشر مركَّز على المفاتيح الثلاثة تحديداً بمعزل عن باقي المصفوفة.
describe('canViewPurchases / canCreatePurchase / canPaySupplier — المصفوفة الجديدة', () => {
    it('canViewPurchases: true لكل من OWNER وMANAGER وINVENTORY وACCOUNTANT', () => {
        for (const role of ['OWNER', 'MANAGER', 'INVENTORY', 'ACCOUNTANT']) {
            expect(getWarehouseDefaultPermissions(role).canViewPurchases).toBe(true);
        }
    });

    it('canViewPurchases: false لـ SALES تحديداً (والدور القديم المرادف STAFF)', () => {
        expect(getWarehouseDefaultPermissions('SALES').canViewPurchases).toBe(false);
        expect(getWarehouseDefaultPermissions('STAFF').canViewPurchases).toBe(false);
    });

    it('canCreatePurchase: true لـ OWNER وMANAGER وINVENTORY فقط', () => {
        for (const role of ['OWNER', 'MANAGER', 'INVENTORY']) {
            expect(getWarehouseDefaultPermissions(role).canCreatePurchase).toBe(true);
        }
        for (const role of ['SALES', 'ACCOUNTANT']) {
            expect(getWarehouseDefaultPermissions(role).canCreatePurchase).toBe(false);
        }
    });

    it('canPaySupplier: true لـ OWNER وACCOUNTANT فقط — MANAGER مستثنى عمداً (فصل الواجبات، كـ canRecordPayment)', () => {
        expect(getWarehouseDefaultPermissions('OWNER').canPaySupplier).toBe(true);
        expect(getWarehouseDefaultPermissions('ACCOUNTANT').canPaySupplier).toBe(true);
        expect(getWarehouseDefaultPermissions('MANAGER').canPaySupplier).toBe(false);
        for (const role of ['SALES', 'INVENTORY']) {
            expect(getWarehouseDefaultPermissions(role).canPaySupplier).toBe(false);
        }
    });

    it('غياب canViewPurchases يُبطل canCreatePurchase/canPaySupplier عملياً (ineffectivePermissions)', () => {
        expect(ineffectivePermissions({ ...allFalse(), canCreatePurchase: true })).toEqual([
            { key: 'canCreatePurchase', label: 'تسجيل فاتورة شراء', requiresLabel: 'عرض المشتريات' },
        ]);
        expect(ineffectivePermissions({ ...allFalse(), canPaySupplier: true })).toEqual([
            { key: 'canPaySupplier', label: 'تسجيل دفعة لمورّد', requiresLabel: 'عرض المشتريات' },
        ]);
        expect(
            ineffectivePermissions({ ...allFalse(), canCreatePurchase: true, canViewPurchases: true })
        ).toEqual([]);
    });
});

// المندوبون (بيع ميداني): المفاتيح الثلاثة الجديدة تتبع المصفوفة المحدَّدة في
// هذه المهمة حرفياً — بما فيها الفجوة المقصودة صراحة في المواصفة نفسها:
// canSellField ممنوحة لـ SALES بينما canViewReps (التي يتطلبها canSellField
// عبر requiresPermission) ممنوحة فقط لـ OWNER/MANAGER/ACCOUNTANT، لا SALES.
// هذا القسم يثبت المصفوفة كما وردت بالضبط — التماسك المفقود لـ SALES تحديداً
// يظهر في قسم ineffectivePermissions أدناه (اختبار التماسك ذو الأدوار الخمسة)
// وهو **متوقَّع أن يفشل** هناك، لا هنا.
describe('canViewReps / canManageReps / canSellField — المصفوفة الجديدة (المندوبون)', () => {
    it('canViewReps: لكل من يبيع أو يتابع مالياً — INVENTORY وحده مستثنى', () => {
        // SALES مشمول عمداً: صفحة /warehouse/reps محروسة بـ canViewReps، فبدونه
        // تصبح canSellField صلاحية بلا أثر (رصدها اختبار تماسك الأدوار الخمسة).
        for (const role of ['OWNER', 'MANAGER', 'ACCOUNTANT', 'SALES']) {
            expect(getWarehouseDefaultPermissions(role).canViewReps).toBe(true);
        }
        // أمين المخزن لا شأن له بالمندوبين ولا بعمولاتهم.
        expect(getWarehouseDefaultPermissions('INVENTORY').canViewReps).toBe(false);
    });

    it('canManageReps: true لـ OWNER وMANAGER فقط', () => {
        for (const role of ['OWNER', 'MANAGER']) {
            expect(getWarehouseDefaultPermissions(role).canManageReps).toBe(true);
        }
        for (const role of ['SALES', 'INVENTORY', 'ACCOUNTANT']) {
            expect(getWarehouseDefaultPermissions(role).canManageReps).toBe(false);
        }
    });

    it('canSellField: true لـ OWNER وMANAGER وSALES', () => {
        for (const role of ['OWNER', 'MANAGER', 'SALES']) {
            expect(getWarehouseDefaultPermissions(role).canSellField).toBe(true);
        }
        for (const role of ['INVENTORY', 'ACCOUNTANT']) {
            expect(getWarehouseDefaultPermissions(role).canSellField).toBe(false);
        }
    });

    it('canManageReps وcanSellField يتطلبان canViewReps عبر requiresPermission', () => {
        expect(WAREHOUSE_PERMISSION_LABELS.canManageReps.requiresPermission).toBe('canViewReps');
        expect(WAREHOUSE_PERMISSION_LABELS.canSellField.requiresPermission).toBe('canViewReps');
    });

    it('canManageReps مُعلَّمة sensitive', () => {
        expect(WAREHOUSE_PERMISSION_LABELS.canManageReps.sensitive).toBe(true);
    });

    it('غياب canViewReps يُبطل canManageReps عملياً (ineffectivePermissions) — الحالة العامة، بمعزل عن SALES', () => {
        expect(ineffectivePermissions({ ...allFalse(), canManageReps: true })).toEqual([
            { key: 'canManageReps', label: 'إدارة المندوبين', requiresLabel: 'عرض المندوبين' },
        ]);
        expect(
            ineffectivePermissions({ ...allFalse(), canManageReps: true, canViewReps: true })
        ).toEqual([]);
    });
});

describe('ineffectivePermissions', () => {
    it('flags canRecordPayment: true with canViewFinance: false as ineffective (the exact trap from the brief)', () => {
        const result = ineffectivePermissions({ ...allFalse(), canRecordPayment: true });
        expect(result).toEqual([
            { key: 'canRecordPayment', label: 'تسجيل دفعة سداد', requiresLabel: 'عرض الوضع المالي' },
        ]);
    });

    it('returns empty when both canRecordPayment and canViewFinance are true', () => {
        const result = ineffectivePermissions({ ...allFalse(), canRecordPayment: true, canViewFinance: true });
        expect(result).toEqual([]);
    });

    it('flags a quoting permission (canQuoteOrders) without canViewOrders', () => {
        const result = ineffectivePermissions({ ...allFalse(), canQuoteOrders: true });
        expect(result).toEqual([
            { key: 'canQuoteOrders', label: 'تسعير ومراجعة الطلبات', requiresLabel: 'عرض الطلبات' },
        ]);
    });

    it('returns empty when both canQuoteOrders and canViewOrders are true', () => {
        const result = ineffectivePermissions({ ...allFalse(), canQuoteOrders: true, canViewOrders: true });
        expect(result).toEqual([]);
    });

    it('the shipped SALES role default produces no ineffective permissions (internal coherence sanity check)', () => {
        expect(ineffectivePermissions(getWarehouseDefaultPermissions('SALES'))).toEqual([]);
    });

    // Stronger form of the same check: every shipped role's default matrix
    // should be internally coherent, not just SALES — an action permission
    // the role matrix turns on should never be paired with its gating view
    // permission turned off. If any of these fail, the role matrix itself
    // has a real gap and should be reported rather than "fixed" here (per
    // the brief: this task never changes what a permission does).
    for (const role of ['OWNER', 'MANAGER', 'SALES', 'INVENTORY', 'ACCOUNTANT']) {
        it(`the shipped ${role} role default produces no ineffective permissions`, () => {
            expect(ineffectivePermissions(getWarehouseDefaultPermissions(role))).toEqual([]);
        });
    }
});
