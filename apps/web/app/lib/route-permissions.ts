/**
 * Route-to-Permission Mapping
 * Maps dashboard routes to the required permission key.
 * If a route is not listed here, it is accessible to all authenticated users.
 */

import { type UserPermissions } from './permissions';

export interface RoutePermission {
    path: string;
    permission: keyof UserPermissions;
}

/**
 * Each entry maps a dashboard path prefix to a permission key.
 * More specific paths MUST come before less specific ones.
 * The check: if pathname starts with the path, the user must have that permission.
 */
export const ROUTE_PERMISSIONS: RoutePermission[] = [
    // Sales
    { path: '/dashboard/sales', permission: 'canViewSales' },
    { path: '/dashboard/invoices', permission: 'canViewSales' },

    // Returns
    { path: '/dashboard/returns', permission: 'canViewReturns' },

    // Inventory — specific paths first
    { path: '/dashboard/inventory/bulk-pricing', permission: 'canBulkEditPrice' },
    { path: '/dashboard/inventory/transfers', permission: 'canTransferStock' },
    { path: '/dashboard/inventory/stocktakes', permission: 'canDoStocktake' },
    { path: '/dashboard/inventory/margin-warnings', permission: 'canEditPrice' },
    { path: '/dashboard/inventory/barcode-print', permission: 'canViewInventory' },
    { path: '/dashboard/inventory/shortages', permission: 'canViewInventory' },
    { path: '/dashboard/inventory/product-movement', permission: 'canViewInventory' },
    { path: '/dashboard/inventory/expired-damaged', permission: 'canViewInventory' },
    { path: '/dashboard/inventory', permission: 'canViewInventory' },
    { path: '/dashboard/drugs', permission: 'canViewInventory' },

    // Finance / Expenses
    { path: '/dashboard/finance/safes', permission: 'canViewExpenses' },
    { path: '/dashboard/finance/transactions', permission: 'canViewExpenses' },
    { path: '/dashboard/finance', permission: 'canViewExpenses' },
    { path: '/dashboard/expenses', permission: 'canViewExpenses' },
    { path: '/dashboard/payments', permission: 'canViewExpenses' },

    // Reports — specific paths first
    { path: '/dashboard/reports/profit', permission: 'canViewProfitReport' },
    { path: '/dashboard/reports/employees', permission: 'canViewEmployeeReport' },
    { path: '/dashboard/reports/audit-log', permission: 'canViewAuditLog' },
    { path: '/dashboard/reports/branch-comparison', permission: 'canViewProfitReport' },
    { path: '/dashboard/reports/shifts', permission: 'canViewReports' },
    { path: '/dashboard/reports', permission: 'canViewReports' },

    // Patients
    { path: '/dashboard/patients', permission: 'canViewPatients' },
    { path: '/dashboard/loyalty', permission: 'canViewPatients' },

    // Prescriptions
    { path: '/dashboard/prescriptions', permission: 'canViewPatients' },

    // Suppliers & Purchases
    { path: '/dashboard/suppliers', permission: 'canViewSuppliers' },
    { path: '/dashboard/purchases', permission: 'canCreatePurchase' },

    // Administration
    { path: '/dashboard/users', permission: 'canManageUsers' },
    { path: '/dashboard/branches', permission: 'canManageBranches' },
    { path: '/dashboard/settings', permission: 'canChangeSettings' },
    { path: '/dashboard/alerts', permission: 'canViewReports' },
    { path: '/dashboard/notifications', permission: 'canManageUsers' },

    // Debts
    { path: '/dashboard/debts', permission: 'canViewDebts' },

    // Phase 3
    { path: '/dashboard/warehouses', permission: 'canCreatePurchase' },
    { path: '/dashboard/marketplace', permission: 'canViewInventory' },
    { path: '/dashboard/analytics', permission: 'canViewProfitReport' },
    { path: '/dashboard/tenants', permission: 'canChangeSettings' },
];

/**
 * Get the permission required for a specific sidenav link href.
 * Uses prefix-based matching (most specific path wins).
 */
export function getLinkPermission(href: string): keyof UserPermissions | null {
    // Sort by path length descending so more specific paths match first
    const sorted = [...ROUTE_PERMISSIONS].sort((a, b) => b.path.length - a.path.length);

    for (const rp of sorted) {
        if (href.startsWith(rp.path)) {
            return rp.permission;
        }
    }
    return null; // No restriction
}

/**
 * Check if a user can access a specific path.
 * Returns true if the path has no permission requirement OR the user has the required permission.
 */
export function canAccessPath(
    pathname: string,
    userPermissions: UserPermissions
): boolean {
    const perm = getLinkPermission(pathname);
    if (!perm) return true; // No restriction
    return userPermissions[perm];
}
