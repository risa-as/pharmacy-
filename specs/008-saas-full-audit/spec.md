# Feature Specification: SaaS Pharmacy Management System — Full Audit & QA

**Feature Branch**: `008-saas-full-audit`
**Created**: 2026-03-08
**Status**: Draft
**Scope**: Cross-platform audit · Web (92 pages) · Desktop (14 screens) · Mobile (35 screens) · 101 API routes · 12 sync pipelines

---

## Overview

Faramace is a multi-tenant SaaS platform for managing independent pharmacies and multi-branch pharmacy chains. It consists of three client apps — a web dashboard (Next.js), an offline-capable desktop app (Electron), and a mobile app (React Native) — all backed by a single cloud API. This specification defines the acceptance criteria for every page, every sync pipeline, the tenant isolation security model, the super-admin control plane, the subscription and licensing system, data integrity guarantees, and offline resilience behaviour. It serves as the master test oracle for a complete system audit.

---

## User Scenarios & Testing

### User Story 1 — Tenant Data Isolation (Priority: P1)

A pharmacist at "Pharmacy A" must never be able to read, write, or infer data belonging to "Pharmacy B", even when both organizations share the same underlying infrastructure.

**Why this priority**: A security breach exposing medical records or financial data is the most severe failure mode in the entire system and carries legal liability.

**Independent Test**: Create two organizations (A and B), create a patient in A, then call `/api/patients` while authenticated as a user of B — the response must contain zero records from A.

**Acceptance Scenarios**:

1. **Given** a user authenticated to Organization A, **When** they call any list API endpoint, **Then** every returned record has a `branchId` that belongs exclusively to Organization A's branches.
2. **Given** a user supplies a fabricated `branchId` belonging to Organization B in a request body, **When** the server processes it, **Then** it validates ownership and returns HTTP 403 — the record is not modified.
3. **Given** a PHARMACIST role user, **When** they attempt to access an admin-only route (`/api/admin/*`), **Then** the server returns HTTP 403.
4. **Given** a SUPER_ADMIN user, **When** they call `/api/admin/tenants`, **Then** they receive a summary list of all organizations but cannot access individual tenant records through a standard tenant-scoped route.
5. **Given** an unauthenticated HTTP request to any route, **When** the request arrives, **Then** the server returns HTTP 401 without leaking any data.

---

### User Story 2 — Desktop Offline-to-Online Sync Correctness (Priority: P1)

A pharmacist works offline on the desktop, processes sales and payments, then reconnects. All queued operations must arrive on the web exactly once, in a consistent state, without corrupting stock counts, balances, or loyalty points.

**Why this priority**: Offline capability is a core commercial differentiator. Silent data loss or duplication destroys financial records and patient trust.

**Independent Test**: Disconnect the desktop from the network, process 5 sales (3 cash, 2 credit), reconnect, wait one sync cycle — verify the web shows exactly 5 new sales, correct inventory decrements, and no duplicates.

**Acceptance Scenarios**:

1. **Given** the desktop is offline, **When** a sale is processed, **Then** it is saved to local SQLite with `synced: false` and the local inventory is decremented.
2. **Given** the desktop reconnects, **When** the sync service runs, **Then** all pending sales are posted to `/api/sync/sales` exactly once.
3. **Given** a sync POST for sale S1 times out mid-flight, **When** the desktop retries, **Then** the server's idempotency check prevents a duplicate record from being created.
4. **Given** a loyalty transaction created offline, **When** synced to the web, **Then** the web account balance is updated and the response includes the corrected `totalPoints` for the desktop to reconcile locally.
5. **Given** `loyaltyEnabled` is changed to `false` on the web, **When** the desktop next runs a settings sync (within 2 minutes), **Then** `CompanySettings.loyaltyEnabled` becomes `false` and no further points are awarded.
6. **Given** a sale return is processed offline, **When** synced, **Then** the web inventory is incremented and the original sale's return status is updated.

---

### User Story 3 — Super Admin Tenant Provisioning & Control (Priority: P1)

The super admin can create a fully-operational pharmacy tenant in a single action, monitor all tenants, and suspend or modify any organization without disrupting others.

**Why this priority**: This is the primary onboarding and operations workflow for the SaaS business itself.

**Independent Test**: Call the provision-tenant endpoint, then immediately log in with the provisioned credentials — the dashboard must be accessible with all features scoped to the new organization.

**Acceptance Scenarios**:

1. **Given** a super admin submits a provision-tenant request with valid inputs, **When** provisioning completes, **Then** exactly one Organization, one Branch, one Admin User, and one DeviceLicense are created inside a single database transaction.
2. **Given** provisioning fails (e.g. duplicate email), **When** the error is returned, **Then** zero partial records exist — the database is in its pre-request state.
3. **Given** a super admin suspends Organization X, **When** any user of Organization X attempts to log in, **Then** they receive a "suspended" response and cannot access any dashboard functionality.
4. **Given** a super admin views the tenant list, **When** the page loads, **Then** it shows each organization's name, plan, branch count, user count, subscription status, license key, and last-active date.
5. **Given** a super admin deactivates a device license, **When** the desktop app next verifies its license, **Then** it enters a locked state and prevents all operations.

---

### User Story 4 — Web Dashboard Page Completeness (Priority: P2)

Every one of the 92 web dashboard pages must load without error, display correctly scoped data, and support all defined CRUD operations for its domain.

**Why this priority**: The web dashboard is the primary management interface. Any broken page blocks daily pharmacy operations.

**Independent Test**: Each page is navigable by URL and renders meaningful content when data exists for the authenticated user's branch.

**Acceptance Scenarios**:

1. **Given** an ADMIN user with a seeded dataset, **When** they navigate to any of the 92 dashboard pages, **Then** the page loads within 3 seconds and displays data scoped to their organization.
2. **Given** a PHARMACIST user without permission for a specific section, **When** they navigate to that section's URL, **Then** they are redirected or shown an access-denied message — not an unhandled runtime error.
3. **Given** no data exists for a domain (e.g. empty inventory), **When** the page loads, **Then** an empty state message is shown — not a blank page or JavaScript error.
4. **Given** a create/edit form is submitted with invalid data, **When** the submission is processed, **Then** field-level validation errors are displayed and no record is created or modified.
5. **Given** a valid form submission, **When** it succeeds, **Then** the user is redirected to the relevant list page and the new/updated record appears.

---

### User Story 5 — Point of Sale Across All Three Platforms (Priority: P2)

A cashier must complete a sale — scan items, apply discounts, select payment method, process payment, and print a receipt — on the web, desktop, and mobile app, with correct inventory deduction and loyalty handling in every case.

**Why this priority**: POS is the highest-frequency daily operation. Errors directly impact revenue.

**Independent Test**: Complete a 3-item cash sale on each platform, then verify: inventory decremented correctly, loyalty points awarded (if enabled), receipt printable.

**Acceptance Scenarios**:

1. **Given** a barcode is scanned, **When** the item exists in the branch's inventory, **Then** it is added to the cart with the correct name, price, and remaining stock indicator.
2. **Given** loyalty is enabled and a patient is linked to the sale, **When** the sale is paid in cash, **Then** loyalty points are calculated as `floor(total × loyaltyPointsPerDinar)` and credited to the patient's account.
3. **Given** loyalty is disabled on the web settings page, **When** a sale is processed on any platform, **Then** no loyalty points are awarded, credited, or displayed.
4. **Given** the sale payment method is CREDIT, **When** the sale is completed, **Then** loyalty points are NOT awarded and the patient's outstanding debt balance increases by the sale total.
5. **Given** a cart item quantity would exceed available stock, **When** the cashier attempts to increase it, **Then** the system prevents the action and shows the available quantity.
6. **Given** a completed sale, **When** the cashier requests a receipt, **Then** a formatted receipt is produced containing: pharmacy name, date/time, item list, totals, payment method, and cashier name.

---

### User Story 6 — Subscription & License Enforcement (Priority: P2)

An organization on a limited plan cannot exceed its configured branch or user quota. The desktop app refuses to operate without a valid non-expired device license.

**Why this priority**: Without enforcement, plan tiers have no value and revenue protection fails.

**Independent Test**: Set an organization's plan to a 1-branch limit, attempt to create a second branch via the UI — the system must reject the request with a clear plan-limit error.

**Acceptance Scenarios**:

1. **Given** an organization has reached its `maxBranches` plan limit, **When** an admin attempts to create another branch, **Then** the API returns an error explaining the plan limit and the branch is not created.
2. **Given** an organization has reached its `maxUsers` plan limit, **When** an admin attempts to create another user, **Then** the API returns an error and the user is not created.
3. **Given** a desktop app with an expired license, **When** it starts up, **Then** it displays a license-expired screen and all POS and inventory actions are blocked.
4. **Given** a Stripe subscription renewal fails, **When** the failure webhook is received, **Then** the organization's subscription state is updated and new branch/user creation is blocked until the payment is resolved.
5. **Given** a device license is deactivated by the super admin, **When** the desktop app next performs a license verification check, **Then** it enters the locked/license-required state.

---

### User Story 7 — Mobile App Feature Parity (Priority: P2)

The mobile app supports all daily field pharmacy operations: POS sales, inventory lookup, purchase receiving, patient management, debt management, and system alerts — all against live web API data.

**Why this priority**: Mobile is used by field and counter staff who need real-time data without a full desktop setup.

**Independent Test**: Log in on mobile, complete a sale, verify the web dashboard shows the same sale with matching totals and inventory changes.

**Acceptance Scenarios**:

1. **Given** a mobile user logs in with valid credentials, **When** authentication succeeds, **Then** all tabs load with data scoped to their branch.
2. **Given** a barcode scan on the mobile POS, **When** the item exists, **Then** it is added to the cart with correct price from the web API.
3. **Given** a purchase order exists for the branch, **When** the mobile user marks items as received, **Then** inventory is incremented on the web and the purchase status updates.
4. **Given** the debts tab is opened, **When** data loads, **Then** only debtors from the authenticated user's branch appear with correct outstanding balances.
5. **Given** the alerts tab is opened, **When** data loads, **Then** low-stock alerts, near-expiry warnings, and system notifications are shown in order of severity.

---

### User Story 8 — Audit Logging & Data Integrity (Priority: P3)

Every significant mutation — sale, inventory change, user creation, settings change, deletion — is recorded in the audit log, and all database records maintain referential integrity at all times.

**Why this priority**: Required for regulatory compliance, financial reconciliation, and troubleshooting in a medical context.

**Independent Test**: Create a sale via the web, view the audit log — an entry for that sale must exist with the correct user, action, entity, and branch.

**Acceptance Scenarios**:

1. **Given** any create, update, or delete operation completes, **When** the audit log is queried, **Then** a corresponding AuditLog entry exists with: `userId`, `userName`, `action`, `entity`, `entityId`, `branchId`, and `createdAt`.
2. **Given** a patient has associated sales, prescriptions, or loyalty records, **When** a deletion is attempted, **Then** either all related records are cascade-deleted in a single transaction, or the deletion is blocked with a message listing the dependent records.
3. **Given** the loyalty account's transaction history, **When** `totalPoints` is recalculated as `sum(EARN) - sum(REDEEM)`, **Then** the result matches the stored `totalPoints` value — deviation is zero.
4. **Given** a branch-to-branch inventory transfer is completed, **When** the source and destination inventory records are compared, **Then** the total quantity of the transferred item across both branches is unchanged from before the transfer.

---

### Edge Cases

- What happens when the desktop syncs a sale referencing a patient that was deleted on the web after the offline sale was made?
- What happens when two desktop stations in the same branch simultaneously sell the last unit of a drug while both are offline?
- How does the system handle a loyalty sync when `loyaltyEnabled` is toggled off between the transaction being created on desktop and the sync reaching the server?
- What if a Stripe webhook arrives after the super admin has already manually updated the subscription state?
- How does the system behave if `CompanySettings` does not exist on the web for a newly provisioned tenant?
- What happens when a device license is activated on a second machine while still active on the first (dual activation)?
- What happens when a branch transfer is in transit and the receiving branch has gone offline?

---

## Requirements

### Functional Requirements

#### A — Web Dashboard Pages

- **FR-W01**: All 92 dashboard pages MUST return HTTP 200 and render without unhandled JavaScript errors for valid authenticated sessions across all four roles.
- **FR-W02**: All list pages MUST support pagination (configurable page size) and text-based search/filter without full-page reload.
- **FR-W03**: All create and edit forms MUST perform client-side validation before submission AND server-side validation on the API, returning field-specific error messages.
- **FR-W04**: Every page MUST scope all displayed data to the authenticated user's organization and branch — SUPER_ADMIN role sees cross-tenant data only in admin-designated pages.
- **FR-W05**: The main dashboard MUST display: today's total sales revenue, number of transactions, active-shift status, low-stock item count, and near-expiry item count.
- **FR-W06**: The inventory page MUST flag items where `quantity ≤ minStock` and items where any batch expires within 30 days.
- **FR-W07**: The purchases page MUST support: creating a purchase order with line items, viewing order status, and marking individual line items as received with automatic inventory increment.
- **FR-W08**: The loyalty settings page MUST update `Organization.loyaltyEnabled` AND `CompanySettings.loyaltyEnabled` in the same request so desktop sync receives the correct value immediately.
- **FR-W09**: The admin section (tenants, plans, licenses pages) MUST be accessible ONLY to users with role `SUPER_ADMIN` — any other role receives a redirect or 403.
- **FR-W10**: All report pages MUST support date-range filtering and offer a print or PDF export action.

#### B — API Security & Tenant Isolation

- **FR-A01**: Every API route MUST verify a valid session. Requests without a valid session token MUST receive HTTP 401.
- **FR-A02**: Every non-admin API route MUST call the tenant-context resolver and apply the resolved `organizationId`/`branchId` as a mandatory WHERE clause on all database queries.
- **FR-A03**: Admin routes (`/api/admin/*`) MUST verify `session.user.role` is `ADMIN` or `SUPER_ADMIN` — all other roles receive HTTP 403.
- **FR-A04**: Sync routes (`/api/sync/*`) MUST validate that the `branchId` supplied in the request body belongs to a branch that exists and is active before processing any data.
- **FR-A05**: No API route MUST return or modify a record from an organization other than the one resolved from the authenticated session, even if a valid foreign ID is provided in the request URL or body.
- **FR-A06**: Role-based access control MUST be enforced at the API layer independently of UI-level restrictions.

#### C — Sync Pipelines (Desktop ↔ Web)

- **FR-S01**: All 12 sync routes MUST be idempotent — re-submitting the same payload MUST NOT create duplicate records.
- **FR-S02**: Sales sync MUST transmit: sale ID, all line items, totals, payment method, patient ID, shift ID, safe ID, and creation timestamp.
- **FR-S03**: Settings sync MUST source loyalty configuration (`loyaltyEnabled`, `loyaltyPointsPerDinar`, `loyaltyRedemptionValue`, `loyaltyMinRedemption`) from `Organization` when a valid `branchId` query parameter is provided.
- **FR-S04**: Loyalty sync MUST verify `Organization.loyaltyEnabled` before applying incoming transactions — if disabled, it MUST acknowledge the transactions (preventing desktop retries) without applying any balance changes.
- **FR-S05**: Loyalty sync responses MUST include `accountBalances: { patientId, totalPoints, lifetimePoints, tier }[]` for all affected accounts so the desktop can reconcile local values.
- **FR-S06**: Patient sync MUST upsert by patient ID — existing patients are updated, new patients are created, no duplicates are generated.
- **FR-S07**: Shift sync MUST include: clock-in time, clock-out time, opening balance, closing balance, and all cash-drop events.
- **FR-S08**: Return sync MUST increment the returned item quantities in the branch's web inventory and update the original sale's return status.
- **FR-S09**: Settings sync MUST run on the desktop every 2 minutes and immediately upon network reconnection detection.
- **FR-S10**: The desktop MUST expose all failed sync actions in a Sync Failures UI with per-item retry capability.
- **FR-S11**: The desktop MUST emit `sync-health-updated` IPC events after each sync cycle carrying `{ pendingCount, failedCount, inProgress }`.

#### D — Desktop App

- **FR-D01**: All POS, inventory query, patient lookup, and debt-payment operations MUST function fully without an active network connection.
- **FR-D02**: The POS screen MUST support: barcode scan, patient search, discount application, loyalty point redemption, cash/credit/ZainCash payment methods, and thermal receipt printing.
- **FR-D03**: A user MUST clock in before the POS allows sales; clock-out requires entering the actual cash in the drawer for reconciliation against the expected amount.
- **FR-D04**: On startup, the desktop MUST verify the device license. If the license is absent, expired, or deactivated, all operations beyond the license screen MUST be blocked.
- **FR-D05**: The drug interaction checker MUST alert the pharmacist before finalizing a sale when any two drugs in the cart have a known incompatibility.
- **FR-D06**: Local SQLite backups MUST be createable on demand and automatically; backups older than 30 days MUST be cleaned up automatically.
- **FR-D07**: Debt payments made on the desktop MUST sync to the web AND MUST earn loyalty points on the paid amount (subject to `loyaltyEnabled`).

#### E — Mobile App

- **FR-M01**: All 35 mobile screens MUST render without crash on both iOS and Android under valid authentication.
- **FR-M02**: The POS tab MUST support the full sale flow: barcode scan, patient search, cart management, payment confirmation, and receipt printing via Bluetooth thermal printer.
- **FR-M03**: The inventory tab MUST display real-time stock levels from the web API with search and category filter.
- **FR-M04**: The purchases tab MUST allow the user to view open purchase orders and mark individual line items as received.
- **FR-M05**: The alerts tab MUST surface low-stock alerts, near-expiry alerts, and system notifications ordered by severity.
- **FR-M06**: The CRM screens MUST support patient search, creation, and viewing of transaction history and loyalty balance.

#### F — Super Admin System

- **FR-SA01**: The provision-tenant operation MUST create Organization, Branch, Admin User, and DeviceLicense in a single atomic database transaction.
- **FR-SA02**: If any step of provisioning fails, the entire transaction MUST roll back — no partial tenant records are left in the database.
- **FR-SA03**: The tenant list MUST display for each organization: name, plan name, branch count, user count, subscription status, device license key, and last-activity timestamp.
- **FR-SA04**: Suspending an organization MUST immediately block all logins and API calls for all users belonging to that organization.
- **FR-SA05**: The super admin MUST be able to assign or change an organization's subscription plan, immediately updating enforced limits.
- **FR-SA06**: Deactivating a device license MUST cause the associated desktop app to enter a locked state on its next license verification check.
- **FR-SA07**: The super admin dashboard MUST show system-wide metrics: total organizations, total branches, total users, sales processed today, and subscription revenue (from Stripe).

#### G — Subscription & Licensing

- **FR-L01**: Branch creation MUST be rejected at the API level when the organization's branch count equals `SubscriptionPlan.maxBranches`.
- **FR-L02**: User creation MUST be rejected at the API level when the organization's user count equals `SubscriptionPlan.maxUsers`.
- **FR-L03**: Stripe payment-failure webhooks MUST update the organization's subscription status and enforce restrictions on plan-limited actions.
- **FR-L04**: License verification MUST check all four conditions: key exists, `isActive` is true, `expiresAt` is null or in the future, and the requesting hardware ID matches the stored hardware ID.
- **FR-L05**: The desktop's offline JWT token MUST encode the subscription/license state so the app can function and enforce limits without an active internet connection.

#### H — Data Integrity

- **FR-DI01**: `LoyaltyAccount.totalPoints` MUST always equal `sum(EARN transactions) - sum(REDEEM transactions)` for that account.
- **FR-DI02**: `LoyaltyAccount.lifetimePoints` MUST always equal `sum(EARN transactions)` for that account and MUST never be decremented.
- **FR-DI03**: Each `Sale.total` MUST equal the sum of its `SaleItem.price × quantity` values minus any applied discount amount.
- **FR-DI04**: An inventory transfer MUST NOT change the total combined quantity of an item across the source and destination branches.
- **FR-DI05**: Deleting a Patient MUST either cascade all dependent records (sales, prescriptions, loyalty, insurance, debt payments) or be blocked with a message listing the blocking dependencies.

---

### Key Entities

- **Organization**: Top-level tenant. Holds loyalty configuration, plan limits, suspension state.
- **Branch**: Belongs to one Organization. Primary data-scoping unit for all queries.
- **User**: Belongs to one Branch. Has a role and a JSON permissions blob for granular access.
- **DeviceLicense**: Belongs to one Branch. Controls desktop app access with key, hardware ID, and expiry.
- **SubscriptionPlan**: Defines `maxBranches`, `maxUsers`, price tier, and feature flags.
- **Sale**: Core transaction. Belongs to a Branch and optionally a Patient. Contains items, payment, shift reference.
- **Patient**: Belongs to a Branch. Has a loyalty account, prescriptions, insurance policies, and a debt balance.
- **LoyaltyAccount**: One per patient. Tracks `totalPoints` (redeemable), `lifetimePoints` (tier-determining), `tier`.
- **Inventory**: One record per drug per branch. Tracks quantity, price, cost, min/max stock thresholds.
- **Transfer**: Records inter-branch stock movement through PENDING → RECEIVED states.
- **SyncActionLog**: Records pending and failed sync operations on the desktop for retry.
- **AuditLog**: Immutable record of all significant actions with user, branch, entity, and timestamp.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 92 web dashboard pages load (HTTP 200, zero JS console errors) for all four roles within 3 seconds on a standard broadband connection.
- **SC-002**: All 35 mobile screens render without crash on both iOS and Android simulators, and on at least one physical device of each OS.
- **SC-003**: All 14 desktop screens render without crash under both online and offline network conditions with a valid device license.
- **SC-004**: 100% of the 101 API routes return HTTP 401 for unauthenticated requests.
- **SC-005**: 100% of the 101 API routes return HTTP 403 or empty results when a valid session attempts to access data outside its organization scope.
- **SC-006**: 100% of the 12 sync routes reject a `branchId` belonging to a different organization.
- **SC-007**: A sale processed offline on the desktop appears on the web dashboard with correct inventory and loyalty adjustments within one sync cycle (≤ 2 minutes) after reconnection — zero duplicate records.
- **SC-008**: Disabling loyalty on the web settings page is reflected on the desktop within 2 minutes — no loyalty points are awarded in any subsequent sale on any platform.
- **SC-009**: A tenant provisioned by the super admin is fully operational (login, POS, inventory access) within 60 seconds of provisioning completing.
- **SC-010**: Suspending an organization blocks 100% of login attempts for that organization's users within 5 seconds of the suspension action.
- **SC-011**: Exceeding a plan's `maxBranches` or `maxUsers` limit is rejected 100% of the time at the API level, regardless of client state.
- **SC-012**: `LoyaltyAccount.totalPoints` is consistent between web and desktop within one sync cycle after any earning or redemption event — deviation is zero.
- **SC-013**: 100% of a sample of 50 tested mutation operations generate a corresponding AuditLog entry with correct entity, user, and branch attribution.
- **SC-014**: A complete POS sale flow (item scan → cart → payment → receipt) is completable in under 90 seconds on each of the three platforms.
- **SC-015**: The desktop app reaches a usable POS screen in under 10 seconds from cold start on target hardware.

---

## Assumptions

1. A dedicated test environment exists with at least two organizations, each having two branches, four users (one per role), a seeded product catalog, and a funded test safe.
2. The test environment supports simulating network disconnection for offline desktop testing.
3. Stripe integration is tested in test mode — no real charges are processed.
4. ZainCash integration is tested against the sandbox environment only.
5. Mobile tests run on iOS 17+ and Android 13+ simulators, plus at least one physical device per OS.
6. Receipt printing is tested against a virtual printer or a dedicated Bluetooth thermal printer.
7. At least one `SubscriptionPlan` record exists in the test database with non-null `maxBranches` and `maxUsers`.
8. A `SUPER_ADMIN` user account exists separately from any tenant admin account.
9. The loyalty settings consistency fix (loyalty PUT updates both `Organization` and `CompanySettings`) is deployed before SC-008 is tested.
10. Warehouse and Marketplace features are explicitly excluded from this audit — they are marked experimental in the current codebase.
11. The patient-facing mobile app (`PatientAppUser`, `PatientAppOrder`) is out of scope — it warrants a separate audit.

---

## Out of Scope

- Load and stress testing beyond the response-time thresholds defined in SC-001 and SC-007.
- Automated penetration testing or formal security scanning (beyond the tenant isolation validation defined in FR-A01–FR-A06).
- Third-party delivery confirmation for WhatsApp notifications.
- Automated UI regression test suite setup — this spec defines acceptance criteria only; tooling selection is a separate decision.
- Warehouse module and Marketplace features (experimental, incomplete).
- Patient-facing mobile application (separate audit scope).
