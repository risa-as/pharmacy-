# Tasks: SaaS Control Tower & Iron Wall

**Input**: Design documents from `specs/003-saas-control-limits/`
**Spec**: spec.md (6 user stories, 35 FRs, 15 SCs)
**Plan**: plan.md (TypeScript + Next.js 14 + Prisma + Electron)

---

## Phase 1: Setup

**Purpose**: Install the single new dependency needed before any implementation.

- [X] T001 Install `jose` JWT library in `apps/web` for offline token signing: `pnpm add jose --filter @faramace/web`
- [X] T002 [P] Install `jose` in `apps/desktop` for offline token verification: `pnpm add jose --filter @faramace/desktop`

---

## Phase 2: Foundational — Schema Additions (Blocking)

**Purpose**: Add the two schema fields that every subsequent phase depends on. CTO has mandated these as Task 1.

**⚠️ CRITICAL**: No US2–US6 work can begin until this phase is complete.

- [X] T003 [SYNC-IMPACT] Add `isSuspended Boolean @default(false)` and `suspendedAt DateTime?` fields to the `Organization` model in `apps/web/prisma/schema.prisma`. Add these immediately after the `subscriptionEndsAt` field (around line 746).
- [X] T004 [SYNC-IMPACT] Add `suspendedByOrgSuspension Boolean @default(false)` field to the `DeviceLicense` model in `apps/web/prisma/schema.prisma`. Add it after the `isActive` field (around line 868).
- [X] T005 Run `pnpm --filter @faramace/web prisma migrate dev --name "add_suspension_fields"` to generate and apply the Prisma migration for the schema changes in T003 and T004.
- [X] T006 Run `pnpm --filter @faramace/web prisma generate` to regenerate the Prisma client so TypeScript types for `isSuspended`, `suspendedAt`, and `suspendedByOrgSuspension` are available.

**Checkpoint**: `isSuspended`, `suspendedAt`, and `suspendedByOrgSuspension` are now available as typed Prisma fields. All subsequent phases can proceed.

---

## Phase 3: User Story 1 — SUPER_ADMIN Control Tower Isolation (Priority: P1) 🎯 MVP

**Goal**: SUPER_ADMIN sees the platform Control Tower nav. Pharmacy users see only pharmacy nav. Each group is blocked from the other's routes.

**Independent Test**: Log in as SUPER_ADMIN → sidebar shows only Overview/Tenants/Licenses/Settings. Log in as ADMIN → sidebar shows pharmacy nav. Manually navigate to `/dashboard/sales` as SUPER_ADMIN → redirected. Manually navigate to `/dashboard/tenants` as ADMIN → redirected.

- [X] T007 [US1] Create `apps/web/app/lib/super-admin-guard.ts` — export two arrays: `SUPER_ADMIN_ROUTES` (the routes accessible only to SUPER_ADMIN: `/dashboard/tenants`, `/dashboard/admin`, `/dashboard/admin/licenses`) and `PHARMACY_ONLY_ROUTES` (the route prefixes blocked for SUPER_ADMIN: `/dashboard/drugs`, `/dashboard/inventory`, `/dashboard/sales`, `/dashboard/patients`, `/dashboard/prescriptions`, `/dashboard/reports`, `/dashboard/debts`, `/dashboard/suppliers`, `/dashboard/purchases`). Export `isSuperAdminRoute(pathname)` and `isPharmacyOnlyRoute(pathname)` helper functions that test a pathname against these arrays.
- [X] T008 [US1] Modify `apps/web/app/ui/dashboard/sidenav.tsx` — add a second nav sections array `controlTowerSections` above the existing `sections` array. Control Tower contains 4 links: Overview (`/dashboard` icon: `BarChart3`), Tenants (`/dashboard/tenants` icon: `Building2`), Licenses (`/dashboard/admin/licenses` icon: `Crown`), Settings (`/dashboard/settings` icon: `SettingsIcon`). Modify the component render: when `userRole === 'SUPER_ADMIN'`, use `controlTowerSections` instead of `filteredSections`, and hide the Users/Settings footer buttons (render nothing in the admin footer for SUPER_ADMIN — they have Settings in their main nav).
- [X] T009 [US1] Modify `apps/web/middleware.ts` — import `isSuperAdminRoute` and `isPharmacyOnlyRoute` from `@/app/lib/super-admin-guard`. In the middleware function, after the existing auth check, read `token.role` from the session. If role is `SUPER_ADMIN` and `isPharmacyOnlyRoute(pathname)` is true, redirect to `/dashboard`. If role is `ADMIN`, `PHARMACIST`, or `CASHIER` and `isSuperAdminRoute(pathname)` is true, redirect to `/dashboard`. Apply this check only to paths starting with `/dashboard/`.

**Checkpoint**: US1 fully functional. SUPER_ADMIN is isolated from pharmacy routes; pharmacy users are isolated from Control Tower routes.

---

## Phase 4: User Story 2 — Backend Iron Wall (Priority: P2)

**Goal**: Creating a branch or user beyond the plan limit is rejected at the API layer with a structured 403 response, regardless of how the request is made.

**Independent Test**: Using curl or browser devtools, POST to `/api/branches` or `/api/users` while the org is at its plan limit → receive HTTP 403 with `{ limitReached: true, current: N, max: N, upgradeRequired: true }`.

- [X] T010 [US2] Create `apps/web/app/lib/saas-guards.ts` — export `checkPlanLimit(orgId: string, resource: 'branches' | 'users', prisma: PrismaClient): Promise<{ allowed: boolean; current: number; max: number; upgradeRequired: boolean }>`. Logic: for `'branches'`, query `prisma.branch.count({ where: { organizationId: orgId } })` and compare to `org.maxBranches`. For `'users'`, query `prisma.user.count({ where: { organizationId: orgId } })` and compare to `org.maxUsers`. Treat `max === -1` or `max === null` as unlimited (always return `allowed: true`). Treat `max === 0` as "immediately at limit".
- [X] T011 [US2] Modify the `POST` handler in `apps/web/app/api/branches/route.ts` — call `checkPlanLimit(orgId, 'branches', prisma)` before the `prisma.branch.create(...)` call. If `!result.allowed`, return `NextResponse.json({ limitReached: true, current: result.current, max: result.max, upgradeRequired: true }, { status: 403 })`. Do not modify the success path.
- [X] T012 [US2] Read `apps/web/app/api/users/route.ts`. Locate the `POST` handler. Call `checkPlanLimit(orgId, 'users', prisma)` before the `prisma.user.create(...)` call. If `!result.allowed`, return `NextResponse.json({ limitReached: true, current: result.current, max: result.max, upgradeRequired: true }, { status: 403 })`. Do not modify the success path.

**Checkpoint**: US2 fully functional. API-level limit enforcement is in place for both branches and users.

---

## Phase 5: User Story 3 — Frontend Upgrade Prompts (Priority: P3)

**Goal**: When a plan limit 403 is returned, the form replaces the error state with an Arabic-language inline upgrade prompt and a "ترقية الخطة" button.

**Independent Test**: Submit "Add User" form when at the user limit → Arabic inline message appears with upgrade button. Submit "Add Branch" form when at branch limit → same. Submit with a non-limit error → normal error shown, not upgrade prompt.

- [X] T013 [US3] Create `apps/web/app/ui/upgrade-prompt.tsx` — a reusable `"use client"` component that accepts `resource: 'users' | 'branches'` prop. Renders an amber/warning box with the Arabic message (users: "لقد وصلت إلى الحد الأقصى من المستخدمين في خطتك. يرجى الترقية للاستمرار." / branches: "لقد وصلت إلى الحد الأقصى من الفروع في خطتك. يرجى الترقية للاستمرار.") and an "ترقية الخطة" Link button that navigates to `/dashboard/settings/billing`. Style using semantic tokens: `bg-warning/10 border-warning/30 text-warning-foreground`. Import `CrownIcon` from lucide-react for the icon.
- [X] T014 [US3] Read `apps/web/app/ui/users/create-form.tsx`. Identify where the server action error is surfaced. Add state variable `isAtLimit: boolean`. On form submission error, check if the error response has `limitReached === true` — if so, set `isAtLimit = true`. In the JSX, render `<UpgradePrompt resource="users" />` (imported from `@/app/ui/upgrade-prompt`) when `isAtLimit` is true, otherwise render the normal error display.
- [X] T015 [US3] Read `apps/web/app/ui/branches/create-form.tsx`. Apply identical pattern as T014: add `isAtLimit` state, detect `limitReached: true` in the error response, render `<UpgradePrompt resource="branches" />` when at limit.

**Checkpoint**: US3 fully functional. Upgrade prompts appear correctly for both resources; non-limit errors show normal handling.

---

## Phase 6: User Story 4 — Subscription Timers & Grace Period (Priority: P4)

**Goal**: All authenticated web pages show subscription health banners. Write operations are selectively blocked in the grace period. A full read-only suspended overlay is shown after the grace period ends.

**Independent Test**: Set `subscriptionEndsAt` to 5 days from now in DB → amber banner appears. Set it to yesterday → red countdown banner appears and admin-write actions return 403. Set it to 6 days ago → suspended overlay replaces dashboard content. POS sale succeeds in all non-suspended states.

- [X] T016 [US4] Create `apps/web/app/lib/subscription-state.ts` — export type `SubscriptionState = 'active' | 'warning' | 'grace' | 'suspended'` and function `getSubscriptionState(org: { subscriptionEndsAt: Date | null; isSuspended: boolean }): { state: SubscriptionState; daysUntilExpiry: number | null; graceEndsAt: Date | null }`. Logic: if `isSuspended` is true, return `'suspended'`. If `subscriptionEndsAt` is null, return `'active'`. If now < expiry and (expiry - now) <= 7 days, return `'warning'`. If expiry < now and (now - expiry) <= 5 days, return `'grace'` with `graceEndsAt = expiry + 5 days`. If (now - expiry) > 5 days, return `'suspended'`. Otherwise return `'active'`.
- [X] T017 [US4] Create `apps/web/app/ui/dashboard/subscription-banner.tsx` — a `"use client"` component that accepts `state: SubscriptionState`, `daysUntilExpiry: number | null`, and `graceEndsAt: Date | null` props. Renders: for `'warning'` state, a dismissible amber banner (`bg-warning/10 border-warning`) with "تنتهي اشتراكك خلال X أيام — جدد الآن" and a session-storage dismiss button. For `'grace'` state, a non-dismissible red banner (`bg-destructive/10 border-destructive`) with "يتوقف النظام خلال" and a live `<CountdownTimer targetDate={graceEndsAt} />` that updates every second showing `X أيام : HH:MM:SS`. Both include a "جدد الاشتراك" link to `/dashboard/settings/billing`.
- [X] T018 [US4] Create `apps/web/app/lib/grace-period-guard.ts` — export the CTO-approved `GRACE_PERIOD_BLOCKED_OPERATIONS` constant: an array of blocked route+method patterns (POST /api/users, POST /api/branches, POST /api/admin/*, PATCH /api/settings/*, POST /api/inventory/*, POST /api/suppliers, POST /api/drugs). Export `isBlockedInGracePeriod(pathname: string, method: string): boolean` that checks the incoming request against this list.
- [X] T019 [US4] Read `apps/web/app/dashboard/layout.tsx`. This is the root layout for all dashboard pages. Add server-side logic at the top of the layout: fetch the current organization's `{ subscriptionEndsAt, isSuspended }` from the database using the session's `organizationId`, call `getSubscriptionState(org)`, and pass the result as props to `<SubscriptionBanner>`. Import and render `<SubscriptionBanner>` at the very top of the layout's content area (above `{children}`).
- [X] T020 [US4] Create `apps/web/app/ui/dashboard/suspended-overlay.tsx` — a `"use client"` component that covers the entire page with a full-screen overlay (`fixed inset-0 z-50 bg-background/95 backdrop-blur-md`). Shows: a prominent "الاشتراك موقوف" heading, descriptive text that data is viewable in read-only mode, a "تصدير ديون PDF" button linking to the debts export, and a "جدد الاشتراك" primary button linking to `/dashboard/settings/billing`. Use semantic tokens: `bg-destructive/10` for the alert area, `text-foreground` for text.
- [X] T021 [US4] Modify `apps/web/app/dashboard/layout.tsx` — add conditional rendering: if `subscriptionState.state === 'suspended'`, render `<SuspendedOverlay>` overlaid on top of `{children}` (use a wrapper div with `relative` positioning). The children must still render beneath it so historical data pages load (read-only viewing is intentional per spec FR-021).
- [X] T022 [US4] Modify `apps/web/middleware.ts` — import `isBlockedInGracePeriod` from `@/app/lib/grace-period-guard`. After the SUPER_ADMIN isolation checks (T009), add: fetch the org's subscription state from the session (or a lightweight DB check). If state is `'grace'` and `isBlockedInGracePeriod(pathname, method)` is true, return a 403 JSON response `{ gracePeriodActive: true, message: "الإجراءات الإدارية محدودة خلال فترة السماح. يرجى تجديد الاشتراك." }`.

**Checkpoint**: US4 fully functional. Warning banners appear, grace-period write-blocks work, suspended overlay shows historical data read-only.

---

## Phase 7: User Story 5 — Tenant-License Binding & Suspension Cascade (Priority: P5)

**Goal**: Every new device license is bound to a specific organization. Suspending an org atomically kills all its licenses. Reactivating an org restores only the suspension-killed licenses.

**Independent Test**: Create a license without an orgId → rejected. Suspend an org with 3 licenses → all 3 licenses have `isActive = false` and `suspendedByOrgSuspension = true`. Reactivate → all 3 restored. Manually deactivate 1 license, then suspend org → that 1 remains inactive after reactivation.

- [X] T023 [US5] Read `apps/web/app/api/admin/licenses/route.ts`. Modify the `POST` handler: add `organizationId` as a required field in the request body validation. If `organizationId` is missing or empty, return `400 { error: "organizationId is required" }`. Pass `organizationId` to the `prisma.deviceLicense.create(...)` call. Note: `DeviceLicense` links to `Branch`, not `Organization` directly — the `organizationId` here should be used to validate that the selected `branchId` belongs to the specified organization before creating the license.
- [X] T024 [US5] Read `apps/web/app/dashboard/admin/licenses/page.tsx`. Modify the license creation form to include a mandatory "المؤسسة" (Organization) selector dropdown. The dropdown should fetch all organizations via a server action and populate the select. The selected org should be passed as `organizationId` in the form submission. When an org is selected, the Branch selector (if present) should filter to show only branches belonging to that org.
- [X] T025 [US5] Create or modify `apps/web/app/lib/actions/license.ts` — add `suspendOrgLicenses(orgId: string): Promise<void>`. Logic: (1) Fetch all branch IDs for the org: `prisma.branch.findMany({ where: { organizationId: orgId }, select: { id: true } })`. (2) In a single `prisma.$transaction`, run `prisma.deviceLicense.updateMany({ where: { branchId: { in: branchIds }, isActive: true }, data: { isActive: false, suspendedByOrgSuspension: true } })`.
- [X] T026 [US5] In `apps/web/app/lib/actions/license.ts` — add `reactivateOrgLicenses(orgId: string): Promise<void>`. Logic: (1) Fetch all branch IDs for the org. (2) In a single `prisma.$transaction`, run `prisma.deviceLicense.updateMany({ where: { branchId: { in: branchIds }, suspendedByOrgSuspension: true }, data: { isActive: true, suspendedByOrgSuspension: false } })`. This only restores licenses that were killed by the org suspension, not independently deactivated ones.
- [X] T027 [US5] Identify where an organization's `isSuspended` is set to `true` in the codebase (search `apps/web/app/lib/actions/` and `apps/web/app/api/` for `isSuspended`). In that location, add a call to `suspendOrgLicenses(orgId)` after the `prisma.organization.update(...)` that sets `isSuspended: true`. If no such location exists yet, create `apps/web/app/lib/actions/organization-suspension.ts` with a `suspendOrganization(orgId: string)` function that (1) sets `isSuspended: true, suspendedAt: new Date()` on the org and (2) calls `suspendOrgLicenses(orgId)`.
- [X] T028 [US5] Identify where an organization's `isSuspended` is set to `false` (reactivation). In that location, add a call to `reactivateOrgLicenses(orgId)` after the `prisma.organization.update(...)` that sets `isSuspended: false`. If creating a new function in T027, add `reactivateOrganization(orgId: string)` to the same `organization-suspension.ts` file.

**Checkpoint**: US5 fully functional. License-org binding is enforced on creation. Suspension cascade deactivates licenses atomically. Reactivation restores only suspension-killed licenses.

---

## Phase 8: User Story 6 — Offline Time-Bomb / Electron Lock (Priority: P6)

**Goal**: The Electron desktop app enforces subscription state offline using a server-signed JWT. Clock rollback is detected. After 14 days offline, the app locks regardless of clock state.

**Independent Test**: Disconnect network. Set local token `gracePeriodEndsAt` to yesterday → Lock Screen shown on startup. Roll system clock back before token `issuedAt` → Lock Screen shown. Delete local token → Lock Screen shown. Set token to valid future expiry → app opens normally.

- [X] T029 [US6] Create `apps/web/app/api/sync/offline-token/route.ts` — a `GET` endpoint (auth-protected). Reads the authenticated user's `organizationId`, fetches `{ subscriptionEndsAt, isSuspended }` from the org. Constructs a JWT payload: `{ organizationId, subscriptionEndsAt, gracePeriodEndsAt: subscriptionEndsAt + 5 days, isSuspended, issuedAt: new Date().toISOString(), maxOfflineDays: 14 }`. Signs it using `jose` with RS256 using the server's private key (stored in env var `OFFLINE_TOKEN_PRIVATE_KEY`). Returns `{ token: signedJwt }`. Include the public key in the response headers or a separate `GET /api/sync/offline-token/public-key` endpoint so the desktop app can verify.
- [X] T030 [US6] Create `apps/desktop/electron/offline-token.ts` — export four functions: (1) `storeOfflineToken(token: string): void` — save to Electron's secure userData directory as `offline-token.jwt`. (2) `loadOfflineToken(): string | null` — read from that file; return null if missing or unreadable. (3) `verifyAndDecodeToken(token: string, publicKey: string): OfflineTokenPayload | null` — use `jose` to verify RS256 signature with the bundled public key; return null on failure. (4) `evaluateSubscriptionState(payload: OfflineTokenPayload, lastSeenAt: Date | null): 'active' | 'grace' | 'suspended' | 'clock-tampered' | 'offline-limit-exceeded'` — implement the logic: check clock rollback (now < issuedAt → 'clock-tampered'), check offline limit (now - issuedAt > maxOfflineDays * 86400000 → 'offline-limit-exceeded'), check isSuspended flag, check gracePeriodEndsAt and subscriptionEndsAt against current time.
- [X] T031 [US6] Modify `apps/desktop/electron/main.ts` — on `app.on('ready')` and `powerMonitor.on('resume')`, call the following sequence: (1) `const rawToken = loadOfflineToken()` — if null, show Lock Screen. (2) `const payload = verifyAndDecodeToken(rawToken, PUBLIC_KEY)` — if null (bad signature/corrupt), show Lock Screen. (3) `const state = evaluateSubscriptionState(payload, lastSeenAt)` — if state is anything other than `'active'`, send an IPC event `subscription:locked` with the state reason to the renderer. The renderer should show the Lock Screen for `grace`/`suspended`/`clock-tampered`/`offline-limit-exceeded`. Bundle the RS256 public key as a constant in this file (copied from env at build time).
- [X] T032 [US6] Read `apps/desktop/src/components/LicenseScreen.tsx`. Modify (or verify it already handles) the subscription-suspended lock state: it should display the "الاشتراك موقوف" message, show the state reason (grace period / suspended / clock tampered / offline limit exceeded) with appropriate Arabic text for each, and provide a "الاتصال بالانترنت للتحديث" retry button that triggers a new online check-in attempt. Keep the existing license-key entry flow separate from this subscription lock flow.
- [X] T033 [US6] Modify `apps/desktop/electron/sync.ts` — after a successful sync/check-in API call, fetch `GET /api/sync/offline-token` (using the existing authenticated HTTP client). Call `storeOfflineToken(response.token)`. Also store the current timestamp as `lastSeenAt` in the Electron store (`electron-store` or equivalent) so the clock-rollback check has a reference point.

**Checkpoint**: US6 fully functional. Desktop app enforces lock screen offline for all suspension states, detects clock rollback, and enforces the 14-day forced check-in window.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T034 [P] Audit `apps/web/app/ui/dashboard/sidenav.tsx` — verify the Control Tower nav renders exactly 4 items for SUPER_ADMIN (Overview, Tenants, Licenses, Settings) and that no pharmacy nav items appear in any rendered DOM output when `userRole === 'SUPER_ADMIN'`.
- [X] T035 [P] Verify `GRACE_PERIOD_BLOCKED_OPERATIONS` in `apps/web/app/lib/grace-period-guard.ts` matches the CTO-approved table from spec FR-019 exactly: confirm POST `/api/users`, POST `/api/branches`, POST `/api/admin/*`, PATCH `/api/settings/*`, POST `/api/inventory/*`, POST `/api/suppliers`, POST `/api/drugs` are all blocked; confirm POS sale routes, patient routes, prescription routes, return routes are NOT in the blocked list.
- [X] T036 [P] Add `isSuspended` to the organization data fetched in `apps/web/app/dashboard/layout.tsx` so that the `getSubscriptionState` call has the complete org object. Verify the layout correctly passes state to both `<SubscriptionBanner>` (for warning/grace) and `<SuspendedOverlay>` (for suspended).
- [X] T037 Update the `spec.md` assumption about `isSuspended` being missing — mark it as implemented. Update the checklist at `specs/003-saas-control-limits/checklists/requirements.md` to reflect all tasks completed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — can start immediately after schema migration
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US3 (Phase 5)**: Depends on US2 (T010–T012) — needs the 403 response format
- **US4 (Phase 6)**: Depends on Phase 2 (needs `isSuspended` field) — can run in parallel with US1/US2
- **US5 (Phase 7)**: Depends on Phase 2 (needs `suspendedByOrgSuspension`) — can run in parallel
- **US6 (Phase 8)**: Depends on Phase 1 (needs `jose`) — mostly independent, desktop-only
- **Polish (Phase 9)**: Depends on all phases complete

### Parallel Opportunities Within Each Phase

```
Phase 2:  T003 ‖ T004 → T005 → T006
Phase 3:  T007 → T008 → T009
Phase 4:  T010 → T011 ‖ T012
Phase 5:  T013 → T014 ‖ T015
Phase 6:  T016 ‖ T018 → T017 → T019 → T020 → T021 → T022
Phase 7:  T023 ‖ T024, then T025 → T026 → T027 → T028
Phase 8:  T029 (web) ‖ T030 (desktop) → T031 → T032 → T033
Phase 9:  T034 ‖ T035 ‖ T036 → T037
```

### Single-Developer Sequential Order

T001 → T002 → T003 → T004 → T005 → T006 →
T007 → T008 → T009 →
T010 → T011 → T012 →
T013 → T014 → T015 →
T016 → T017 → T018 → T019 → T020 → T021 → T022 →
T023 → T024 → T025 → T026 → T027 → T028 →
T029 → T030 → T031 → T032 → T033 →
T034 → T035 → T036 → T037

---

## Implementation Strategy

### MVP (US1 Only — Security Critical)

1. Complete Phase 1 (Setup) + Phase 2 (Schema)
2. Complete Phase 3 (US1 — Control Tower Isolation)
3. **STOP AND VALIDATE**: SUPER_ADMIN cannot see pharmacy pages; pharmacy users cannot see admin pages
4. Ship — this is the most critical security fix

### Full Incremental Delivery

1. Foundation (T001–T006) → Schema ready
2. US1 (T007–T009) → Control Tower isolated ✓
3. US2 (T010–T012) → Iron Wall active at API layer ✓
4. US3 (T013–T015) → Upgrade prompts wired to UI ✓
5. US4 (T016–T022) → Subscription lifecycle banners + grace enforcement ✓
6. US5 (T023–T028) → License DRM binding + cascade ✓
7. US6 (T029–T033) → Electron offline time-bomb ✓
8. Polish (T034–T037) → Final validation ✓

---

## Notes

- **[P]** = different files, no dependencies on in-progress tasks — safe to run in parallel
- **[SYNC-IMPACT]** = T003–T004 affect the Prisma schema; desktop schema migration may also be needed if `DeviceLicense` is mirrored in `apps/desktop/prisma/schema.prisma`
- Tasks T029–T033 touch both `apps/web` (token issuer) and `apps/desktop` (token consumer) — the RS256 public key must be consistent between them
- The `OFFLINE_TOKEN_PRIVATE_KEY` env var must be set in the web server environment before T029 is deployed
- Check `apps/web/app/api/users/route.ts` path in T012 — user creation may route through a server action instead of an API route; read the file first and adapt

---

## Phase 10: Hotfixes (UI Content Isolation)

**Goal**: Complete the Control Tower experience by ensuring UI elements inside shared routes (like `/dashboard` and `/dashboard/settings`) do not render pharmacy components for `SUPER_ADMIN`.

- [X] T038 Isolate Dashboard Home (`apps/web/app/dashboard/page.tsx`):
  - Fetch the session role.
  - If `role === 'SUPER_ADMIN'`, DO NOT render the pharmacy components.
  - Render a `<SuperAdminOverview />` view directly in the page displaying Platform-level metric cards in Arabic: "إجمالي المؤسسات" (Total Organizations) and "التراخيص النشطة" (Active Licenses).
  - Connect cards to `prisma.organization.count()` and `prisma.deviceLicense.count({where: {isActive: true}})`.

- [X] T039 Isolate Settings Page (`apps/web/app/dashboard/settings/page.tsx` & layout):
  - If `role === 'SUPER_ADMIN'`, completely hide pharmacy-specific settings forms.
  - Render a "Platform Settings / إعدادات المنصة" UI.
  - Ensure any settings sidebar/navigation hides pharmacy tabs for the SUPER_ADMIN.
