# Findings: Super Admin System (US3)

**Auditor**: Claude Code
**Date**: 2026-03-09
**Severity Scale**: Critical > High > Medium > Low

---

## Admin Route Inventory

| Route | Method | Role Check | Role Required | Status |
|-------|--------|-----------|---------------|--------|
| /api/admin/provision-tenant | POST | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/tenants | GET | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/tenants | POST | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/tenants/[id] | PATCH | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/tenants/[id] | DELETE | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/organizations | GET | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/licenses | GET | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/licenses | POST | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/licenses/[id] | PATCH | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/licenses/[id] | DELETE | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |
| /api/admin/plans | GET | YES | `ADMIN \|\| SUPER_ADMIN` | ⚠️ WEAK |

**Note on "WEAK" status**: Every admin route accepts `role === 'ADMIN'` in addition to `role === 'SUPER_ADMIN'`. The `ADMIN` role is the per-tenant pharmacy owner role — not a platform super-admin. This means any pharmacy owner can call these cross-tenant management endpoints.

---

## Dashboard Page Inventory

| Page | Path | Role Guard | Guard Level | Status |
|------|------|-----------|-------------|--------|
| Admin root layout | `/dashboard/admin/layout.tsx` | YES | `SUPER_ADMIN` only | ✅ PASS |
| Tenants sub-layout | `/dashboard/admin/tenants/layout.tsx` | YES | `SUPER_ADMIN` only | ✅ PASS |
| Tenants page | `/dashboard/admin/tenants/page.tsx` | Inherited from layout | — | ✅ PASS |
| Licenses page | `/dashboard/admin/licenses/page.tsx` | Inherited from layout | — | ✅ PASS |
| Plans page | `/dashboard/admin/plans/page.tsx` | Inherited from layout | — | ✅ PASS |
| Organizations page | `/dashboard/organizations/page.tsx` | NONE | — | ❌ FAIL |

---

## Server Actions Inventory

| Action File | Functions | Auth Guard | Status |
|-------------|-----------|-----------|--------|
| `organization-suspension.ts` | `suspendOrganization`, `reactivateOrganization` | NONE | ❌ FAIL |
| `plans.ts` | `createPlan`, `updatePlan`, `getPlans` | NONE | ❌ FAIL |
| `license.ts` | `suspendOrgLicenses`, `reactivateOrgLicenses` | NONE | ❌ FAIL |

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

## FAIL Items

- ❌ **All admin API routes accept `ADMIN` role — platform-level endpoints accessible by tenant owners** — Every route under `/api/admin/` checks `role === 'ADMIN' || role === 'SUPER_ADMIN'`. The `ADMIN` role is the per-tenant pharmacy owner, not a platform administrator. This means any pharmacy owner can call `GET /api/admin/tenants` (view all tenants), `POST /api/admin/tenants` (create new tenants), `GET /api/admin/licenses` (see all license keys including other tenants'), `POST /api/admin/licenses` (issue licenses for any branch), `PATCH/DELETE /api/admin/licenses/[id]` (revoke any license), and `PATCH/DELETE /api/admin/tenants/[id]` (edit or delete any organization). This is a critical privilege escalation vulnerability.
  - `apps/web/app/api/admin/provision-tenant/route.ts:22` — Severity: **Critical**
  - `apps/web/app/api/admin/tenants/route.ts:14` (GET), `route.ts:57` (POST) — Severity: **Critical**
  - `apps/web/app/api/admin/tenants/[id]/route.ts:13` (PATCH), `route.ts:63` (DELETE) — Severity: **Critical**
  - `apps/web/app/api/admin/organizations/route.ts:11` — Severity: **Critical**
  - `apps/web/app/api/admin/licenses/route.ts:13` (GET), `route.ts:40` (POST) — Severity: **Critical**
  - `apps/web/app/api/admin/licenses/[id]/route.ts:15` (PATCH), `route.ts:70` (DELETE) — Severity: **Critical**
  - `apps/web/app/api/admin/plans/route.ts:13` (GET) — Severity: **High**

- ❌ **Server action `suspendOrganization` / `reactivateOrganization` has no auth check** — `apps/web/app/lib/actions/organization-suspension.ts:12-57`. These Next.js Server Actions accept `orgId` and immediately operate on the database without verifying the caller's session or role. Any authenticated user who can invoke the action (e.g., via a crafted form submission or direct call) can suspend or reactivate any organization. Severity: **Critical**

- ❌ **Server actions `createPlan`, `updatePlan`, `getPlans` have no auth check** — `apps/web/app/lib/actions/plans.ts:6-71`. Plan management (creating, modifying pricing, enabling/disabling plans) has no session validation. These actions are used by the admin plans page but are unguarded at the action level itself. Severity: **High**

- ❌ **Server action `suspendOrgLicenses` / `reactivateOrgLicenses` has no auth check** — `apps/web/app/lib/actions/license.ts:10-57`. Direct database mutation helpers with no auth guard. Severity: **High**

- ❌ **`suspendOrganization` is non-atomic — two separate DB operations can diverge** — `apps/web/app/lib/actions/organization-suspension.ts:14-22`. The function first updates the Organization record (`prisma.organization.update`) then calls `suspendOrgLicenses()` as a separate operation. If the second call fails, the organization will be marked suspended but its licenses will remain active, leading to an inconsistent state. Neither operation is wrapped in a single `prisma.$transaction()`. Severity: **High**

- ❌ **`reactivateOrganization` has the same non-atomic two-step pattern** — `apps/web/app/lib/actions/organization-suspension.ts:38-51`. Same issue as above in reverse: if `reactivateOrgLicenses()` throws after the organization has been marked active, licenses remain suspended while the org appears active. Severity: **High**

- ❌ **`/dashboard/organizations/page.tsx` lacks role guard — exposes cross-tenant data** — `apps/web/app/dashboard/organizations/page.tsx`. This page performs `prisma.organization.findMany()` (all organizations, no tenant filter) and renders them. It uses `getTenantContext()` only for redirect-on-unauthenticated logic, not to filter data. The page has no SUPER_ADMIN check on itself or its parent layout, making it accessible to any authenticated user (ADMIN or lower) who navigates to `/dashboard/organizations`. Severity: **High**

- ❌ **Password fallback comparison allows plaintext passwords** — `apps/web/auth.ts:37`. The login logic is `await bcrypt.compare(...).catch(() => false) || password === user.password`. If bcrypt throws (e.g., stored hash is malformed or the value is a plaintext legacy entry), the code falls back to a direct string comparison. A user with a plaintext password stored in the database can authenticate with it. Severity: **Medium**

- ❌ **`tenants/[id]` PATCH is not atomic — plan fetch and org update are separate operations** — `apps/web/app/api/admin/tenants/[id]/route.ts:29-42`. The plan is fetched and then the organization is updated in two sequential non-transactional calls. If the plan is deleted or changed between the two operations, the update will silently apply stale plan values. Severity: **Low**

---

## Needs Fix

- [ ] **[Critical]** Restrict all `/api/admin/**` routes to `role === 'SUPER_ADMIN'` only. Remove the `|| role === 'ADMIN'` fallback from every admin route guard. Affects: `provision-tenant/route.ts:22`, `tenants/route.ts:14,57`, `tenants/[id]/route.ts:13,63`, `organizations/route.ts:11`, `licenses/route.ts:13,40`, `licenses/[id]/route.ts:15,70`, `plans/route.ts:13`.

- [ ] **[Critical]** Add session auth checks to all three server action files: `organization-suspension.ts`, `plans.ts`, `license.ts`. Each exported function must call `auth()` and assert `role === 'SUPER_ADMIN'` before executing any DB operation.

- [ ] **[Critical]** Wrap `suspendOrganization` in a single `prisma.$transaction()` so that both `organization.update(isSuspended: true)` and `deviceLicense.updateMany(isActive: false)` are atomic. Same fix for `reactivateOrganization`.

- [ ] **[High]** Add a `SUPER_ADMIN`-only guard to `/dashboard/organizations/page.tsx` (or its parent layout). Consider whether this page should be merged into the admin panel or access-controlled separately.

- [ ] **[Medium]** Remove the plaintext password fallback in `auth.ts:37`. Replace with a direct `await bcrypt.compare(password, user.password)`. If legacy plaintext accounts exist, add a migration script to re-hash them before deploying this fix.

- [ ] **[Low]** Wrap the `tenants/[id]` PATCH handler plan-fetch and org-update in a `prisma.$transaction()` to prevent stale-read inconsistencies.
