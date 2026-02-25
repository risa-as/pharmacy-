/**
 * super-admin-guard.ts
 *
 * Defines the route sets for SUPER_ADMIN isolation:
 * - SUPER_ADMIN_ROUTES: only accessible by SUPER_ADMIN (the Control Tower)
 * - PHARMACY_ONLY_ROUTES: blocked for SUPER_ADMIN (pharmacy operations)
 *
 * Used by middleware.ts and sidenav.tsx.
 */

/** Routes that only SUPER_ADMIN may access. */
export const SUPER_ADMIN_ROUTES = [
    "/dashboard/tenants",
    "/dashboard/admin",
    "/dashboard/admin/licenses",
];

/**
 * Route prefixes that are pharmacy-only — blocked for SUPER_ADMIN.
 * Any pathname that starts with one of these is a pharmacy operations page.
 */
export const PHARMACY_ONLY_ROUTES = [
    "/dashboard/drugs",
    "/dashboard/inventory",
    "/dashboard/sales",
    "/dashboard/patients",
    "/dashboard/prescriptions",
    "/dashboard/reports",
    "/dashboard/debts",
    "/dashboard/suppliers",
    "/dashboard/purchases",
    "/dashboard/invoices",
    "/dashboard/returns",
    "/dashboard/payments",
    "/dashboard/insurance",
    "/dashboard/loyalty",
    "/dashboard/batches",
    "/dashboard/discounts",
];

/**
 * Returns true if the pathname is a SUPER_ADMIN-only control tower route.
 * Uses prefix matching so /dashboard/admin/licenses/123 also matches.
 */
export function isSuperAdminRoute(pathname: string): boolean {
    return SUPER_ADMIN_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(route + "/")
    );
}

/**
 * Returns true if the pathname is a pharmacy-only route
 * that SUPER_ADMIN should not be able to access.
 */
export function isPharmacyOnlyRoute(pathname: string): boolean {
    return PHARMACY_ONLY_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(route + "/")
    );
}
