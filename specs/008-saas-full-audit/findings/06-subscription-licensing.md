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

## FAIL Items

- ❌ `customer.subscription.deleted` not handled in Stripe webhook — The switch statement handles only `payment_intent.succeeded`, `payment_intent.payment_failed`, and `charge.refunded`. A subscription cancellation falls into the `default` branch which only logs and does nothing; the organization is never suspended or marked inactive. — `apps/web/app/api/webhooks/stripe/route.ts:32-72` — **Severity: Critical**

- ❌ `invoice.payment_failed` not handled in Stripe webhook — Same switch: `invoice.payment_failed` is absent. A failed renewal invoice does not trigger any grace-period or suspension update on the `Organization` or `Tenant` record. — `apps/web/app/api/webhooks/stripe/route.ts:32-72` — **Severity: Critical**

- ❌ `customer.subscription.updated` not handled — Plan downgrades, seat-count changes, or trial-end events from Stripe are silently ignored; `Organization.maxBranches` / `maxUsers` and its linked `SubscriptionPlan` are never reconciled. — `apps/web/app/api/webhooks/stripe/route.ts:32-72` — **Severity: High**

- ❌ `STRIPE_WEBHOOK_SECRET` fallback to empty string — `process.env.STRIPE_WEBHOOK_SECRET || ""` means a misconfigured deployment silently passes an empty secret to `constructEvent`; should fail fast with a startup assertion instead. — `apps/web/app/api/webhooks/stripe/route.ts:24` — **Severity: Medium**

- ❌ Legacy `createUser` in `actions/user.ts` has no plan-limit check — The older `createUser` export at `apps/web/app/lib/actions/user.ts:26-73` performs no `checkPlanLimit` call. It is not currently wired to the create-user form, but `apps/web/app/ui/users/buttons.tsx` and edit paths still import from `actions/user`; any future re-wire or direct call bypasses the guard entirely. — `apps/web/app/lib/actions/user.ts:26-73` — **Severity: High**

- ❌ `checkPlanLimit` for users excludes unassigned (org-level) admins — The user count query `{ where: { branch: { organizationId } } }` omits users where `branchId` is `null`, so an admin with no branch assignment is not counted against the cap. — `apps/web/app/lib/saas-guards.ts:60-63` — **Severity: Medium**

- ❌ `saas-guards.ts` uses first-org fallback instead of per-org Tenant mapping — The guard resolves limits via `org?.plan` but there is no `organizationId → tenantId` FK on `Organization`, making plan resolution ambiguous in multi-tenant databases. Documented as a TODO but unresolved. — `apps/web/app/lib/saas-guards.ts:7-13` — **Severity: High**

- ❌ `apps/web/app/api/branches/route.ts` has no POST handler — Only `GET` is exported; branch creation is handled exclusively via a Server Action. Any future API consumer POSTing to `/api/branches` would receive a 405 with no enforcement layer in place. — `apps/web/app/api/branches/route.ts` — **Severity: Low**

---

## Needs Fix

- [ ] Add `customer.subscription.deleted` handler in `apps/web/app/api/webhooks/stripe/route.ts`: set `Organization.isSuspended = true` (or equivalent field) and clear the active plan reference.
- [ ] Add `invoice.payment_failed` handler: transition the org into a grace period and send a notification to the tenant admin.
- [ ] Add `customer.subscription.updated` handler: re-sync `maxBranches`, `maxUsers`, and plan tier from Stripe subscription metadata or product lookup.
- [ ] Replace `process.env.STRIPE_WEBHOOK_SECRET || ""` with a hard throw or startup assertion so misconfigured deployments fail loudly instead of proceeding with an empty secret.
- [ ] Delete or merge `apps/web/app/lib/actions/user.ts::createUser` into `create-user-safe.ts` to eliminate the unguarded duplicate; or add `checkPlanLimit` inline and remove the separate safe file.
- [ ] Fix the user-count query in `saas-guards.ts` to include org-level users with `branchId IS NULL` — requires either an `organizationId` column on `User` or a separate count path for admins not tied to a branch.
- [ ] Add `organizationId → tenantId` FK on `Organization` (as noted in the saas-guards TODO) so each org is evaluated against its own Tenant plan, not the first Tenant found in the database.
