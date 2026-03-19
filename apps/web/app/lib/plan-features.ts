/**
 * plan-features.ts
 *
 * Defines the PlanFeatureFlags type used across the plan enforcement system.
 * Each flag corresponds to a Pro or Enterprise tier feature.
 */

export type PlanFeatureFlags = {
  /** Mirroring / movement reports across branches (Pro+) */
  productMovement: boolean;
  /** Advanced profit & analytics reports (Pro+) */
  advancedReports: boolean;
  /** Supplier management module (Pro+) */
  supplierManagement: boolean;
  /** Granular per-user permission controls (Pro+) */
  granularPermissions: boolean;
  /** Warehouse ordering system (Enterprise only) */
  warehouseManagement: boolean;
  /** Inter-branch stock transfers (Enterprise only) */
  interBranchTransfers: boolean;
  /** B2B marketplace for excess medications (Enterprise only) */
  marketplace: boolean;
};

/** Default feature flags for the FREE plan — all features disabled. */
export const FREE_PLAN_FEATURES: PlanFeatureFlags = {
  productMovement: false,
  advancedReports: false,
  supplierManagement: false,
  granularPermissions: false,
  warehouseManagement: false,
  interBranchTransfers: false,
  marketplace: false,
};
