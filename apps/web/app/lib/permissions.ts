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

export function getDefaultPermissions(role: string): UserPermissions {
    switch (role) {
        case 'ADMIN': return { ...ADMIN_DEFAULTS };
        case 'PHARMACIST': return { ...PHARMACIST_DEFAULTS };
        case 'CASHIER': return { ...CASHIER_DEFAULTS };
        default: return { ...CASHIER_DEFAULTS };
    }
}

export function getUserPermissions(user: { role: string; permissions?: string | null }): UserPermissions {
    const defaults = getDefaultPermissions(user.role);
    if (!user.permissions) return defaults;

    try {
        const overrides = JSON.parse(user.permissions);
        return { ...defaults, ...overrides };
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
    canManageUsers: { label: 'إدارة المستخدمين', category: 'الإدارة' },
    canManageBranches: { label: 'إدارة الفروع', category: 'الإدارة' },
    canViewAuditLog: { label: 'سجل النشاطات', category: 'الإدارة' },
    canChangeSettings: { label: 'تغيير الإعدادات', category: 'الإدارة' },
    canBackup: { label: 'النسخ الاحتياطي', category: 'الإدارة' },
    canViewDebts: { label: 'عرض الديون', category: 'الديون' },
    canPayDebt: { label: 'تسجيل سداد', category: 'الديون' },
};
