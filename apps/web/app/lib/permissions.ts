/**
 * Granular Permissions System for Faramace
 * Each permission is a boolean flag that can be toggled per user.
 * Default permissions are determined by role.
 */

export interface UserPermissions {
    // Sales
    canSell: boolean;
    canApplyDiscount: boolean;
    canViewSales: boolean;
    canDeleteSale: boolean;

    // Returns
    canProcessReturn: boolean;
    canViewReturns: boolean;

    // Inventory
    canViewInventory: boolean;
    canAddDrug: boolean;
    canEditDrug: boolean;
    canDeleteDrug: boolean;
    canEditPrice: boolean;
    canBulkEditPrice: boolean;
    canTransferStock: boolean;
    canDoStocktake: boolean;

    // Expenses
    canViewExpenses: boolean;
    canCreateExpense: boolean;

    // Reports
    canViewReports: boolean;
    canViewProfitReport: boolean;
    canViewEmployeeReport: boolean;
    canExportExcel: boolean;

    // Patients & CRM
    canViewPatients: boolean;
    canEditPatient: boolean;

    // Suppliers & Purchases
    canViewSuppliers: boolean;
    canCreatePurchase: boolean;

    canViewWarehouseOrders: boolean;
    canCreateWarehouseOrder: boolean;
    canApproveWarehouseOrder: boolean;
    canReceivePurchase: boolean;
    canReturnWarehouseOrder: boolean;
    canReconcileWarehouseOrder: boolean;

    // Administration
    canManageUsers: boolean;
    canManageBranches: boolean;
    canViewAuditLog: boolean;
    canChangeSettings: boolean;
    canBackup: boolean;

    // Debts
    canViewDebts: boolean;
    canPayDebt: boolean;
}

// Default permissions by role
const ADMIN_DEFAULTS: UserPermissions = {
    canViewWarehouseOrders: true,
    canCreateWarehouseOrder: true,
    canApproveWarehouseOrder: true,
    canReceivePurchase: true,
    canReturnWarehouseOrder: true,
    canReconcileWarehouseOrder: true,

    canSell: true, canApplyDiscount: true, canViewSales: true, canDeleteSale: true,
    canProcessReturn: true, canViewReturns: true,
    canViewInventory: true, canAddDrug: true, canEditDrug: true, canDeleteDrug: true,
    canEditPrice: true, canBulkEditPrice: true, canTransferStock: true, canDoStocktake: true,
    canViewExpenses: true, canCreateExpense: true,
    canViewReports: true, canViewProfitReport: true, canViewEmployeeReport: true, canExportExcel: true,
    canViewPatients: true, canEditPatient: true,
    canViewSuppliers: true, canCreatePurchase: true,
    canManageUsers: true, canManageBranches: true, canViewAuditLog: true, canChangeSettings: true, canBackup: true,
    canViewDebts: true, canPayDebt: true,
};

const PHARMACIST_DEFAULTS: UserPermissions = {
    canViewWarehouseOrders: true,
    canCreateWarehouseOrder: true,
    canApproveWarehouseOrder: true,
    canReceivePurchase: true,
    canReturnWarehouseOrder: true,
    canReconcileWarehouseOrder: false,

    canSell: true, canApplyDiscount: true, canViewSales: true, canDeleteSale: false,
    canProcessReturn: true, canViewReturns: true,
    canViewInventory: true, canAddDrug: true, canEditDrug: true, canDeleteDrug: false,
    canEditPrice: false, canBulkEditPrice: false, canTransferStock: false, canDoStocktake: true,
    canViewExpenses: false, canCreateExpense: false,
    canViewReports: true, canViewProfitReport: false, canViewEmployeeReport: false, canExportExcel: false,
    canViewPatients: true, canEditPatient: true,
    canViewSuppliers: true, canCreatePurchase: true,
    canManageUsers: false, canManageBranches: false, canViewAuditLog: false, canChangeSettings: false, canBackup: false,
    canViewDebts: true, canPayDebt: true,
};

const CASHIER_DEFAULTS: UserPermissions = {
    canViewWarehouseOrders: false,
    canCreateWarehouseOrder: false,
    canApproveWarehouseOrder: false,
    canReceivePurchase: false,
    canReturnWarehouseOrder: false,
    canReconcileWarehouseOrder: false,

    canSell: true, canApplyDiscount: false, canViewSales: true, canDeleteSale: false,
    canProcessReturn: false, canViewReturns: false,
    canViewInventory: true, canAddDrug: false, canEditDrug: false, canDeleteDrug: false,
    canEditPrice: false, canBulkEditPrice: false, canTransferStock: false, canDoStocktake: false,
    canViewExpenses: false, canCreateExpense: false,
    canViewReports: false, canViewProfitReport: false, canViewEmployeeReport: false, canExportExcel: false,
    canViewPatients: true, canEditPatient: false,
    canViewSuppliers: false, canCreatePurchase: false,
    canManageUsers: false, canManageBranches: false, canViewAuditLog: false, canChangeSettings: false, canBackup: false,
    canViewDebts: true, canPayDebt: true,
};

// Fail-closed default for any role this switch does not recognise. An
// unrecognised role (a typo, corrupted data, or — the concrete bug this
// fixed — the WAREHOUSE role, which previously fell through to `default`
// and silently inherited CASHIER's fairly permissive set: canSell,
// canViewSales, canViewInventory, canViewPatients, canViewDebts,
// canPayDebt) must never inherit ANY role's permissions just because it fell
// through the switch. See app/lib/__tests__/permissions.test.ts.
const ALL_FALSE_DEFAULTS: UserPermissions = {
    canViewWarehouseOrders: false,
    canCreateWarehouseOrder: false,
    canApproveWarehouseOrder: false,
    canReceivePurchase: false,
    canReturnWarehouseOrder: false,
    canReconcileWarehouseOrder: false,

    canSell: false, canApplyDiscount: false, canViewSales: false, canDeleteSale: false,
    canProcessReturn: false, canViewReturns: false,
    canViewInventory: false, canAddDrug: false, canEditDrug: false, canDeleteDrug: false,
    canEditPrice: false, canBulkEditPrice: false, canTransferStock: false, canDoStocktake: false,
    canViewExpenses: false, canCreateExpense: false,
    canViewReports: false, canViewProfitReport: false, canViewEmployeeReport: false, canExportExcel: false,
    canViewPatients: false, canEditPatient: false,
    canViewSuppliers: false, canCreatePurchase: false,
    canManageUsers: false, canManageBranches: false, canViewAuditLog: false, canChangeSettings: false, canBackup: false,
    canViewDebts: false, canPayDebt: false,
};

export function getDefaultPermissions(role: string): UserPermissions {
    switch (role) {
        case 'ADMIN': return { ...ADMIN_DEFAULTS };
        case 'MANAGER': return { ...ADMIN_DEFAULTS, canManageUsers: false, canManageBranches: false, canChangeSettings: false, canBackup: false };
        // SUPER_ADMIN is documented elsewhere (auth.config.ts's /dashboard
        // authorized() branch: "Admin and Super Admin have full access") as
        // having full access — mirrored here explicitly instead of letting
        // it fall through to the fail-closed `default` below. Two live call
        // sites run this with NO earlier role short-circuit and would break
        // if SUPER_ADMIN suddenly got an all-false object: api/sales
        // route.ts's POST checks `tenantCtx.userPermissions.canSell` and a
        // few lines later explicitly carves SUPER_ADMIN out of the
        // branchId requirement (`!user.branchId && user.role !==
        // 'SUPER_ADMIN'`) — i.e. a SUPER_ADMIN posting a sale with no
        // branchId is a supported path today, not an oversight — and
        // api/debts/pay route.ts's POST checks
        // `tenantCtx.userPermissions.canPayDebt` the same way.
        case 'SUPER_ADMIN': return { ...ADMIN_DEFAULTS };
        case 'PHARMACIST': return { ...PHARMACIST_DEFAULTS };
        case 'CASHIER': return { ...CASHIER_DEFAULTS };
        default: return { ...ALL_FALSE_DEFAULTS };
    }
}

export function getUserPermissions(user: { role: string; permissions?: string | null }): UserPermissions {
    const defaults = getDefaultPermissions(user.role);
    if (!['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'PHARMACIST', 'CASHIER'].includes(user.role) || !user.permissions) return defaults;

    try {
        const overrides = JSON.parse(user.permissions);
        // Permissions are persisted as JSON but remain untrusted input. Only
        // known keys with literal booleans may override role defaults; a value
        // such as {"canSell":"false"} must never become truthy authorization.
        if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return defaults;
        const safeOverrides: Partial<UserPermissions> = {};
        for (const key of Object.keys(defaults) as Array<keyof UserPermissions>) {
            if (typeof overrides[key] === 'boolean') safeOverrides[key] = overrides[key];
        }
        const result = { ...defaults, ...safeOverrides };
        // Legacy accounts retain prior restrictions until these flags are explicitly saved.
        const legacy = result.canViewSuppliers && result.canCreatePurchase;
        for (const key of ['canCreateWarehouseOrder', 'canApproveWarehouseOrder', 'canReceivePurchase', 'canReturnWarehouseOrder', 'canReconcileWarehouseOrder'] as const) {
            if (typeof overrides[key] !== 'boolean') result[key] = legacy && (key !== 'canReconcileWarehouseOrder' || defaults[key]);
        }
        if (typeof overrides.canViewWarehouseOrders !== 'boolean') result.canViewWarehouseOrders = result.canViewSuppliers;
        result.canViewWarehouseOrders &&= result.canViewSuppliers;
        result.canReceivePurchase &&= result.canViewSuppliers;
        for (const key of ['canCreateWarehouseOrder', 'canApproveWarehouseOrder', 'canReturnWarehouseOrder', 'canReconcileWarehouseOrder'] as const) result[key] &&= result.canViewWarehouseOrders;
        result.canReconcileWarehouseOrder &&= ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user.role);
        return result;
    } catch {
        return defaults;
    }
}

export function hasPermission(user: { role: string; permissions?: string | null }, key: keyof UserPermissions): boolean {
    return getUserPermissions(user)[key];
}

// Permission labels for UI (Arabic)
export const PERMISSION_LABELS: Record<keyof UserPermissions, { label: string; category: string }> = {
    canSell: { label: 'البيع', category: 'المبيعات' },
    canApplyDiscount: { label: 'تطبيق خصم', category: 'المبيعات' },
    canViewSales: { label: 'عرض المبيعات', category: 'المبيعات' },
    canDeleteSale: { label: 'حذف فاتورة', category: 'المبيعات' },
    canProcessReturn: { label: 'معالجة مرتجع', category: 'المرتجعات' },
    canViewReturns: { label: 'عرض المرتجعات', category: 'المرتجعات' },
    canViewInventory: { label: 'عرض المخزون', category: 'المخزون' },
    canAddDrug: { label: 'إضافة دواء', category: 'المخزون' },
    canEditDrug: { label: 'تعديل دواء', category: 'المخزون' },
    canDeleteDrug: { label: 'حذف دواء', category: 'المخزون' },
    canEditPrice: { label: 'تعديل السعر', category: 'المخزون' },
    canBulkEditPrice: { label: 'تعديل أسعار بالجملة', category: 'المخزون' },
    canTransferStock: { label: 'تحويل بين الأفرع', category: 'المخزون' },
    canDoStocktake: { label: 'جرد المخزون', category: 'المخزون' },
    canViewExpenses: { label: 'عرض المصروفات', category: 'المالية' },
    canCreateExpense: { label: 'إنشاء مصروف', category: 'المالية' },
    canViewReports: { label: 'عرض التقارير', category: 'التقارير' },
    canViewProfitReport: { label: 'تقرير الأرباح', category: 'التقارير' },
    canViewEmployeeReport: { label: 'تقارير الموظفين', category: 'التقارير' },
    canExportExcel: { label: 'تصدير Excel', category: 'التقارير' },
    canViewPatients: { label: 'عرض المرضى', category: 'العملاء' },
    canEditPatient: { label: 'تعديل بيانات مريض', category: 'العملاء' },
    canViewSuppliers: { label: 'عرض الموردين', category: 'التوريد' },
    canCreatePurchase: { label: 'إنشاء طلب شراء', category: 'التوريد' },
    canViewWarehouseOrders: { label: 'عرض طلبات المذاخر', category: 'التوريد' },
    canCreateWarehouseOrder: { label: 'إنشاء طلب من مذخر', category: 'التوريد' },
    canApproveWarehouseOrder: { label: 'اعتماد ورفض وإلغاء طلب المذخر', category: 'التوريد' },
    canReceivePurchase: { label: 'استلام المشتريات', category: 'التوريد' },
    canReturnWarehouseOrder: { label: 'إرجاع مشتريات المذخر', category: 'التوريد' },
    canReconcileWarehouseOrder: { label: 'مطابقة الاستلام والسداد', category: 'التوريد' },
    canManageUsers: { label: 'إدارة المستخدمين', category: 'الإدارة' },
    canManageBranches: { label: 'إدارة الفروع', category: 'الإدارة' },
    canViewAuditLog: { label: 'سجل النشاطات', category: 'الإدارة' },
    canChangeSettings: { label: 'تغيير الإعدادات', category: 'الإدارة' },
    canBackup: { label: 'النسخ الاحتياطي', category: 'الإدارة' },
    canViewDebts: { label: 'عرض الديون', category: 'الديون' },
    canPayDebt: { label: 'تسجيل سداد', category: 'الديون' },
};
