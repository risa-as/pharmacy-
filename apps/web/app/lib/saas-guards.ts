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
import { FREE_PLAN_FEATURES, PlanFeatureFlags } from "@/app/lib/plan-features";

/** FREE-plan caps used when no Tenant record is found. */
const FREE_PLAN_LIMITS = {
  maxBranches: 1,
  maxUsers: 3,
  maxDevices: 1,
  maxMobileUsers: 1,
} as const;

export type PlanLimitResource = "branches" | "users" | "devices" | "mobileUsers";

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
 * @param resource        - "branches" | "users" | "devices" | "mobileUsers"
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

  const maxBranches = org?.maxBranches ?? org?.plan?.maxBranches ?? FREE_PLAN_LIMITS.maxBranches;
  const maxUsers = org?.maxUsers ?? org?.plan?.maxUsers ?? FREE_PLAN_LIMITS.maxUsers;
  const maxDevices = org?.maxDevices ?? org?.plan?.maxDevices ?? FREE_PLAN_LIMITS.maxDevices;
  const maxMobileUsers = org?.maxMobileUsers ?? org?.plan?.maxMobileUsers ?? FREE_PLAN_LIMITS.maxMobileUsers;

  let max: number;
  switch (resource) {
    case "branches": max = maxBranches; break;
    case "users": max = maxUsers; break;
    case "devices": max = maxDevices; break;
    case "mobileUsers": max = maxMobileUsers; break;
  }

  let current: number;

  if (resource === "branches") {
    current = await prisma.branch.count({ where: { organizationId } });

  } else if (resource === "users") {
    const orgBranchIds = await prisma.branch
      .findMany({ where: { organizationId }, select: { id: true } })
      .then((bs) => bs.map((b) => b.id));

    current = await prisma.user.count({
      where: {
        role: { not: "SUPER_ADMIN" },
        OR: [
          { branchId: { in: orgBranchIds } },
          { branchId: null, role: "ADMIN" },
        ],
      },
    });

  } else if (resource === "devices") {
    const orgBranchIds = await prisma.branch
      .findMany({ where: { organizationId }, select: { id: true } })
      .then((bs) => bs.map((b) => b.id));

    current = await prisma.deviceLicense.count({
      where: {
        branchId: { in: orgBranchIds },
        isActive: true,
      },
    });

  } else {
    // mobileUsers — count active mobile sessions for ADMIN/PHARMACIST
    current = await prisma.mobileSession.count({
      where: { organizationId, isActive: true },
    });
  }

  // max = -1 means unlimited (Enterprise); any non-negative value is a hard cap.
  const allowed = max < 0 || current < max;
  return { allowed, current, max, upgradeRequired: !allowed };
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

/** Check if a new device license can be activated for this org. */
export function checkDeviceLimit(organizationId: string): Promise<PlanLimitResult> {
  return checkPlanLimit(organizationId, "devices");
}

/** Check if a new mobile session (ADMIN/PHARMACIST) can be opened for this org. */
export function checkMobileSessionLimit(organizationId: string): Promise<PlanLimitResult> {
  return checkPlanLimit(organizationId, "mobileUsers");
}

// ─── Feature Gating ──────────────────────────────────────────────────────────

export interface FeatureAccessResult {
  allowed: boolean;
  requiredPlan: string;
}

/**
 * Returns the full feature flags object for an organization, falling back to
 * FREE_PLAN_FEATURES if the plan has no features JSON.
 */
export async function getPlanFeatures(organizationId: string): Promise<PlanFeatureFlags> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { plan: true },
  });

  if (!org?.plan?.features) return { ...FREE_PLAN_FEATURES };

  try {
    const raw = org.plan.features as Record<string, boolean>;
    return {
      productMovement: raw.productMovement ?? false,
      advancedReports: raw.advancedReports ?? false,
      supplierManagement: raw.supplierManagement ?? false,
      granularPermissions: raw.granularPermissions ?? false,
      warehouseManagement: raw.warehouseManagement ?? false,
      interBranchTransfers: raw.interBranchTransfers ?? false,
      marketplace: raw.marketplace ?? false,
    };
  } catch {
    return { ...FREE_PLAN_FEATURES };
  }
}

/**
 * Check whether a specific feature flag is enabled for an organization.
 * Returns the required plan name for UI messaging.
 */
export async function checkFeatureAccess(
  organizationId: string,
  flag: keyof PlanFeatureFlags
): Promise<FeatureAccessResult> {
  const features = await getPlanFeatures(organizationId);
  const allowed = features[flag];

  const enterpriseFlags: (keyof PlanFeatureFlags)[] = [
    "warehouseManagement",
    "interBranchTransfers",
    "marketplace",
  ];

  const requiredPlan = enterpriseFlags.includes(flag) ? "باقة الشركات" : "الباقة الاحترافية";

  return { allowed, requiredPlan };
}
