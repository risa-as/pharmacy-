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
- ✅ `/api/sync/debt-payments` POST — `sale.branchId !== branchId` cross-check prevents injecting payments into foreign branches.

---

## Findings (All Fixed)

### CRITICAL

- ✅ **CRIT-01** `/api/sync/patients` GET — **FIXED**: Added `getTenantContext()` auth + branchId ownership validation. Patient PII no longer publicly accessible. — `apps/web/app/api/sync/patients/route.ts` — **Severity: Critical — FIXED 2026-03-09**

- ✅ **CRIT-02** `/api/sync/debt-payments` GET — **FIXED**: Added `getTenantContext()` auth + `validateBranchAccess` helper. Financial data protected. — `apps/web/app/api/sync/debt-payments/route.ts` — **Severity: Critical — FIXED 2026-03-09**

### HIGH

- ✅ **HIGH-01** `/api/purchases/create` POST — **FIXED**: `branchId` from body now validated against `tenantCtx` to confirm it belongs to caller's org. Cross-tenant purchase injection blocked. — `apps/web/app/api/purchases/create/route.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **HIGH-02** `/api/sync/sales` POST — **FIXED**: Added `getTenantContext()` auth + branchId ownership validation. Arbitrary sale injection blocked. — `apps/web/app/api/sync/sales/route.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **HIGH-03** `/api/sync/loyalty` POST — **FIXED**: Added `getTenantContext()` auth + branchId ownership validation. Cross-tenant loyalty crediting blocked. — `apps/web/app/api/sync/loyalty/route.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **HIGH-04** `/api/sync/shifts` POST — **FIXED**: Added `getTenantContext()` auth + branchId ownership validation. Cross-tenant shift injection blocked. — `apps/web/app/api/sync/shifts/route.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **HIGH-05** `/api/sync/returns` POST — **FIXED**: Added `getTenantContext()` auth + branchId ownership validation. Cross-tenant inventory crediting blocked. — `apps/web/app/api/sync/returns/route.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **HIGH-06** `/api/sync/transactions` POST — **FIXED**: Added `getTenantContext()` auth + branchId ownership validation. Cross-tenant safe balance mutation blocked. — `apps/web/app/api/sync/transactions/route.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **HIGH-07** `/api/sync/debt-payments` POST — **FIXED**: Added `getTenantContext()` auth. Combined with existing `sale.branchId === branchId` check, endpoint is now fully protected. — `apps/web/app/api/sync/debt-payments/route.ts` — **Severity: High — FIXED 2026-03-09**

---

## Fix Status

- [x] **CRIT-01** Add `auth()` check + branchId ownership validation to `/api/sync/patients/route.ts` — **FIXED 2026-03-09**
- [x] **CRIT-02** Add `auth()` check + branchId ownership validation to `/api/sync/debt-payments/route.ts` GET — **FIXED 2026-03-09**
- [x] **HIGH-01** Validate `branchId` from body against `tenantCtx` scope in `/api/purchases/create/route.ts` — **FIXED 2026-03-09**
- [x] **HIGH-02** Add `auth()` + branchId ownership validation to `/api/sync/sales/route.ts` — **FIXED 2026-03-09**
- [x] **HIGH-03** Add `auth()` + branchId ownership validation to `/api/sync/loyalty/route.ts` — **FIXED 2026-03-09**
- [x] **HIGH-04** Add `auth()` + branchId ownership validation to `/api/sync/shifts/route.ts` — **FIXED 2026-03-09**
- [x] **HIGH-05** Add `auth()` + branchId ownership validation to `/api/sync/returns/route.ts` — **FIXED 2026-03-09**
- [x] **HIGH-06** Add `auth()` + branchId ownership validation to `/api/sync/transactions/route.ts` — **FIXED 2026-03-09**
- [x] **HIGH-07** Add `auth()` check to `/api/sync/debt-payments/route.ts` POST — **FIXED 2026-03-09**

**Domain result**: 9/9 findings FIXED. ✅ CLEAN
