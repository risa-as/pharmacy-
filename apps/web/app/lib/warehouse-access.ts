/**
 * warehouse-access.ts
 *
 * Pure authorization/scoping decisions for the warehouse (B2B) API routes
 * (app/api/warehouses/route.ts and app/api/warehouses/orders/route.ts).
 *
 * Deliberately has no Prisma import, no `next/headers`, and no `auth()` call
 * so it can be unit-tested without spinning up the Next.js runtime — see
 * app/lib/__tests__/warehouse-access.test.ts.
 *
 * Mirrors the tenant-scoping shape produced by getTenantContext() in
 * tenant-utils.ts:
 *   - SUPER_ADMIN -> unscoped ({})
 *   - ADMIN/MANAGER -> org-scoped via the `branch` relation ({ branch: { organizationId } })
 *   - everyone else -> scoped to their own branch ({ branchId })
 */

export type WarehouseScopeInput = {
    role: string;
    organizationId?: string;
    branchId?: string;
};

/**
 * Returns the Prisma `where` fragment scoping WarehouseOrder queries to the
 * caller, or `null` if the caller has no valid scope (=> the route must
 * respond 403).
 *
 * WarehouseOrder has a direct `branchId` column plus a `branch` relation, so:
 *   - SUPER_ADMIN gets {} (no restriction)
 *   - ADMIN/MANAGER get { branch: { organizationId } } (requires organizationId)
 *   - everyone else gets { branchId } (requires branchId)
 */
export function warehouseOrderScope(input: WarehouseScopeInput): Record<string, any> | null {
    const { role, organizationId, branchId } = input;

    if (role === 'SUPER_ADMIN') {
        return {};
    }

    if (role === 'ADMIN' || role === 'MANAGER') {
        if (!organizationId) return null;
        return { branch: { organizationId } };
    }

    // A WAREHOUSE account (Stage 1, warehouse-context.ts) belongs to no
    // Branch/Organization and must never be scoped as a pharmacy tenant —
    // explicit and unconditional, regardless of whatever branchId happens to
    // be present on the identity, so this rejection can't silently regress
    // if the branchId fallback below is ever changed.
    if (role === 'WAREHOUSE') return null;

    if (!branchId) return null;
    return { branchId };
}

/** True when this role is permitted to create Warehouse rows (globally-shared, platform-owned table). */
export function canCreateWarehouse(role: string): boolean {
    return role === 'SUPER_ADMIN';
}

/**
 * Resolves the branch a new WarehouseOrder should be attributed to.
 *
 * - If the caller has their own branchId (non-admin), that branch is always
 *   used — any `requestedBranchId` from the request body is ignored.
 * - If the caller has no branchId (e.g. an org-level ADMIN/MANAGER, or
 *   SUPER_ADMIN), a `requestedBranchId` may be used, but only after the
 *   caller (route handler) verifies via Prisma that the branch belongs to
 *   the caller's organization — signaled here by returning
 *   `{ needsOrgBranchCheck }` rather than resolving it directly.
 * - Returns `null` when the request cannot be resolved at all (no own
 *   branch and no requested branch to check).
 */
export function resolveOrderBranch(
    input: WarehouseScopeInput,
    requestedBranchId?: string
): { branchId: string } | { needsOrgBranchCheck: string } | null {
    const { branchId } = input;

    if (requestedBranchId && ['ADMIN','MANAGER','SUPER_ADMIN'].includes(input.role)) return { needsOrgBranchCheck: requestedBranchId };
    if (branchId) {
        // Non-admin (or admin with an assigned branch): always use the
        // caller's own branch, regardless of what the request body says.
        return { branchId };
    }

    if (requestedBranchId) {
        return { needsOrgBranchCheck: requestedBranchId };
    }

    return null;
}
