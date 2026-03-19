/**
 * page-guards.ts
 *
 * Server-side utilities for protecting page routes based on plan feature flags.
 * Use `requireFeature` in Server Components to show UpgradeRequired instead of
 * the real content when the org doesn't have access.
 */

import { checkFeatureAccess } from "@/app/lib/saas-guards";
import { PlanFeatureFlags } from "@/app/lib/plan-features";

export interface UpgradeRequiredProps {
  featureName: string;
  featureDescription?: string;
  requiredPlan: string;
}

const FEATURE_NAMES: Record<keyof PlanFeatureFlags, string> = {
  productMovement: "تقرير حركة الأصناف",
  advancedReports: "التقارير المتقدمة",
  supplierManagement: "إدارة الموردين",
  granularPermissions: "الصلاحيات التفصيلية",
  warehouseManagement: "إدارة المستودعات",
  interBranchTransfers: "التحويلات بين الفروع",
  marketplace: "سوق الأدوية B2B",
};

/**
 * Returns UpgradeRequired props if the feature is not allowed,
 * or null if access is granted.
 *
 * Usage in a Server Component:
 * ```tsx
 * const upgrade = await requireFeature(orgId, 'advancedReports');
 * if (upgrade) return <UpgradeRequired {...upgrade} />;
 * ```
 */
export async function requireFeature(
  organizationId: string,
  flag: keyof PlanFeatureFlags
): Promise<UpgradeRequiredProps | null> {
  const { allowed, requiredPlan } = await checkFeatureAccess(organizationId, flag);

  if (allowed) return null;

  return {
    featureName: FEATURE_NAMES[flag] ?? flag,
    requiredPlan,
  };
}
