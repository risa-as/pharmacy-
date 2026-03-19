# Findings: Subscription & License Enforcement (US6)

**Auditor**: Claude Code
**Date**: 2026-03-09

---

## PASS Items

- ✅ Branch limit enforced via `checkPlanLimit` — `apps/web/app/lib/actions/branch.ts:40` calls `checkPlanLimit(organizationId, "branches")` before `prisma.branch.create()`; returns a structured error with current/max counts when the cap is reached.

- ✅ User limit enforced via `checkPlanLimit` — `apps/web/app/lib/actions/create-user-safe.ts:46` calls `checkPlanLimit(orgRef.organizationId, "users")` before creating; the user-creation form at `apps/web/app/ui/users/create-form.tsx:6` imports from this guarded action (not the unguarded `actions/user.ts`).

- ✅ `saas-guards.ts` supports unlimited Enterprise tier — `apps/web/app/lib/saas-guards.ts:66`: `max < 0` is treated as unlimited, allowing `-1` to represent an uncapped Enterprise plan.

- ✅ Stripe signature validation present — `apps/web/app/api/webhooks/stripe/route.ts:14-28`: signature header is required; `stripe.webhooks.constructEvent()` is called before any processing; missing signature returns 400.

- ✅ License `isActive` flag checked — `apps/web/app/api/license/verify/route.ts:33` checks `!license.isActive`; same check also present in activate route at `apps/web/app/api/license/activate/route.ts:30`.

- ✅ License `expiresAt` compared to current date — `apps/web/app/api/license/verify/route.ts:33`: `license.expiresAt && license.expiresAt < new Date()`.

- ✅ Hardware ID validated on verify — `apps/web/app/api/license/verify/route.ts:26-31`: mismatched `hardwareId` returns HTTP 403 "Hardware Mismatch".

- ✅ Hardware ID validated on activate (re-activation path) — `apps/web/app/api/license/activate/route.ts:61-77`: a license already bound to a different hardware ID returns HTTP 403.

- ✅ Offline token uses RS256 asymmetric signing — `apps/desktop/electron/offline-token.ts:68-70`: `jwtVerify` is called with an SPKI public key; private key never touches the device.

- ✅ Offline token decodes full subscription state — `OfflineTokenPayload` interface (`apps/desktop/electron/offline-token.ts:16-23`) carries `subscriptionEndsAt`, `gracePeriodEndsAt`, `isSuspended`, `maxOfflineDays`, and `issuedAt`.

- ✅ License expiry enforced offline — `apps/desktop/electron/offline-token.ts:126-130`: `subscriptionEndsAt` is compared to `Date.now()`; expired subscriptions return `"grace"` state.

- ✅ Clock-rollback (time-bomb) detection — `apps/desktop/electron/offline-token.ts:99-104`: returns `"clock-tampered"` if system time is behind `issuedAt` or `lastSeenAt`.

- ✅ Offline limit enforcement — `apps/desktop/electron/offline-token.ts:107-111`: `msOffline > maxOfflineMs` returns `"offline-limit-exceeded"`.

- ✅ Grace-period auto-suspension — `apps/desktop/electron/offline-token.ts:119-124`: past `gracePeriodEndsAt` escalates from grace to `"suspended"`.

---

## FAIL Items (Stripe — N/A for Iraq Deployment)

> **Note**: This project is deployed exclusively in Iraq. Iraq is not supported by Stripe as a merchant country. Payment processing is handled via **ZainCash** (Iraqi mobile wallet) and manual bank transfer (Rafidain Bank). The Stripe webhook route exists in code but is not configured or used in production. The following Stripe findings are marked **N/A** accordingly.

- ~~❌ `customer.subscription.deleted` not handled in Stripe webhook~~
  **→ N/A**: Stripe not used in Iraq deployment. Subscription lifecycle managed via ZainCash (`verifyZainCashPayment`) and manual renewal (`recordManualPayment`). — **Severity: Critical — N/A**

- ~~❌ `invoice.payment_failed` not handled in Stripe webhook~~
  **→ N/A**: Stripe not used. Failed ZainCash payments are handled via `verifyZainCashPayment()` returning `{ success: false }`; PENDING transactions auto-expire via `sweepExpiredPendingTransactions()`. — **Severity: Critical — N/A**

- ~~❌ `customer.subscription.updated` not handled~~
  **→ N/A**: Stripe not used. Plan changes are applied manually by SUPER_ADMIN via the admin tenant panel. — **Severity: High — N/A**

- ✅ ~~`STRIPE_WEBHOOK_SECRET` fallback to empty string~~ — **FIXED**: Replaced `process.env.STRIPE_WEBHOOK_SECRET || ""` with `requireEnv("STRIPE_WEBHOOK_SECRET")` which throws on missing env var; the webhook route now fails fast rather than silently accepting malformed payloads. — `apps/web/app/api/webhooks/stripe/route.ts:24` — **Severity: Medium — FIXED**

- ✅ ~~Legacy `createUser` in `actions/user.ts` has no plan-limit check~~ — **FIXED**: Added `checkPlanLimit(organizationId, "users")` call before user creation in `apps/web/app/lib/actions/user.ts`. — **Severity: High — FIXED**

- ✅ ~~`checkPlanLimit` for users excludes unassigned (org-level) admins~~ — **FIXED**: Updated user count query to use two-step approach: fetch branch IDs first, then count users with `OR: [{ branchId: { in: orgBranchIds } }, { branchId: null, role: "ADMIN" }]`. — `apps/web/app/lib/saas-guards.ts:62-75` — **Severity: Medium — FIXED**

- ✅ ~~`saas-guards.ts` uses first-org fallback instead of per-org Tenant mapping~~ — **RESOLVED (N/A)**: The guard already uses `prisma.organization.findUnique({ where: { id: organizationId }, include: { plan: true } })` — each org is correctly mapped to its own `SubscriptionPlan` via `Organization.planId`. No separate `tenantId` FK is needed. Stale TODO comment removed from `saas-guards.ts`. — `apps/web/app/lib/saas-guards.ts` — **Severity: High — N/A**

- 🔵 `apps/web/app/api/branches/route.ts` has no POST handler — Only `GET` is exported; branch creation is handled exclusively via a Server Action. Any future API consumer POSTing to `/api/branches` would receive a 405. Accepted — branch creation via Server Action is intentional and enforces plan limits. — `apps/web/app/api/branches/route.ts` — **Severity: Low — Accepted**

---

## Payment System Implemented (ZainCash + Manual)

- ✅ **ZainCash Phase 2** — `initiateZainCashPayment()` + `verifyZainCashPayment()` + `sweepExpiredPendingTransactions()` implemented in `apps/web/app/lib/actions/billing.ts`. JWT-signed API calls, idempotent verification, PENDING→COMPLETED/FAILED/EXPIRED state machine. Webhook callback at `/api/webhooks/zaincash/route.ts`.
- ✅ **Manual/Bank Transfer Phase 1** — `recordManualPayment()` implemented (SUPER_ADMIN only); creates a COMPLETED `PaymentTransaction` and atomically extends `subscriptionEndsAt` + clears suspension. UI integrated into admin tenant panel (`/dashboard/admin/tenants`).
- ✅ **Billing page** — Bank transfer instructions (Rafidain Bank) shown to tenant ADMINs at `/dashboard/settings/billing`. Payment history table with real `PaymentTransaction` data.

---

## Needs Fix

- [x] ~~Add `customer.subscription.deleted` handler~~ — N/A (ZainCash used)
- [x] ~~Add `invoice.payment_failed` handler~~ — N/A (ZainCash handles this)
- [x] ~~Add `customer.subscription.updated` handler~~ — N/A (manual plan management)
- [x] Replace `process.env.STRIPE_WEBHOOK_SECRET || ""` with hard throw — **FIXED**
- [x] Add `checkPlanLimit` to legacy `createUser` — **FIXED**
- [x] Fix user-count query in `saas-guards.ts` for null-branch admins — **FIXED**
- [x] ~~Add `organizationId → tenantId` FK on `Organization`~~ — N/A: Organization already maps to SubscriptionPlan via `planId`. No additional FK needed. Stale comment in `saas-guards.ts` removed.
