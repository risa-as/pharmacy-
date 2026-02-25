/**
 * saas-guards.ts
 *
 * Shared server-side utility for SaaS plan limit enforcement (Iron Wall).
 * Call checkPlanLimit() from any Server Action or API route before creating
 * a resource that is subject to per-plan caps.
 *
 * Limit source: uses the first active Tenant record's maxBranches/maxUsers.
 * Falls back to FREE plan defaults when no Tenant record is found.
 *
 * TODO: add organizationId → tenantId FK on Organization model so each org
 * can be mapped to its own Tenant plan rather than using the first Tenant.
 */

import { prisma } from "@/app/lib/prisma";

/** FREE-plan caps used when no Tenant record is found. */
const FREE_PLAN_LIMITS = {
    maxBranches: 1,
    maxUsers: 3,
} as const;

export type PlanLimitResource = "branches" | "users";

export interface PlanLimitResult {
    allowed: boolean;
    current: number;
    max: number;
    upgradeRequired: boolean;
}

/**
 * Checks whether creating a new resource of the given type is allowed under
 * the current subscription plan.
 *
 * @param organizationId  - The org whose resource count should be checked.
 * @param resource        - "branches" or "users"
 * @returns PlanLimitResult — call .allowed before proceeding with creation.
 */
export async function checkPlanLimit(
    organizationId: string,
    resource: PlanLimitResource
): Promise<PlanLimitResult> {
    // Look up plan limits from the active Tenant.
    // -1 on Tenant fields is treated as "unlimited" (Enterprise plan).
    const tenant = await prisma.tenant.findFirst({
        where: { isActive: true },
        select: { maxBranches: true, maxUsers: true },
    });

    const max =
        resource === "branches"
            ? (tenant?.maxBranches ?? FREE_PLAN_LIMITS.maxBranches)
            : (tenant?.maxUsers ?? FREE_PLAN_LIMITS.maxUsers);

    let current: number;
    if (resource === "branches") {
        current = await prisma.branch.count({ where: { organizationId } });
    } else {
        // Count users across all branches of this organisation.
        // Users with no branchId (not assigned) are excluded from the cap.
        current = await prisma.user.count({
            where: { branch: { organizationId } },
        });
    }

    // max = -1 means unlimited (Enterprise); any non-negative value is a hard cap.
    const allowed = max < 0 || current < max;

    return { allowed, current, max, upgradeRequired: !allowed };
}
