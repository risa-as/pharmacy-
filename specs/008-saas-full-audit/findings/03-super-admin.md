# Findings: Super Admin System (US3)

**Auditor**: Claude Code
**Date**: 2026-03-09
**Severity Scale**: Critical > High > Medium > Low

---

## Admin Route Inventory

| Route | Method | Role Check | Role Required | Status |
|-------|--------|-----------|---------------|--------|
| /api/admin/provision-tenant | POST | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/tenants | GET | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/tenants | POST | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/tenants/[id] | PATCH | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/tenants/[id] | DELETE | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/organizations | GET | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/licenses | GET | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/licenses | POST | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/licenses/[id] | PATCH | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/licenses/[id] | DELETE | YES | `SUPER_ADMIN` only | ✅ FIXED |
| /api/admin/plans | GET | YES | `SUPER_ADMIN` only | ✅ FIXED |

---

## Dashboard Page Inventory

| Page | Path | Role Guard | Guard Level | Status |
|------|------|-----------|-------------|--------|
| Admin root layout | `/dashboard/admin/layout.tsx` | YES | `SUPER_ADMIN` only | ✅ PASS |
| Tenants sub-layout | `/dashboard/admin/tenants/layout.tsx` | YES | `SUPER_ADMIN` only | ✅ PASS |
| Tenants page | `/dashboard/admin/tenants/page.tsx` | Inherited from layout | — | ✅ PASS |
| Licenses page | `/dashboard/admin/licenses/page.tsx` | Inherited from layout | — | ✅ PASS |
| Plans page | `/dashboard/admin/plans/page.tsx` | Inherited from layout | — | ✅ PASS |
| Organizations page | `/dashboard/organizations/page.tsx` | YES | Scoped to org for non-SUPER_ADMIN | ✅ FIXED |

---

## Server Actions Inventory

| Action File | Functions | Auth Guard | Status |
|-------------|-----------|-----------|--------|
| `organization-suspension.ts` | `suspendOrganization`, `reactivateOrganization` | SUPER_ADMIN + atomic transaction | ✅ FIXED |
| `plans.ts` | `createPlan`, `updatePlan`, `getPlans` | SUPER_ADMIN check | ✅ FIXED |
| `license.ts` | `suspendOrgLicenses`, `reactivateOrgLicenses` | SUPER_ADMIN check | ✅ FIXED |

---

## PASS Items

- ✅ **Dashboard layout enforces SUPER_ADMIN** — `apps/web/app/dashboard/admin/layout.tsx:7` and `apps/web/app/dashboard/admin/tenants/layout.tsx:7` both redirect any non-SUPER_ADMIN user to `/dashboard`. All admin UI pages are protected at the layout level.
- ✅ **provision-tenant uses `prisma.$transaction()`** — `apps/web/app/api/admin/provision-tenant/route.ts:62`. All four steps (Organization → Branch → User → DeviceLicense) are wrapped in a single atomic transaction. Partial failures are rolled back automatically.
- ✅ **tenants POST (create) uses `prisma.$transaction()`** — `apps/web/app/api/admin/tenants/route.ts:103`. Same pattern as provision-tenant: Organization → Branch → User → DeviceLicense created atomically.
- ✅ **tenants DELETE uses `prisma.$transaction()`** — `apps/web/app/api/admin/tenants/[id]/route.ts:85`. Cascades in correct order: DeviceLicenses → Users → Branches → Organization.
- ✅ **License suspension cascades correctly** — `apps/web/app/lib/actions/license.ts:18-29`. `suspendOrgLicenses()` marks licenses `isActive: false` and sets `suspendedByOrgSuspension: true`, allowing accurate restoration. Uses `prisma.$transaction()`.
- ✅ **License reactivation is selective** — `apps/web/app/lib/actions/license.ts:44-56`. `reactivateOrgLicenses()` only restores licenses where `suspendedByOrgSuspension: true`, leaving manually deactivated licenses untouched.
- ✅ **License key generation uses cryptographically secure randomness** — `apps/web/app/lib/license-utils.ts:12`. Uses `crypto.randomBytes()` with a uniqueness check loop. Format is `FRMC-XXXX-XXXX-XXXX` with unambiguous character set (no 0/O/1/I).
- ✅ **DRM branch-ownership binding on license create** — `apps/web/app/api/admin/licenses/route.ts:55-63`. Before issuing a license, the API verifies the branch exists and that `branch.organizationId === organizationId` from the request body.
- ✅ **Passwords hashed with bcrypt** — `apps/web/app/api/admin/provision-tenant/route.ts:59` and `apps/web/app/api/admin/tenants/route.ts:100`. Both provisioning paths hash with `bcrypt(password, 10)` before storing.
- ✅ **Duplicate email check before provisioning** — Both `provision-tenant/route.ts:37-43` and `tenants/route.ts:69-75` check for existing user email and return 409 Conflict before any DB writes.
- ✅ **Auth config propagates role and branchId into JWT/session** — `apps/web/auth.config.ts:42-58`. Role, id, branchId, organizationId, and permissions are all written into the JWT token and then into the session object, making them available for auth checks throughout the app.

---

## Findings (All Fixed)

### Critical

- ✅ **All admin API routes accepted `ADMIN` role — platform-level endpoints accessible by tenant owners** — **FIXED**: All 11 routes under `/api/admin/` now check `role === 'SUPER_ADMIN'` exclusively. The `|| role === 'ADMIN'` fallback has been removed from every route guard. Tenant owners can no longer access platform management endpoints. — **Severity: Critical — FIXED 2026-03-09**

- ✅ **Server action `suspendOrganization` / `reactivateOrganization` has no auth check** — **FIXED**: Both functions now call `auth()` and assert `role === 'SUPER_ADMIN'` before executing. Returns `{ error: 'Unauthorized' }` if check fails. — `apps/web/app/lib/actions/organization-suspension.ts` — **Severity: Critical — FIXED 2026-03-09**

- ✅ **`suspendOrganization` is non-atomic — two separate DB operations can diverge** — **FIXED**: Both `organization.update(isSuspended: true)` and `suspendOrgLicenses()` are now wrapped in a single `prisma.$transaction()`. Same fix applied to `reactivateOrganization`. — `apps/web/app/lib/actions/organization-suspension.ts` — **Severity: Critical — FIXED 2026-03-09**

### High

- ✅ **Server actions `createPlan`, `updatePlan`, `getPlans` have no auth check** — **FIXED**: All three functions now assert `role === 'SUPER_ADMIN'` at the top. — `apps/web/app/lib/actions/plans.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **Server action `suspendOrgLicenses` / `reactivateOrgLicenses` has no auth check** — **FIXED**: Both helpers now assert `SUPER_ADMIN` role before executing DB mutations. — `apps/web/app/lib/actions/license.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ **`/dashboard/organizations/page.tsx` lacks role guard — exposes cross-tenant data** — **FIXED**: `prisma.organization.findMany()` now scoped to `{ id: tenantCtx.organizationId }` for non-SUPER_ADMIN users. SUPER_ADMIN still sees all organizations. — `apps/web/app/dashboard/organizations/page.tsx` — **Severity: High — FIXED 2026-03-09**

### Medium

- ✅ **Password fallback comparison allows plaintext passwords** — **FIXED**: Removed the `|| password === user.password` plaintext fallback from `auth.ts:37`. Login now uses `await bcrypt.compare(password, user.password)` exclusively. If a hash is malformed, authentication fails safely. — `apps/web/auth.ts` — **Severity: Medium — FIXED 2026-03-09**

### Low

- 🔵 **`tenants/[id]` PATCH is not atomic — plan fetch and org update are separate operations** — The risk window is negligible (plan deletion mid-update is an admin-only operation). Accepted as low risk; no functional fix needed. — `apps/web/app/api/admin/tenants/[id]/route.ts` — **Severity: Low — Accepted**

---

## Fix Status

- [x] **[Critical]** Restrict all `/api/admin/**` routes to `role === 'SUPER_ADMIN'` only — **FIXED**
- [x] **[Critical]** Add session auth checks to `organization-suspension.ts`, `plans.ts`, `license.ts` — **FIXED**
- [x] **[Critical]** Wrap `suspendOrganization` / `reactivateOrganization` in `prisma.$transaction()` — **FIXED**
- [x] **[High]** Scope `/dashboard/organizations/page.tsx` query to tenant — **FIXED**
- [x] **[Medium]** Remove plaintext password fallback in `auth.ts` — **FIXED**
- [x] **[Low]** `tenants/[id]` PATCH non-atomic plan fetch — **Accepted** (negligible risk window)

**Domain result**: 7/7 findings resolved (6 FIXED, 1 Accepted). ✅ CLEAN
