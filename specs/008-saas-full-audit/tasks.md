# Tasks: SaaS Pharmacy Management System — Full Audit & QA

**Input**: `specs/008-saas-full-audit/plan.md`, `specs/008-saas-full-audit/spec.md`
**Branch**: `008-saas-full-audit`
**Total Tasks**: 121 — ✅ ALL COMPLETE (2026-03-09)
**Audit Domains**: 8 (Tenant Isolation · Sync · Super Admin · Web Pages · POS · Subscriptions · Mobile · Data Integrity)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable — different files, no inter-task dependency
- **[Story]**: Maps to user story in spec.md (US1–US8)
- **Audit task**: Read code, test behaviour, document in `findings/`
- **Fix task**: Remediate a confirmed issue
- **Verify task**: Confirm fix resolves the finding

---

## Phase 1: Setup — Audit Environment & Scaffolding

**Purpose**: Prepare the test environment and findings structure before any domain audit begins.

- [X] T001 Create findings directory tree: `mkdir -p specs/008-saas-full-audit/findings` and create stub files `findings/00-executive-summary.md`, `findings/01-tenant-isolation.md`, `findings/02-sync-correctness.md`, `findings/03-super-admin.md`, `findings/04-web-pages.md`, `findings/05-pos-flows.md`, `findings/06-subscription-licensing.md`, `findings/07-mobile-app.md`, `findings/08-data-integrity.md` — each with PASS/FAIL/Needs-Fix sections per `plan.md` findings format
- [X] T002 [P] Verify test environment: confirm two separate Organizations exist in the web database (Org-A and Org-B), each with at least one Branch, one ADMIN user, one PHARMACIST user, and one CASHIER user — document credentials in `findings/00-executive-summary.md` (test accounts, not production)
- [X] T003 [P] Seed test inventory: confirm at least 10 `GlobalDrug` + `Inventory` records exist in Org-A's branch with known barcodes, prices, and stock quantities — document seed state in `findings/00-executive-summary.md`
- [X] T004 Verify `apps/web/app/lib/tenant-utils.ts` exists and exports `getTenantContext()` — read the file and document its exact logic (how it resolves organizationId and branchId from session) in `findings/01-tenant-isolation.md`

**Checkpoint**: Findings stubs exist, test environment documented, `getTenantContext()` logic understood.

---

## Phase 2: Foundational — Cross-Cutting Code Inventory

**Purpose**: Catalogue every API route, sync route, and admin route so Phases 3–10 have a complete checklist to work through.

- [X] T005 [P] Inventory all non-admin, non-sync API routes: use `find apps/web/app/api -name "route.ts" | grep -v "/admin/" | grep -v "/sync/"` — produce a table in `findings/01-tenant-isolation.md` with columns: Route Path · HTTP Methods · getTenantContext called (Y/N/Unknown)
- [X] T006 [P] Inventory all sync routes: list the 12 routes under `apps/web/app/api/sync/` — add to `findings/02-sync-correctness.md` with columns: Route · Method · branchId validated (Y/N) · idempotency mechanism (ID check/upsert/other)
- [X] T007 [P] Inventory all admin routes: list the 7 routes under `apps/web/app/api/admin/` — add to `findings/03-super-admin.md` with columns: Route · Role check present (Y/N) · Role checked (ADMIN/SUPER_ADMIN/both)
- [X] T008 Read `apps/web/auth.config.ts` and document: exact role enum values, path-based access rules, `canAccessPath()` logic — add to `findings/01-tenant-isolation.md`

**Checkpoint**: Complete route inventory ready; Phases 3–10 can proceed in parallel.

---

## Phase 3: US1 — Tenant Data Isolation Audit (Priority: P1) 🔴 CRITICAL

**Goal**: Confirm that every API route enforces tenant scoping and no cross-tenant data leakage is possible.

**Independent Test**: Authenticate as Org-B user, call `/api/patients` — response must be empty (Org-A's patients must not appear).

### 3.1 — Auth & Middleware Audit

- [X] T009 [US1] Read `apps/web/middleware.ts` — verify it blocks unauthenticated access to `/dashboard/*` and `/api/*` (excluding `/api/auth/*` and `/api/health`) — document result in `findings/01-tenant-isolation.md`
- [X] T010 [US1] Read `apps/web/app/lib/tenant-utils.ts` — verify `getTenantContext()` returns a `NextResponse` (error) if session is missing or user has no branchId/organizationId — document in `findings/01-tenant-isolation.md`
- [X] T011 [US1] Manual test: send unauthenticated GET to `/api/patients` — confirm HTTP 401 response — document in `findings/01-tenant-isolation.md`
- [X] T012 [US1] Manual test: send unauthenticated GET to `/api/inventory` — confirm HTTP 401 — document in `findings/01-tenant-isolation.md`

### 3.2 — Core Business Route Audit (cross-tenant isolation)

- [X] T013 [US1] Read `apps/web/app/api/patients/route.ts` — verify GET applies `getTenantContext()` scope to the Prisma query — document PASS/FAIL in `findings/01-tenant-isolation.md`
- [X] T014 [P] [US1] Read `apps/web/app/api/inventory/route.ts` — verify GET/POST apply tenant scope — document in `findings/01-tenant-isolation.md`
- [X] T015 [P] [US1] Read `apps/web/app/api/sales/route.ts` — verify GET applies tenant scope — document in `findings/01-tenant-isolation.md`
- [X] T016 [P] [US1] Read `apps/web/app/api/suppliers/route.ts` — verify GET applies tenant scope and `branchId` validation on POST — document in `findings/01-tenant-isolation.md`
- [X] T017 [P] [US1] Read `apps/web/app/api/purchases/route.ts` and `apps/web/app/api/purchases/create/route.ts` — verify tenant scope on both GET and POST — document in `findings/01-tenant-isolation.md`
- [X] T018 [P] [US1] Read `apps/web/app/api/debts/route.ts` and `apps/web/app/api/debts/[id]/route.ts` — verify tenant scope — document in `findings/01-tenant-isolation.md`
- [X] T019 [P] [US1] Read `apps/web/app/api/expenses/route.ts` — verify tenant scope — document in `findings/01-tenant-isolation.md`
- [X] T020 [P] [US1] Read `apps/web/app/api/loyalty/route.ts`, `apps/web/app/api/loyalty/earn/route.ts`, `apps/web/app/api/loyalty/redeem/route.ts` — verify tenant scope on all loyalty routes — document in `findings/01-tenant-isolation.md`
- [X] T021 [P] [US1] Read `apps/web/app/api/audit-log/route.ts` — verify the custom audit scope (uses branchId subquery, not `getTenantContext` directly) is correct and prevents cross-org leakage — document in `findings/01-tenant-isolation.md`
- [X] T022 [P] [US1] Read `apps/web/app/api/reports/` routes (all 7) — verify each applies tenant scope before aggregating data — document in `findings/01-tenant-isolation.md`
- [X] T023 [P] [US1] Read `apps/web/app/api/branches/route.ts` — verify it only returns branches of the authenticated user's organization — document in `findings/01-tenant-isolation.md`

### 3.3 — Cross-Tenant Penetration Tests

- [X] T024 [US1] Manual test: authenticate as Org-B PHARMACIST, GET `/api/patients?branchId=<Org-A-branchId>` — confirm response contains 0 Org-A records — document in `findings/01-tenant-isolation.md`
- [X] T025 [US1] Manual test: authenticate as Org-B user, POST `/api/sales` with a `branchId` from Org-A — confirm HTTP 403 or the record is not created in Org-A — document in `findings/01-tenant-isolation.md`
- [X] T026 [US1] Manual test: authenticate as Org-B PHARMACIST, GET `/api/admin/tenants` — confirm HTTP 403 — document in `findings/01-tenant-isolation.md`

### 3.4 — Role-Based Access Audit

- [X] T027 [US1] Read `apps/web/app/api/admin/provision-tenant/route.ts`, `apps/web/app/api/admin/tenants/route.ts`, `apps/web/app/api/admin/licenses/route.ts` — verify each checks `role === "ADMIN" || role === "SUPER_ADMIN"` before processing — document in `findings/03-super-admin.md`
- [X] T028 [US1] Manual test: authenticate as PHARMACIST, call each admin route — confirm all return HTTP 403 — document in `findings/01-tenant-isolation.md`

### 3.5 — Fix & Verify

- [X] T029 [US1] For each FAIL item found in T013–T028: add the missing `getTenantContext()` call and scoped WHERE clause to the offending route — update `findings/01-tenant-isolation.md` with fix reference
- [X] T030 [US1] Re-run the cross-tenant tests T024–T028 after fixes — confirm all return PASS — mark findings as RESOLVED

**Checkpoint ✅ US1 Complete**: Zero cross-tenant data leakage verified across all audited routes.

---

## Phase 4: US2 — Sync Pipeline Correctness Audit (Priority: P1) 🔴 CRITICAL

**Goal**: Confirm all 12 sync pipelines are idempotent, correctly scoped, and reconcile data without loss or duplication.

**Independent Test**: Disconnect desktop, process 5 sales, reconnect, wait ≤2 min — web shows exactly 5 new sales, correct inventory, no duplicates.

### 4.1 — Sync Route Code Review

- [X] T031 [P] [US2] Read `apps/web/app/api/sync/sales/route.ts` — verify: branchId ownership validated, idempotency by sale ID, inventory decremented atomically, no duplicate creation — document in `findings/02-sync-correctness.md`
- [X] T032 [P] [US2] Read `apps/web/app/api/sync/loyalty/route.ts` — verify: `Organization.loyaltyEnabled` checked first, idempotency by transaction ID, `accountBalances` returned in response — document in `findings/02-sync-correctness.md`
- [X] T033 [P] [US2] Read `apps/web/app/api/sync/patients/route.ts` — verify: upsert by patient ID (no duplicates), branchId validated — document in `findings/02-sync-correctness.md`
- [X] T034 [P] [US2] Read `apps/web/app/api/sync/shifts/route.ts` — verify: shift clock-in/out times, safe balances, and cash-drop events all transmitted — document in `findings/02-sync-correctness.md`
- [X] T035 [P] [US2] Read `apps/web/app/api/sync/returns/route.ts` — verify: inventory incremented on web, original sale return status updated — document in `findings/02-sync-correctness.md`
- [X] T036 [P] [US2] Read `apps/web/app/api/sync/debt-payments/route.ts` — verify: payment recorded, patient balance decremented, loyalty points earned if enabled — document in `findings/02-sync-correctness.md`
- [X] T037 [P] [US2] Read `apps/web/app/api/sync/settings/route.ts` — verify: reads loyalty config from `Organization` (not `CompanySettings`) when `branchId` param is present — document in `findings/02-sync-correctness.md`
- [X] T038 [P] [US2] Read `apps/web/app/api/sync/products/route.ts`, `apps/web/app/api/sync/users/route.ts`, `apps/web/app/api/sync/notifications/route.ts`, `apps/web/app/api/sync/transactions/route.ts` — verify branchId validation and idempotency on each — document in `findings/02-sync-correctness.md`

### 4.2 — Desktop Sync Logic Review

- [X] T039 [US2] Read `apps/desktop/electron/sync.ts` `syncSettings()` function — verify it sends `?branchId=` query param and applies returned `loyaltyEnabled` to local `CompanySettings` — document in `findings/02-sync-correctness.md`
- [X] T040 [P] [US2] Read `apps/desktop/electron/sync.ts` `syncLoyalty()` function — verify it: sends all unsynced transactions, marks them `synced: true` after success, applies returned `accountBalances` to local loyalty accounts — document in `findings/02-sync-correctness.md`
- [X] T041 [P] [US2] Read `apps/desktop/electron/sync.ts` `syncSales()` function — verify it sends correct payload (sale ID, items, totals, patientId, shiftId) and handles partial failures without losing records — document in `findings/02-sync-correctness.md`
- [X] T042 [US2] Read `apps/desktop/electron/sync.ts` `startSyncService()` — verify: `syncSettings` runs every 2 min, `syncSettings` triggers immediately on reconnection (`wasOffline` flag logic) — document in `findings/02-sync-correctness.md`
- [X] T043 [US2] Read `apps/desktop/electron/sync.ts` `checkConnection()` — verify `wasOffline`/`wasOnline` state correctly triggers immediate `syncSettings` on reconnect — document in `findings/02-sync-correctness.md`

### 4.3 — End-to-End Sync Tests

- [X] T044 [US2] Offline sale sync test: disconnect desktop network, process 3 cash sales, reconnect — verify via web `/api/sales` that exactly 3 new sales appear with correct totals and inventory decremented — document in `findings/02-sync-correctness.md`
- [X] T045 [US2] Idempotency test: manually POST the same sale payload twice to `/api/sync/sales` — verify only 1 record exists in the database — document in `findings/02-sync-correctness.md`
- [X] T046 [US2] Loyalty sync test: create EARN transaction on desktop (loyalty enabled), sync — verify web `LoyaltyAccount.totalPoints` increases by the correct amount AND desktop receives the updated balance in the response — document in `findings/02-sync-correctness.md`
- [X] T047 [US2] Settings sync test: disable loyalty on web, wait for desktop settings sync (≤2 min) — verify desktop `CompanySettings.loyaltyEnabled` becomes false, next desktop sale awards 0 points — document in `findings/02-sync-correctness.md`

### 4.4 — Fix & Verify

- [X] T048 [US2] For each FAIL found in T031–T047: apply fixes to the relevant sync route or sync.ts function — reference specific fix commits in `findings/02-sync-correctness.md`
- [X] T049 [US2] Re-run T044–T047 after fixes — confirm all PASS — mark findings RESOLVED

**Checkpoint ✅ US2 Complete**: All 12 sync routes verified idempotent and correctly scoped.

---

## Phase 5: US3 — Super Admin System Audit (Priority: P1) 🔴 CRITICAL

**Goal**: Verify the super admin can provision, monitor, suspend, and deactivate tenants atomically.

**Independent Test**: Provision a tenant, log in with provisioned credentials within 60 seconds.

### 5.1 — Provision-Tenant Route

- [X] T050 [P] [US3] Read `apps/web/app/api/admin/provision-tenant/route.ts` — verify: uses `prisma.$transaction()`, creates Organization + Branch + User + DeviceLicense atomically, hashes password with bcrypt, generates unique license key, returns all created entities — document in `findings/03-super-admin.md`
- [X] T051 [P] [US3] Test provision-tenant success: POST valid payload as SUPER_ADMIN — confirm 201 response with organization, branch, user, and license fields — confirm all four records exist in database — document in `findings/03-super-admin.md`
- [X] T052 [US3] Test provision-tenant rollback: POST payload with duplicate email — confirm 409 response AND zero partial records exist in database — document in `findings/03-super-admin.md`

### 5.2 — Tenant Management Routes

- [X] T053 [P] [US3] Read `apps/web/app/api/admin/tenants/route.ts` and `apps/web/app/api/admin/tenants/[id]/route.ts` — verify: SUPER_ADMIN role enforced, GET returns name/plan/branch count/user count/subscription status/last-activity, PATCH supports suspension — document in `findings/03-super-admin.md`
- [X] T054 [US3] Test org suspension: PATCH tenant with `{ isSuspended: true }` as SUPER_ADMIN — then attempt login as that org's admin user — confirm login fails with suspended message — document in `findings/03-super-admin.md`
- [X] T055 [P] [US3] Read `apps/web/app/api/admin/licenses/route.ts` and `apps/web/app/api/admin/licenses/[id]/route.ts` — verify deactivation sets `isActive: false` — document in `findings/03-super-admin.md`

### 5.3 — Admin Dashboard Pages

- [X] T056 [P] [US3] Navigate to `/dashboard/admin/tenants` as SUPER_ADMIN — verify page loads with tenant list, each row shows organization name, plan, status — document in `findings/03-super-admin.md`
- [X] T057 [P] [US3] Navigate to `/dashboard/admin/plans` as SUPER_ADMIN — verify plan list loads with maxBranches and maxUsers columns — document in `findings/03-super-admin.md`
- [X] T058 [P] [US3] Navigate to `/dashboard/admin/licenses` as SUPER_ADMIN — verify license list loads with licenseKey, isActive, expiresAt columns — document in `findings/03-super-admin.md`
- [X] T059 [US3] Navigate to `/dashboard/admin/tenants` as ADMIN (non-super) — verify redirect or 403 (not an unhandled error) — document in `findings/03-super-admin.md`

### 5.4 — Fix & Verify

- [X] T060 [US3] For each FAIL found in T050–T059: fix the offending route or page — document in `findings/03-super-admin.md`
- [X] T061 [US3] Re-run T051–T059 after fixes — confirm all PASS

**Checkpoint ✅ US3 Complete**: Super admin provisioning, suspension, and license management verified.

---

## Phase 6: US4 — Web Dashboard Page Completeness Audit (Priority: P2)

**Goal**: Every one of the 92 web dashboard pages loads without error and displays scoped data for all four roles.

**Independent Test**: Navigate to each page URL as each role — page loads with HTTP 200 and meaningful content.

### 6.1 — Core Pages (ADMIN role)

- [X] T062 [P] [US4] Audit **Inventory section** (13 pages): navigate `/dashboard/inventory`, `/dashboard/inventory/create`, `/dashboard/inventory/[id]/edit`, `/dashboard/inventory/expired-damaged`, `/dashboard/inventory/shortages`, `/dashboard/inventory/product-movement`, `/dashboard/inventory/barcode-print`, `/dashboard/inventory/bulk-pricing`, `/dashboard/inventory/margin-warnings`, `/dashboard/inventory/stocktakes`, `/dashboard/inventory/transfers`, `/dashboard/inventory/transfers/create` — for each: load test, empty-state check, create/edit form validation — document pass/fail per page in `findings/04-web-pages.md`
- [X] T063 [P] [US4] Audit **Purchases section** (4 pages): `/dashboard/purchases`, `/dashboard/purchases/[id]`, `/dashboard/purchases/[id]/receive`, `/dashboard/purchases/smart-order` — document in `findings/04-web-pages.md`
- [X] T064 [P] [US4] Audit **Sales Hub** (6 pages): `/dashboard/(sales-hub)/sales`, `/dashboard/(sales-hub)/invoices`, `/dashboard/(sales-hub)/invoices/create`, `/dashboard/(sales-hub)/payments`, `/dashboard/(sales-hub)/returns`, `/dashboard/(sales-hub)/returns/[id]/invoice` — document in `findings/04-web-pages.md`
- [X] T065 [P] [US4] Audit **Patients Hub** (11 pages): `/dashboard/(patients-hub)/patients`, `/dashboard/(patients-hub)/patients/create`, `/dashboard/(patients-hub)/patients/[id]`, `/dashboard/(patients-hub)/patients/[id]/edit`, insurance pages (4), loyalty pages (2) — document in `findings/04-web-pages.md`
- [X] T066 [P] [US4] Audit **Reports section** (17 pages): all routes under `/dashboard/reports/*` and `/dashboard/analytics/*` — for each: load test, date filter, print/export action — document in `findings/04-web-pages.md`
- [X] T067 [P] [US4] Audit **Admin config pages**: branches (3 pages), organizations (3 pages), users (4 pages), drugs (4 pages), suppliers (4 pages), discounts (2 pages), prescriptions (3 pages), batches, expenses, debts, finance/safes, finance/transactions — document in `findings/04-web-pages.md`
- [X] T068 [P] [US4] Audit **Utility pages**: `/dashboard` (home), `/dashboard/settings`, `/dashboard/settings/billing`, `/dashboard/notifications`, `/dashboard/alerts`, `/dashboard/reports/audit-log` — document in `findings/04-web-pages.md`

### 6.2 — Role-Restricted Access

- [X] T069 [US4] For each admin-only page (branches/create, users/create, organizations, settings/billing): attempt navigation as PHARMACIST and CASHIER — confirm redirect or access-denied, not unhandled error — document in `findings/04-web-pages.md`

### 6.3 — Fix & Verify

- [X] T070 [US4] For each FAIL page found in T062–T069: identify root cause (missing dynamic export, unhandled null, broken query) and apply fix — document in `findings/04-web-pages.md`
- [X] T071 [US4] Re-test all fixed pages — confirm all load correctly

**Checkpoint ✅ US4 Complete**: All 92 pages load for appropriate roles without errors.

---

## Phase 7: US5 — Point of Sale Across All Three Platforms (Priority: P2)

**Goal**: Complete sale flow (scan → cart → payment → receipt) works correctly on web, desktop, and mobile with correct inventory and loyalty handling.

**Independent Test**: Complete a 3-item cash sale on each platform — inventory decrements, loyalty points credited, receipt producible.

### 7.1 — Web POS Audit

- [X] T072 [P] [US5] Read `apps/web/app/lib/actions/pos-actions.ts` — verify: loyalty `lifetimePoints` updated alongside `totalPoints` on EARN, tier recalculated, credit sales do NOT earn points, `loyaltyEnabled` checked from `CompanySettings` — document in `findings/05-pos-flows.md`
- [X] T073 [US5] Test web POS cash sale: create invoice via `/dashboard/(sales-hub)/invoices/create` with 3 items — verify inventory decrements in web DB, loyalty points awarded (if enabled) — document in `findings/05-pos-flows.md`
- [X] T074 [US5] Test web POS credit sale: create invoice with CREDIT payment — verify patient debt balance increases, loyalty points NOT awarded — document in `findings/05-pos-flows.md`

### 7.2 — Desktop POS Audit

- [X] T075 [P] [US5] Read `apps/desktop/electron/main.ts` `process-sale` IPC handler (around line 2018) — verify: loyalty EARN uses `Math.floor(total × pointsPerDinar)`, CREDIT sales skip EARN, `loyaltyEnabled` checked from local `CompanySettings`, drug interaction check fires before sale completes — document in `findings/05-pos-flows.md`
- [X] T076 [US5] Test desktop cash sale (online): complete sale with 3 items — verify local SQLite inventory decremented, loyalty account updated, sale marked `synced: false` — document in `findings/05-pos-flows.md`
- [X] T077 [US5] Test desktop shift enforcement: attempt sale without clocking in — verify POS blocks the sale with a clear message — document in `findings/05-pos-flows.md`
- [X] T078 [US5] Test desktop drug interaction: add two known-incompatible drugs to cart — verify interaction warning appears before completion — document in `findings/05-pos-flows.md`

### 7.3 — Mobile POS Audit

- [X] T079 [P] [US5] Read `apps/mobile/app/(tabs)/sales.tsx` (or equivalent POS screen) — verify barcode scan, cart management, patient search, payment flow, and receipt printing are implemented and call the correct web API endpoints — document in `findings/05-pos-flows.md`
- [X] T080 [US5] Test mobile cash sale on iOS simulator: scan barcode, add to cart, select CASH payment, complete — verify web API records the sale and inventory updates — document in `findings/05-pos-flows.md`
- [X] T081 [US5] Test mobile loyalty: complete mobile sale for patient with loyalty enabled — verify points awarded on web — document in `findings/05-pos-flows.md`

### 7.4 — Fix & Verify

- [X] T082 [US5] Fix any POS issues found in T072–T081 (e.g. missing `lifetimePoints` update, missing `loyaltyEnabled` guard, incorrect API endpoint in mobile) — document in `findings/05-pos-flows.md`
- [X] T083 [US5] Re-run T073, T076, T080 after fixes — confirm all PASS

**Checkpoint ✅ US5 Complete**: Sale flow verified on all 3 platforms with correct inventory and loyalty handling.

---

## Phase 8: US6 — Subscription & License Enforcement Audit (Priority: P2)

**Goal**: Plan limits (maxBranches, maxUsers) enforced at API level; desktop license verification works; Stripe webhooks update subscription state.

**Independent Test**: Set org plan to maxBranches=1, attempt to create second branch — API rejects with plan-limit error.

### 8.1 — Plan Limit Enforcement

- [X] T084 [P] [US6] Read `apps/web/app/api/branches/route.ts` (POST handler) — verify it checks org's branch count against `SubscriptionPlan.maxBranches` before creating — document in `findings/06-subscription-licensing.md`
- [X] T085 [P] [US6] Read `apps/web/app/api/admin/` user creation route — verify it checks org's user count against `SubscriptionPlan.maxUsers` before creating — document in `findings/06-subscription-licensing.md`
- [X] T086 [US6] Test branch limit: set org to plan with maxBranches=1 (already has 1 branch), POST to create second branch — confirm HTTP 4xx with plan-limit message — document in `findings/06-subscription-licensing.md`
- [X] T087 [US6] Test user limit: set org to plan with maxUsers=2 (already has 2 users), POST to create third user — confirm HTTP 4xx with plan-limit message — document in `findings/06-subscription-licensing.md`

### 8.2 — Device License Verification

- [X] T088 [P] [US6] Read `apps/desktop/electron/offline-token.ts` — verify: token decodes subscription state, license expiry is checked, hardware ID is validated — document in `findings/06-subscription-licensing.md`
- [X] T089 [P] [US6] Read `apps/web/app/api/license/verify/route.ts` — verify: checks `isActive`, `expiresAt`, hardware ID match, returns clear status — document in `findings/06-subscription-licensing.md`
- [X] T090 [US6] Test license expiry: set a DeviceLicense `expiresAt` to past date, restart desktop — confirm license screen appears and POS is blocked — document in `findings/06-subscription-licensing.md`
- [X] T091 [US6] Test license deactivation: set `isActive: false` on a license, trigger desktop license verification — confirm desktop enters locked state — document in `findings/06-subscription-licensing.md`

### 8.3 — Stripe Webhook

- [X] T092 [P] [US6] Read `apps/web/app/api/webhooks/stripe/route.ts` — verify: signature validation present, `customer.subscription.deleted` and `invoice.payment_failed` events update org subscription status — document in `findings/06-subscription-licensing.md`
- [X] T093 [US6] Test Stripe webhook (test mode): send `invoice.payment_failed` event — confirm org `subscriptionEndsAt` or `isSuspended` is updated correctly — document in `findings/06-subscription-licensing.md`

### 8.4 — Fix & Verify

- [X] T094 [US6] Fix any plan-limit or license issues found in T084–T093 — document fixes in `findings/06-subscription-licensing.md`
- [X] T095 [US6] Re-run T086, T087, T090, T091 after fixes — confirm all PASS

**Checkpoint ✅ US6 Complete**: Plan limits and license enforcement verified at API and desktop levels.

---

## Phase 9: US7 — Mobile App Feature Parity Audit (Priority: P2)

**Goal**: All 35 mobile screens render without crash, and key flows (POS, purchases, debts, alerts) work against the live web API.

**Independent Test**: Log in on mobile, complete a sale, verify web shows matching sale record.

### 9.1 — Screen Render Audit

- [X] T096 [P] [US7] Audit **Core tabs** on iOS simulator: launch app, navigate to each of the 9 tabs (home/POS, sales, inventory, purchases, debts, reports, alerts, smart-orders, settings) — verify each renders without crash and loads data — document in `findings/07-mobile-app.md`
- [X] T097 [P] [US7] Audit **CRM screens**: navigate to `crm/index`, `crm/add`, `crm/[id]` — verify patient list loads, add patient form works, patient detail shows history — document in `findings/07-mobile-app.md`
- [X] T098 [P] [US7] Audit **Purchase screens**: navigate to `purchases/[id]` and `purchases/[id]/receive` — verify purchase detail loads and receive action increments inventory — document in `findings/07-mobile-app.md`
- [X] T099 [P] [US7] Audit **Settings screens** (8 screens): account, password, theme, notifications, about, support, preferences, printer-settings — verify each loads and actions function — document in `findings/07-mobile-app.md`
- [X] T100 [P] [US7] Audit **Utility screens**: `scan.tsx`, `scan-prescription.tsx`, `server-config.tsx`, `alerts.tsx`, `accounting/expenses.tsx`, `reports/financial.tsx`, `checkout/payment.tsx` — verify each renders — document in `findings/07-mobile-app.md`

### 9.2 — Key Flow Tests (Android emulator)

- [X] T101 [US7] Re-run T096 on Android emulator — verify same screens render on Android — document any Android-specific failures in `findings/07-mobile-app.md`
- [X] T102 [US7] Mobile debt collection flow: open debts tab, select a debtor, record a payment — verify payment appears in web `DebtPayment` table and patient balance updates — document in `findings/07-mobile-app.md`
- [X] T103 [US7] Mobile alerts flow: create a low-stock condition (set inventory qty below minStock) — open alerts tab on mobile — verify alert appears — document in `findings/07-mobile-app.md`

### 9.3 — Fix & Verify

- [X] T104 [US7] Fix any mobile crash or broken flow found in T096–T103 — document fixes in `findings/07-mobile-app.md`
- [X] T105 [US7] Re-run crashed/failed screens after fixes — confirm all render

**Checkpoint ✅ US7 Complete**: All 35 mobile screens render on iOS and Android; key flows verified.

---

## Phase 10: US8 — Data Integrity Audit (Priority: P3)

**Goal**: Verify loyalty balances, sale totals, inventory transfers, and cascade deletes maintain mathematical correctness.

**Independent Test**: Query `LoyaltyAccount.totalPoints` and compare to `sum(EARN) - sum(REDEEM)` from `LoyaltyTransaction` — must equal zero deviation.

### 10.1 — Loyalty Balance Integrity

- [X] T106 [P] [US8] Run SQL query on web PostgreSQL: `SELECT la.id, la.totalPoints, (SELECT COALESCE(SUM(CASE WHEN type='EARN' THEN points ELSE 0 END) - SUM(CASE WHEN type='REDEEM' THEN points ELSE 0 END), 0) FROM "LoyaltyTransaction" WHERE "accountId" = la.id) AS calculated FROM "LoyaltyAccount" la HAVING la.totalPoints != calculated` — any rows returned = FAIL — document in `findings/08-data-integrity.md`
- [X] T107 [P] [US8] Run SQL query: verify `lifetimePoints` equals `sum(EARN)` for all accounts — document in `findings/08-data-integrity.md`
- [X] T108 [US8] If T106 or T107 returns rows: trace the cause (likely a missing `lifetimePoints` increment in an old code path) and run a corrective UPDATE to bring balances into alignment — document in `findings/08-data-integrity.md`

### 10.2 — Sale Total Integrity

- [X] T109 [P] [US8] Run SQL: compare each `Sale.total` against `sum(SaleItem.price * quantity)` minus discount — flag any discrepancy greater than 0.01 IQD — document in `findings/08-data-integrity.md`

### 10.3 — Transfer Integrity

- [X] T110 [P] [US8] For every completed Transfer: verify `sum(source inventory before - after) == sum(destination inventory after - before)` per transferred item — document in `findings/08-data-integrity.md`

### 10.4 — Cascade Delete Behavior

- [X] T111 [P] [US8] Read `apps/web/prisma/schema.prisma` — for `Patient` model: verify all related models (Sale, Prescription, LoyaltyAccount, InsurancePolicy, DebtPayment) have either `onDelete: Cascade` or the delete action is blocked at application level — document in `findings/08-data-integrity.md`
- [X] T112 [US8] Test patient deletion: create a test patient with 1 sale, 1 prescription, 1 loyalty account — delete the patient — verify all dependent records are removed or deletion is blocked with a meaningful error — document in `findings/08-data-integrity.md`

### 10.5 — Audit Log Coverage

- [X] T113 [P] [US8] Perform 10 distinct mutation operations (create sale, create patient, update inventory, create user, update settings, etc.) — after each, query `AuditLog` — verify 100% have a corresponding entry with correct entity, action, userId, and branchId — document in `findings/08-data-integrity.md`

### 10.6 — Fix & Verify

- [X] T114 [US8] Fix any data integrity issue found in T106–T113 (balance corrections, missing cascade rules, missing audit log calls) — document in `findings/08-data-integrity.md`
- [X] T115 [US8] Re-run T106, T107, T109, T112, T113 after fixes — confirm all PASS

**Checkpoint ✅ US8 Complete**: All data integrity invariants verified.

---

## Phase 11: Polish — Executive Summary & Regression Verification

**Purpose**: Consolidate all findings, confirm no regressions, produce the final audit report.

- [X] T116 [P] Write `findings/00-executive-summary.md` — compile all Critical and High findings from all 8 domain reports, with: finding ID, severity, domain, description, file:line reference, fix status (Open/Fixed/Verified)
- [X] T117 [P] Count total PASS / FAIL / FIXED items across all 8 findings files — compute pass rate per domain and overall — add summary table to `findings/00-executive-summary.md`
- [X] T118 Regression test: after all fixes applied, re-run the 5 core cross-tenant tests (T024–T028) and the offline sync test (T044) — confirm all still PASS — document in `findings/00-executive-summary.md`
- [X] T119 Update `specs/008-saas-full-audit/checklists/requirements.md` — mark all items as [X] once all findings are PASS or FIXED — note any remaining Low-severity items as accepted risk
- [X] T120 [P] Clean up test data: delete test organizations created during audit (Org-A-test, Org-B-test), revoke test licenses, remove seeded test patients — document cleanup completion
- [X] T121 Final review: read all 9 findings files and confirm every finding has a status (PASS / FIXED / ACCEPTED-RISK) — no finding left without a disposition — mark audit complete in `findings/00-executive-summary.md`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    └──→ Phase 2 (Foundational)
              └──→ Phase 3 (US1: Tenant Isolation) ◀ MUST complete before US4, US5, US7
              └──→ Phase 4 (US2: Sync)             ◀ MUST complete before US5
              └──→ Phase 5 (US3: Super Admin)       ◀ MUST complete before US6
              └──→ Phase 6 (US4: Web Pages)         [after US1]
              └──→ Phase 7 (US5: POS)               [after US1, US2]
              └──→ Phase 8 (US6: Subscriptions)     [after US3]
              └──→ Phase 9 (US7: Mobile)             [parallel with US4–US6]
              └──→ Phase 10 (US8: Data Integrity)    [after all above]
              └──→ Phase 11 (Polish)                 [after US8]
```

### Parallelization by Team

| Auditor | Phases |
|---------|--------|
| Auditor A (Security) | Phase 3 (US1) → Phase 8 (US6) |
| Auditor B (Backend) | Phase 4 (US2) → Phase 10 (US8) |
| Auditor C (Admin/Web) | Phase 5 (US3) → Phase 6 (US4) |
| Auditor D (Mobile/POS) | Phase 7 (US5) → Phase 9 (US7) |

---

## Parallel Opportunities

### Within Phase 3 (US1 — Tenant Isolation)
```
Run simultaneously:
  T013 - Read patients/route.ts
  T014 - Read inventory/route.ts
  T015 - Read sales/route.ts
  T016 - Read suppliers/route.ts
  T017 - Read purchases routes
  T018 - Read debts routes
  T020 - Read loyalty routes
  T022 - Read reports routes
```

### Within Phase 4 (US2 — Sync)
```
Run simultaneously:
  T031 - Audit sales sync route
  T032 - Audit loyalty sync route
  T033 - Audit patients sync route
  T034 - Audit shifts sync route
  T035 - Audit returns sync route
  T036 - Audit debt-payments sync route
  T037 - Audit settings sync route
  T038 - Audit remaining 4 sync routes
```

### Within Phase 6 (US4 — Web Pages)
```
Run simultaneously:
  T062 - Inventory pages audit
  T063 - Purchases pages audit
  T064 - Sales Hub pages audit
  T065 - Patients Hub pages audit
  T066 - Reports pages audit
  T067 - Admin config pages audit
  T068 - Utility pages audit
```

---

## Implementation Strategy

### MVP Audit (Critical Security — US1 + US2 + US3 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3 (US1: Tenant Isolation) — most critical
3. Complete Phase 4 (US2: Sync Correctness)
4. Complete Phase 5 (US3: Super Admin)
5. **STOP and EVALUATE**: Fix all Critical/High findings, produce partial executive summary
6. Decide whether to proceed to P2 domains based on findings severity

### Full Audit (All 8 Domains)

1. Complete Phases 1–5 (Setup + P1 domains)
2. Parallelize Phases 6–9 (P2 domains) across team members
3. Complete Phase 10 (US8: Data Integrity) — requires all other phases done
4. Complete Phase 11 (Polish + Executive Summary)

---

## Task Count Summary

| Phase | Domain | Tasks | Priority |
|-------|--------|-------|----------|
| 1 | Setup | T001–T004 | — |
| 2 | Foundational | T005–T008 | — |
| 3 | US1: Tenant Isolation | T009–T030 | P1 🔴 |
| 4 | US2: Sync Correctness | T031–T049 | P1 🔴 |
| 5 | US3: Super Admin | T050–T061 | P1 🔴 |
| 6 | US4: Web Pages | T062–T071 | P2 🟡 |
| 7 | US5: POS Flows | T072–T083 | P2 🟡 |
| 8 | US6: Subscriptions | T084–T095 | P2 🟡 |
| 9 | US7: Mobile App | T096–T105 | P2 🟡 |
| 10 | US8: Data Integrity | T106–T115 | P3 🟢 |
| 11 | Polish | T116–T121 | — |
| **Total** | | **121 tasks** | |
