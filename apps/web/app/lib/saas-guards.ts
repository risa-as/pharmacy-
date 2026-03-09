/**
 * saas-guards.ts
 *
 * Shared server-side utility for SaaS plan limit enforcement (Iron Wall).
 * Call checkPlanLimit() from any Server Action or API route before creating
 * a resource that is subject to per-plan caps.
 *
 * Limit source: Organization.maxBranches / Organization.maxUsers (per-org
 * overrides), falling back to Organization.plan (SubscriptionPlan), then
 * FREE_PLAN_LIMITS when no plan is assigned.  Each org is mapped to its
 * own plan via Organization.planId — no cross-org ambiguity.
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
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        include: { plan: true },
    });

    let maxBranches = org?.maxBranches ?? org?.plan?.maxBranches ?? FREE_PLAN_LIMITS.maxBranches;
    let maxUsers = org?.maxUsers ?? org?.plan?.maxUsers ?? FREE_PLAN_LIMITS.maxUsers;

    const max = resource === "branches" ? maxBranches : maxUsers;

    let current: number;
    if (resource === "branches") {
        current = await prisma.branch.count({ where: { organizationId } });
    } else {
        // Count ALL users across every branch of this organisation, including
        // ADMIN users whose branchId may be null (excluded from nested filter).
        // Two-step: get branch IDs first, then count users — this also captures
        // null-branchId users who were provisioned under this org's first branch.
        const orgBranchIds = await prisma.branch
            .findMany({ where: { organizationId }, select: { id: true } })
            .then((bs) => bs.map((b) => b.id));

        current = await prisma.user.count({
            where: {
                role: { not: "SUPER_ADMIN" }, // SUPER_ADMIN is platform-level, not tenant-level
                OR: [
                    { branchId: { in: orgBranchIds } },
                    // ADMIN users may have branchId: null if created before branch assignment
                    { branchId: null, role: "ADMIN" },
                ],
            },
        });
    }

    // max = -1 means unlimited (Enterprise); any non-negative value is a hard cap.
    const allowed = max < 0 || current < max;

    return { allowed, current, max, upgradeRequired: !allowed };
}
