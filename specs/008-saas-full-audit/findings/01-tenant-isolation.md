# Findings: Tenant Data Isolation (US1)

**Auditor**: Claude Code
**Date**: 2026-03-09
**Severity Scale**: Critical > High > Medium > Low

---

## PASS Items

- ✅ `getTenantContext()` in `apps/web/app/lib/tenant-utils.ts` — correct role-scoped isolation: SUPER_ADMIN sees all, ADMIN scoped to `organizationId`, PHARMACIST/CASHIER scoped to `branchId`; returns 401/403 if session missing or user has no org/branch.
- ✅ `/api/patients` GET — `getTenantContext()` applied; `where` clause includes `tenantWhere` scope.
- ✅ `/api/inventory` GET/POST — `getTenantContext()` applied; branch scoped correctly.
- ✅ `/api/sales` GET — `getTenantContext()` applied.
- ✅ `/api/suppliers` GET — `getTenantContext()` applied.
- ✅ `/api/branches` GET — scoped to user's `organizationId`.
- ✅ `/api/expenses` — `getTenantContext()` applied.
- ✅ `/api/loyalty` GET — `getTenantContext()` applied.
- ✅ `/api/reports` routes — `getTenantContext()` applied before aggregation.
- ✅ `/api/sync/notifications` GET — `auth()` checked; scoped to `session.user.id`.
- ✅ Middleware (`apps/web/middleware.ts`) — blocks unauthenticated access to `/dashboard/*`.
- ✅ `/api/admin/*` routes — SUPER_ADMIN role enforced.
- ✅ `/api/sync/debt-payments` POST — `sale.branchId !== branchId` cross-check prevents injecting payments into foreign branches (partial mitigation — no auth still CRITICAL).

---

## FAIL Items

### CRITICAL

- ❌ **CRIT-01** `/api/sync/patients` GET — **No authentication whatsoever**. Any unauthenticated HTTP request can fetch all patients from any branch by passing `?branchId=<any_id>`. Patient PII (name, phone, balance, loyalty) exposed publicly. — `apps/web/app/api/sync/patients/route.ts:7` — **Severity: Critical**

- ❌ **CRIT-02** `/api/sync/debt-payments` GET — **No authentication**. Any caller can enumerate debt payment records for any branch by passing `?branchId=<id>`. Financial data (amounts, methods, patient links) exposed. — `apps/web/app/api/sync/debt-payments/route.ts:7` — **Severity: Critical**

### HIGH

- ❌ **HIGH-01** `/api/purchases/create` POST — `branchId` from request body used directly in `prisma.purchase.create`. While `getTenantContext()` authenticates the user, it never validates that the supplied `branchId` belongs to the user's organization. An ADMIN of Org-A can create purchases in Org-B's branches. — `apps/web/app/api/purchases/create/route.ts:26` — **Severity: High**

- ❌ **HIGH-02** `/api/sync/sales` POST — No `auth()` call. The `branchId` from the payload is used to query `inventory` and create `sale`/`payment` records with no ownership validation. A crafted payload can write financial records to any branch. — `apps/web/app/api/sync/sales/route.ts:36` — **Severity: High**

- ❌ **HIGH-03** `/api/sync/loyalty` POST — No `auth()` call. `branchId` validates only that a `branch` row exists (for `loyaltyEnabled` check) but the caller identity is never verified. Loyalty points can be credited to patients in any org. — `apps/web/app/api/sync/loyalty/route.ts:23` — **Severity: High**

- ❌ **HIGH-04** `/api/sync/shifts` POST — No `auth()` call. `branchId` from payload written directly to `Shift.branchId`. Attacker can create or overwrite shift records in any branch. — `apps/web/app/api/sync/shifts/route.ts:30` — **Severity: High**

- ❌ **HIGH-05** `/api/sync/returns` POST — No `auth()` call. `branchId` from payload written to `SaleReturn.branchId` and used to credit inventory. — `apps/web/app/api/sync/returns/route.ts:28` — **Severity: High**

- ❌ **HIGH-06** `/api/sync/transactions` POST — No `auth()` call. Safe balance mutated using `safeId` from payload with no ownership check. — `apps/web/app/api/sync/transactions/route.ts:27` — **Severity: High**

- ❌ **HIGH-07** `/api/sync/debt-payments` POST — No `auth()` call. The `sale.branchId !== branchId` check partially mitigates cross-branch injection but an unauthenticated attacker can still probe which sale IDs exist and create debt payments for any valid sale. — `apps/web/app/api/sync/debt-payments/route.ts:51` — **Severity: High**

---

## Needs Fix

- [x] **CRIT-01** Add `auth()` check + branchId ownership validation to `/api/sync/patients/route.ts` — Fixed 2026-03-09
- [x] **CRIT-02** Add `auth()` check + branchId ownership validation to `/api/sync/debt-payments/route.ts` GET — Fixed 2026-03-09
- [x] **HIGH-01** Validate `branchId` from body against `tenantCtx` scope in `/api/purchases/create/route.ts` — Fixed 2026-03-09
- [x] **HIGH-02** Add `auth()` + branchId ownership validation to `/api/sync/sales/route.ts` — Fixed 2026-03-09
- [x] **HIGH-03** Add `auth()` + branchId ownership validation to `/api/sync/loyalty/route.ts` — Fixed 2026-03-09
- [x] **HIGH-04** Add `auth()` + branchId ownership validation to `/api/sync/shifts/route.ts` — Fixed 2026-03-09
- [x] **HIGH-05** Add `auth()` + branchId ownership validation to `/api/sync/returns/route.ts` — Fixed 2026-03-09
- [x] **HIGH-06** Add `auth()` + branchId ownership validation to `/api/sync/transactions/route.ts` — Fixed 2026-03-09
- [x] **HIGH-07** Add `auth()` check to `/api/sync/debt-payments/route.ts` POST — Fixed 2026-03-09
