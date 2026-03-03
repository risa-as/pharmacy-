# Feature Specification: SaaS Control Tower & Iron Wall

**Feature Branch**: `003-saas-control-limits`
**Created**: 2026-02-25
**Status**: Draft

## Overview

This feature has five interdependent parts that together harden the multi-tenant architecture of the platform:

- **Part A — SaaS Control Tower**: Platform operators (SUPER_ADMIN) must see a completely different administrative interface — the tenant roster, licenses, and platform settings — with full isolation from pharmacy operations data.
- **Part B — Iron Wall**: Each tenant's subscription plan enforces hard limits on branches and users, rejected at the server boundary and surfaced as actionable upgrade prompts in the UI.
- **Part C — Subscription Timers & Grace Period**: The platform communicates subscription health proactively — warning banners before expiry, a live-countdown grace period after expiry, and a hard lock overlay once the grace period ends.
- **Part D — Tenant-License Binding (DRM)**: Every device license is bound to a specific pharmacy organization. When the organization is suspended, all of its device licenses are invalidated simultaneously.
- **Part E — Offline Time-Bomb (Electron Lock)**: The desktop app enforces subscription state even when it has no internet connection, using a tamper-resistant locally-stored token checked against the device clock with anti-manipulation safeguards.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — SUPER_ADMIN Control Tower Isolation (Priority: P1)

A platform operator (SUPER_ADMIN) logs in to manage the tenants subscribed to the platform. They need to see an administrative overview — all pharmacies, their plans, user counts, and license statuses — without any exposure to pharmacy operations data (drugs, sales, inventory, patients, etc.).

Conversely, a pharmacy employee (ADMIN, PHARMACIST, CASHIER) must never see the platform operator controls.

**Why this priority**: This is a security and data-isolation requirement. A SUPER_ADMIN accidentally landing on a pharmacy's sales page, or a pharmacist seeing the tenants list, represents a serious confidentiality breach. It must be fixed before any other changes are deployed.

**Independent Test**: A SUPER_ADMIN account can log in and use the administrative interface without ever seeing pharmacy-specific pages. A pharmacy ADMIN account can log in and use all pharmacy features without ever seeing any tenant management pages. Both can be verified independently.

**Acceptance Scenarios**:

1. **Given** a user with the SUPER_ADMIN role is authenticated, **When** they access the dashboard, **Then** they see only: Overview, Tenants, Licenses, and Settings — with no pharmacy navigation items visible anywhere in the interface.

2. **Given** a user with the SUPER_ADMIN role is authenticated, **When** they manually type a pharmacy URL (e.g., `/dashboard/sales`), **Then** they are redirected away from that page and cannot access pharmacy data.

3. **Given** a user with role ADMIN, PHARMACIST, or CASHIER is authenticated, **When** they access the dashboard, **Then** they see the normal pharmacy navigation (Drugs, Inventory, Sales, Patients, etc.) and no tenant management items are visible.

4. **Given** a user with role ADMIN, PHARMACIST, or CASHIER is authenticated, **When** they manually type a tenant-admin URL (e.g., `/dashboard/tenants`), **Then** they are redirected away and cannot access tenant management pages.

---

### User Story 2 — Backend Plan Limit Enforcement (Priority: P2)

A pharmacy administrator attempts to create a new branch or add a new user when their organization is already at the maximum allowed by their subscription plan.

**Why this priority**: Without backend enforcement, a pharmacy on the Free plan (max 1 branch, max 3 users) could create unlimited branches and users simply by making direct API calls, bypassing UI controls. This would break the business model. Backend enforcement is the authoritative gate — it must exist independently of the UI.

**Independent Test**: Using any API client (or browser dev tools), attempting to create a branch/user beyond the plan limit must result in a rejection with a clear, structured response indicating the limit was reached and an upgrade is required. This can be tested without any frontend changes.

**Acceptance Scenarios**:

1. **Given** an organization on the FREE plan with 1 branch (maxBranches = 1), **When** an admin attempts to create a second branch, **Then** the system rejects the request and returns a limit-reached response containing the current count, the maximum allowed, and a flag indicating an upgrade is required.

2. **Given** an organization on the PROFESSIONAL plan with 3 users (maxUsers = 15), **When** an admin creates users 4 through 15, **Then** all requests succeed normally.

3. **Given** an organization on the PROFESSIONAL plan already at 15 users (maxUsers = 15), **When** an admin attempts to create user 16, **Then** the system rejects the request with a limit-reached response.

4. **Given** an organization on the ENTERPRISE plan (unlimited), **When** an admin creates branches or users beyond typical plan limits, **Then** all requests succeed — enterprise plans have no hard cap.

5. **Given** the branch limit has been reached, **When** an admin updates an existing branch (not creating a new one), **Then** the update succeeds — limits only apply to creation, not modification.

---

### User Story 3 — Frontend Upgrade Prompt on Limit Reached (Priority: P3)

A pharmacy administrator uses the web interface to add a new user or branch, but they are already at their plan's limit. Instead of seeing a cryptic error, they see a clear, friendly message in Arabic explaining what limit was reached and offering a direct path to upgrade their plan.

**Why this priority**: This is the UX layer on top of the backend enforcement (P2). Users who hit a limit in the UI should be empowered to act — not confused. This story depends on P2 being implemented first, but it delivers significant user experience value and directly supports upgrade conversion.

**Independent Test**: In the web app, when the "Add User" or "Add Branch" form is submitted and the plan limit has been reached, an inline Arabic-language upgrade prompt appears (not a generic error) with a button linking to the upgrade/billing page.

**Acceptance Scenarios**:

1. **Given** an organization is at its user limit, **When** an admin submits the "Add User" form, **Then** the form displays an inline Arabic message: "لقد وصلت إلى الحد الأقصى من المستخدمين في خطتك. يرجى الترقية للاستمرار." along with an "ترقية الخطة" button that navigates to the upgrade page.

2. **Given** an organization is at its branch limit, **When** an admin submits the "Add Branch" form, **Then** the form displays an equivalent inline Arabic message about the branch limit and the same upgrade button.

3. **Given** the upgrade prompt is shown, **When** the admin clicks "ترقية الخطة", **Then** they are taken directly to the plan upgrade/billing page.

4. **Given** an organization is NOT at its limit, **When** an admin submits the "Add User" or "Add Branch" form, **Then** no upgrade prompt is shown and the normal success/error flow proceeds.

5. **Given** a non-limit server error occurs (e.g., network failure or validation error), **When** the form is submitted, **Then** the normal error message is shown — not the upgrade prompt.

---

### User Story 4 — Subscription Timers & Grace Period (Priority: P4)

A pharmacy organization's subscription approaches expiry. Pharmacists and administrators need clear, timely warnings so they can renew before service is interrupted — and if they miss the deadline, they need a defined window to recover before any data access is restricted.

**Why this priority**: This is the UX and business continuity layer for subscription lifecycle management. Without it, users are surprised by sudden lockouts, leading to urgent support calls and churn. A well-communicated grace period reduces churn and protects pharmacy operations during renewal lapses.

**Independent Test**: With `subscriptionEndsAt` set to a date 5 days in the past, the dashboard shows the RED grace-period banner with a live countdown. POS operations work. Admin-write actions are blocked. Testable on web without touching desktop.

**Acceptance Scenarios**:

1. **Given** a pharmacy's subscription ends in 7 days or fewer (but has not yet expired), **When** any authenticated user accesses the dashboard, **Then** a dismissible amber warning banner appears at the top of every page with the exact number of days remaining and a "Renew Now" link.

2. **Given** the amber banner has been dismissed by a user, **When** the same user navigates to another page, **Then** the banner remains hidden for that browser session. When a new session starts, the banner reappears.

3. **Given** a pharmacy's subscription has expired and is within the 5-day grace period, **When** any authenticated user accesses the dashboard, **Then** a non-dismissible RED banner is shown at the top of every page with a live countdown in the format "يتوقف النظام خلال X أيام : HH:MM:SS".

4. **Given** the system is in the grace period state, **When** an ADMIN or PHARMACIST attempts a read-only operation (view sales, view reports, view inventory), **Then** the operation succeeds.

5. **Given** the system is in the grace period state, **When** an ADMIN attempts a write-administrative operation (create user, create branch, change settings, import drugs), **Then** the operation is blocked with a message directing them to renew their subscription.

6. **Given** the system is in the grace period state, **When** a CASHIER or PHARMACIST attempts a point-of-sale or patient-care operation (record sale, process payment, create invoice, process return, prescribe medication), **Then** the operation succeeds — daily pharmacy operations are never interrupted during the grace period.

7. **Given** a pharmacy's grace period has fully expired (more than 5 days past `subscriptionEndsAt`), **When** any authenticated user accesses the dashboard, **Then** a full-screen Lock Overlay replaces all content. Only the "تصدير ديون PDF" (Export Debts PDF) action remains accessible. All other operations are blocked.

8. **Given** the full Lock Overlay is active, **When** an admin successfully renews the subscription, **Then** the Lock Overlay is removed and the system returns to normal operation immediately upon the next page load or session refresh.

---

### User Story 5 — Tenant-License Binding & Suspension Cascade (Priority: P5)

A SUPER_ADMIN needs to generate device licenses that are explicitly tied to a specific pharmacy organization. When the SUPER_ADMIN suspends a tenant — either manually or as a result of subscription expiry — all desktop device licenses associated with that organization must be deactivated atomically.

**Why this priority**: Without organization binding, a license could outlive the subscription it was issued for, allowing a suspended tenant to continue using the desktop app indefinitely. The suspension cascade closes this loophole.

**Independent Test**: With a test organization having 2 branches and 3 active device licenses, triggering a suspension should result in all 3 licenses showing `isActive = false`. This is verifiable by inspecting the license table after the suspension action.

**Acceptance Scenarios**:

1. **Given** a SUPER_ADMIN is on the license generation form, **When** they fill in the required fields, **Then** selecting the target Organization is a mandatory step — no license can be created without specifying which org it belongs to.

2. **Given** a license has been generated for Organization A, **When** the SUPER_ADMIN views that license record, **Then** the associated organization name is clearly displayed and the license is searchable/filterable by organization.

3. **Given** an organization has 2 branches and 3 active device licenses (1 on branch A, 2 on branch B), **When** the SUPER_ADMIN suspends (or the system auto-suspends due to grace period expiry) that organization, **Then** all 3 device licenses are set to inactive simultaneously — none remain active.

4. **Given** a tenant's suspension is reversed (subscription renewed), **When** the SUPER_ADMIN reactivates the organization, **Then** the device licenses are re-activated and the desktop devices can connect again after their next online check-in.

5. **Given** a specific device license is deactivated individually (not via org suspension), **When** the desktop app using that license next performs an online check-in, **Then** it is locked to the Lock Screen regardless of the organization's overall subscription state.

---

### User Story 6 — Offline Time-Bomb (Electron Lock) (Priority: P6)

A pharmacy's desktop Electron app is being used in a location with no internet connection. The subscription has expired, or a SUPER_ADMIN has manually suspended the tenant. The offline app must still enforce the subscription state — it cannot remain unlocked indefinitely just because it cannot reach the server.

**Why this priority**: Without offline enforcement, a suspended pharmacy could simply disconnect from the internet and continue operating indefinitely. This undermines the entire enforcement model.

**Independent Test**: With the network cable physically unplugged and the device's `subscriptionEndsAt` (as stored locally) set to yesterday, the desktop app must show the Lock Screen on the next startup — without any server communication.

**Acceptance Scenarios**:

1. **Given** the desktop app is online, **When** it successfully connects to the server, **Then** it downloads and stores a tamper-resistant offline token containing the subscription's active expiry date, grace period end date, and the time the token was issued.

2. **Given** the desktop app is offline, **When** the app starts up or wakes from sleep, **Then** it checks the locally stored token against the system clock to determine the current subscription state (active / warning / grace / suspended).

3. **Given** the desktop app is offline and the locally-stored grace period end date has passed, **When** the app starts, **Then** the Lock Screen is displayed — POS and all other operations are blocked.

4. **Given** the desktop app is offline and the system clock has been set to a time BEFORE the token's issuance timestamp (a clock rollback), **When** the app starts, **Then** it detects the anomaly and treats the subscription as expired — it does NOT honor the rolled-back clock.

5. **Given** the desktop app has been offline for longer than the maximum permitted offline window (14 days), **When** the app starts, **Then** the Lock Screen is displayed regardless of what the system clock shows — a forced check-in is required to resume operation.

6. **Given** the app was in Lock Screen state due to being offline too long, **When** the device reconnects and the server confirms an active subscription, **Then** the Lock Screen is removed and a new offline token is downloaded and stored.

---

### Edge Cases

- What happens when `maxBranches` or `maxUsers` is set to `0` (zero)? The system should treat 0 as "immediately at limit" — no creation is possible on this plan without upgrading.
- What happens when `maxBranches` or `maxUsers` is set to `-1` or `null`? These values should be treated as "unlimited" (Enterprise behavior).
- What happens if the SUPER_ADMIN role is assigned to a user who also has a pharmacy organization? The Control Tower view takes precedence — the SUPER_ADMIN view must always be shown regardless of any associated organization.
- What happens if a plan limit is lowered retroactively (e.g., org downgrades from 15 users to 3, but already has 8 users)? Existing data is not deleted; only new creation is blocked. The UI should show a warning that the account is over-limit.
- What happens when a SUPER_ADMIN tries to access a page that doesn't exist in either navigation set? Standard 404 handling applies.
- What happens if the subscription is renewed mid-grace-period? The countdown banner must disappear immediately upon the next page load — it must not linger based on a cached state.
- What happens if the subscription is renewed mid-Lock Overlay? Same as above — the overlay must be removed on the next page load or session refresh.
- What happens if `subscriptionEndsAt` is null (no expiry date set)? This should be treated as an unlimited/perpetual subscription — no warning or grace period states are triggered.
- What if the device clock is set to a future date (clock roll-forward) to simulate time-bombing the subscription early? This is a low-risk case (self-harm, not fraud) but the system should not lock a device whose token's `issuedAt` is in the future — it should log a warning and proceed with normal state.
- What happens if the offline token itself is deleted or corrupted? The app should treat a missing/invalid token as if it were offline past the maximum offline window — show the Lock Screen and require an online check-in to recover.
- What if an organization has zero branches (no device licenses yet)? Suspension cascade still succeeds — there is simply nothing to deactivate.
- What if a CASHIER attempts an admin-level write operation during the grace period? The backend must enforce the grace-period write block regardless of role — not just for ADMIN.

---

## Platform & Offline Scope

- **Web** (`apps/web`): Online-only. Subscription state banners, grace period enforcement, and limit guards all run server-side and in real time. Parts A, B, C, D are web-only concerns.
- **Desktop** (`apps/desktop`): Part E (Offline Time-Bomb) is desktop-only. The app must store a tamper-resistant offline token, enforce the Lock Screen based on local state, and re-sync when online. SUPER_ADMIN isolation (Part A) is not needed in desktop — the desktop app serves pharmacy users only.
- **Mobile** (`apps/mobile`): Not in scope for this feature.
- **Synced entities**: `DeviceLicense` (isActive, expiresAt) must be readable offline; Organization `subscriptionEndsAt` and `isSuspended` must be synced to the desktop on every online check-in.

---

## Requirements *(mandatory)*

### Functional Requirements

**Part A — Control Tower**

- **FR-001**: The system MUST display a distinct "Control Tower" navigation to any authenticated user with the SUPER_ADMIN role, containing only: Overview, Tenants, Licenses, and Settings.
- **FR-002**: The system MUST completely hide all pharmacy-specific navigation items (Drugs, Inventory, Sales, Patients, Prescriptions, Reports, Debts, Smart Orders, Suppliers, Purchases) from any SUPER_ADMIN session.
- **FR-003**: The system MUST redirect SUPER_ADMIN users away from any pharmacy-specific route they attempt to access directly.
- **FR-004**: The system MUST completely hide all tenant-management navigation items (Tenants, Licenses, platform Settings) from pharmacy users (ADMIN, PHARMACIST, CASHIER).
- **FR-005**: The system MUST redirect pharmacy users away from any tenant-management route they attempt to access directly.

**Part B — Iron Wall**

- **FR-006**: The system MUST check the current branch count against the organization's `maxBranches` limit before allowing any new branch to be created.
- **FR-007**: The system MUST check the current user count against the organization's `maxUsers` limit before allowing any new user to be created.
- **FR-008**: When a limit is reached, the system MUST return a structured rejection containing: whether the limit was reached, the current count, the maximum allowed, and an indicator that an upgrade is required.
- **FR-009**: The system MUST treat a limit value of `-1` or `null` as unlimited (no cap enforced).
- **FR-010**: The limit check logic MUST be implemented as a shared, reusable utility so that any future creation endpoint can adopt the same enforcement pattern without duplicating code.
- **FR-011**: The web "Add User" form MUST detect a limit-reached response and display an Arabic-language inline upgrade prompt instead of a generic error message.
- **FR-012**: The web "Add Branch" form MUST detect a limit-reached response and display an Arabic-language inline upgrade prompt instead of a generic error message.
- **FR-013**: Every upgrade prompt MUST include a clearly labelled button ("ترقية الخطة") that navigates the user to the plan upgrade page.
- **FR-014**: An upgrade prompt MUST NOT be shown in response to any error other than a plan limit rejection (e.g., validation errors and network failures must show normal error handling).

**Part C — Subscription Timers & Grace Period**

- **FR-015**: The system MUST show a dismissible amber warning banner on every page when `subscriptionEndsAt` is within 7 calendar days and has not yet passed.
- **FR-016**: The amber banner MUST be suppressible per browser session (once dismissed, it does not reappear until a new session begins).
- **FR-017**: The system MUST show a non-dismissible RED banner with a live countdown timer when `subscriptionEndsAt` has passed and the grace period (5 days) has not yet elapsed.
- **FR-018**: The live countdown MUST display remaining time in the format "X أيام : HH:MM:SS" and update every second.
- **FR-019**: During the grace period, the system MUST block the following operations (the **Grace Period Block List** — CTO-approved): Create User, Create Branch, Change Settings, Import Drugs, Add Inventory Batch, Create Supplier, Change Plan, Create Drug in global DB. The following operations MUST remain allowed: Record Sale, Process Payment, Create Invoice, Process Return, Prescribe Medication, Dispense, Create Patient Record, Process Insurance Claim, View any Report, Export any Report. This list MUST be defined as a named constant in the implementation so it can be maintained in one place.
- **FR-020**: During the grace period, the system MUST allow all POS and patient-care operations (record sale, process payment, create invoice, process return, prescribe medication, dispense) for all roles.
- **FR-021**: After the grace period has fully elapsed, the system MUST display a prominent "Subscription Suspended" overlay/banner on all pages. All write, edit, and delete operations MUST be globally disabled. The POS MUST be locked. However, all historical data (sales, patients, prescriptions, invoices, reports) MUST remain viewable in read-only mode. The "تصدير ديون PDF" export MUST remain accessible.
- **FR-022**: The Lock Overlay MUST be automatically lifted (on the next page load) when a renewed subscription is detected.
- **FR-023**: Subscription state (active / warning / grace / suspended) MUST be computed server-side on each request — it MUST NOT rely solely on cached or client-side state.

**Part D — Tenant-License Binding**

- **FR-024**: The license creation form MUST require selection of a specific Organization — a license without an associated organization MUST be rejected.
- **FR-025**: Every license record MUST display its associated organization name in all admin views.
- **FR-026**: When an organization transitions to the "suspended" state (whether by subscription expiry or manual SUPER_ADMIN action), the system MUST atomically set `isActive = false` on ALL device licenses belonging to ALL branches of that organization.
- **FR-027**: When a suspended organization's subscription is renewed or the SUPER_ADMIN manually reactivates it, the system MUST atomically restore `isActive = true` on all device licenses that were deactivated by the suspension (but not licenses that were individually deactivated for other reasons).
- **FR-028**: The organization-to-license cascade path is: `Organization → Branches → DeviceLicenses`. The system MUST traverse this full path when executing suspension or reactivation cascades.

**Part E — Offline Time-Bomb**

- **FR-029**: When the desktop app successfully performs an online check-in, the server MUST issue a tamper-resistant offline token containing: the subscription's active expiry date, the grace period end date, the token issuance timestamp, and the maximum number of days the app may operate offline without a new check-in.
- **FR-030**: The offline token MUST be cryptographically signed by the server so that its contents cannot be modified by the client without detection.
- **FR-031**: On every startup and wake-from-sleep event, the desktop app MUST evaluate the current subscription state by comparing the system clock against the locally stored offline token.
- **FR-032**: If the current system clock is earlier than the token's issuance timestamp (clock rollback detected), the desktop app MUST treat the subscription as expired and show the Lock Screen.
- **FR-033**: If the app has not successfully performed an online check-in within the maximum offline window (14 days), the desktop app MUST show the Lock Screen regardless of the token's stored expiry date.
- **FR-034**: If the locally stored offline token is absent, corrupted, or fails signature verification, the desktop app MUST show the Lock Screen and require an online check-in to recover.
- **FR-035**: When the desktop app is online and detects that a new token is available (e.g., subscription was renewed), it MUST replace the locally stored token immediately.

### Key Entities

- **Platform Operator (SUPER_ADMIN)**: A special privileged user who manages the SaaS platform itself. Has no pharmacy affiliation. Sees all tenants but no pharmacy-level data.
- **Pharmacy User (ADMIN / PHARMACIST / CASHIER)**: A user belonging to a specific pharmacy organization. Sees only their own pharmacy data. Cannot see platform-level controls.
- **Organization (Tenant)**: A pharmacy subscribed to the platform. Has a `plan` (FREE, BASIC, PROFESSIONAL, ENTERPRISE), a `maxBranches` limit, a `maxUsers` limit, a `subscriptionEndsAt` date, and an `isSuspended` flag.
- **Subscription Plan**: Determines the hard caps for an organization. FREE = 1 branch / 3 users; BASIC = 2 branches / 8 users; PROFESSIONAL = 5 branches / 15 users; ENTERPRISE = unlimited.
- **Subscription State**: The computed lifecycle stage of an organization — one of: Active, Warning (≤7 days to expiry), Grace Period (0–5 days post-expiry), Suspended (>5 days post-expiry or manual suspension).
- **Limit Check Result**: The outcome of comparing a current count to a plan maximum — either "allowed" or "limit reached" with supporting metadata (current, max, upgradeRequired).
- **Device License**: A record linking a specific hardware device to a specific branch (and therefore an organization). Contains an `isActive` flag, an `expiresAt` date, and a `lastSeenAt` timestamp.
- **Offline Token**: A cryptographically signed, locally-stored record that allows the desktop app to evaluate subscription state without a server connection. Contains: `subscriptionEndsAt`, `gracePeriodEndsAt`, `issuedAt`, `maxOfflineDays`, and a server signature.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A SUPER_ADMIN user can log in and complete any tenant management task without ever encountering a pharmacy operations page — 100% of navigation paths in the Control Tower lead only to control tower destinations.
- **SC-002**: A pharmacy user (any role) can log in and complete any pharmacy task without encountering any tenant management page — 100% of navigation paths in the pharmacy view lead only to pharmacy destinations.
- **SC-003**: 100% of attempts to create a branch or user beyond the plan limit are rejected — no bypass is possible through direct API calls.
- **SC-004**: When a user hits a plan limit in the UI, they see the upgrade prompt within the same form interaction — zero extra navigation steps required.
- **SC-005**: The upgrade button on the limit prompt successfully navigates the user to the plan upgrade page in 100% of cases.
- **SC-006**: Over-limit rejection does not affect update or read operations — existing data remains 100% accessible.
- **SC-007**: A future developer can enforce plan limits on any new creation endpoint by calling the shared guard utility without copy-pasting logic.
- **SC-008**: The amber warning banner appears on every dashboard page within 7 days of subscription expiry with no additional user action required.
- **SC-009**: The RED grace-period banner with live countdown is visible and accurate to within 2 seconds at all times during the grace period.
- **SC-010**: POS sales operations succeed 100% of the time during the grace period — daily pharmacy operations are never interrupted by a lapsed subscription.
- **SC-011**: Upon subscription expiry past the grace period, the Lock Overlay appears within one page load — no extra navigation is required for the lock to engage.
- **SC-012**: When a suspension is triggered (manual or automatic), all device licenses for the affected organization are deactivated within a single database transaction — partial deactivation is not possible.
- **SC-013**: The desktop app enforces the Lock Screen in 100% of offline scenarios where the locally-stored token indicates suspension — the app cannot be bypassed by disconnecting from the network.
- **SC-014**: The desktop app detects clock rollback in 100% of cases where the system clock is set to before the token issuance time, and responds with the Lock Screen.
- **SC-015**: After 14 consecutive days offline, the desktop app shows the Lock Screen regardless of what the token says — an online check-in is required.

---

## Assumptions

- The SUPER_ADMIN role is determined at authentication time and stored in the user session. It is not stored in the standard database User model (which only has ADMIN, PHARMACIST, CASHIER).
- `subscriptionEndsAt` already exists on the Organization model in the database schema.
- The `DeviceLicense` model already exists in the database schema, linked to `Branch` (which is linked to `Organization`). The cascade path for suspension is `Organization → Branches → DeviceLicenses`.
- An `isSuspended` boolean field does not yet exist on the Organization model and will need to be added to support both automatic (expiry-based) and manual (SUPER_ADMIN-triggered) suspension states.
- The upgrade/billing page already exists at a known route; this feature only needs to link to it.
- Plan limits (`maxBranches`, `maxUsers`) are already stored on the Organization model and are correctly maintained when a plan changes.
- ENTERPRISE plan organizations have `maxBranches = -1` and `maxUsers = -1` (or `null`) to signal unlimited.
- The "Tenants" and "Licenses" pages already exist in the codebase but are currently not properly gated; this feature adds the proper routing isolation.
- The maximum offline window is set at 14 days as a default; this value should be configurable at the platform level.
- The desktop app already has a mechanism to store local data securely (Electron store / SQLite) that can hold the offline token.

---

## Principal Engineer Recommendations

*These recommendations are provided for CTO review before finalising the implementation plan. They identify security vulnerabilities, architectural gaps, and SaaS best practices relevant to this feature.*

---

### REC-001: The Clock Rollback Problem is More Nuanced Than It Appears

**Risk level**: HIGH

The spec requires that the desktop app detect clock rollback (FR-032). The simplest approach is to compare the current time to the token's `issuedAt`. However, this has a subtlety: what if the user legitimately changes their system clock forward by 1 day (e.g., timezone correction) and then back? The `lastSeenAt` field on `DeviceLicense` is a more reliable anchor point — it is written by the *server* during every online check-in, not by the client.

**Recommendation**: The anti-rollback check should compare the current system time against both `token.issuedAt` AND the `lastSeenAt` timestamp stored from the most recent successful online check-in (stored separately from the token). If the current time is earlier than either, trigger the lock. This closes the "issued before rollback" gap.

Additionally, the maximum offline window (FR-033: 14 days) is itself a second line of defence against clock manipulation. Even if a user defeats the rollback check, they can only extend their free run by 14 days before a forced check-in is required. This should be communicated in documentation so operators understand the security model's boundaries.

---

### REC-002: The "Offline Token" Should Be a Signed JWT, Not a Plain JSON File

**Risk level**: HIGH

FR-030 requires the token to be "cryptographically signed." The natural implementation is a JWT (JSON Web Token) using HMAC-SHA256 with a server-side secret. This is important to specify at the spec level because it constrains the desktop app's dependency choices.

**Recommendation**: Add to the spec (or explicitly note in the plan) that the offline token MUST be a standard JWT. This makes the signing/verification logic a commodity (existing JWT libraries in any language) rather than custom crypto. The key should be rotated annually, and old tokens should remain valid until the next forced check-in refreshes them.

*Caution*: The signing key must NEVER be stored on the client. The desktop app only needs to verify the signature (using the public key half, if asymmetric signing is used). If symmetric HMAC is used, the token cannot be verified client-side without embedding the secret. **Recommendation**: Use asymmetric signing (RS256 or ES256) — the server signs with the private key, the desktop app verifies with the embedded public key. The public key can be bundled in the Electron app binary.

---

### REC-003: The "Suspended State — Only Export Debts PDF" Creates a Data Hostage Risk

**Risk level**: MEDIUM (legal/ethical)

FR-021 states that in the suspended state, only "تصدير ديون PDF" remains accessible. This is a common SaaS pattern but creates a "data hostage" situation — the pharmacy cannot access their own patient records, sales history, or prescription logs.

**Recommendation**: In the suspended state, allow **read-only access** to all historical data (view sales, view prescriptions, view patients, view reports, view debts) in addition to the debt export. Only write operations and data exports of bulk records should be blocked. This reduces legal exposure and is the standard practice for healthcare-adjacent SaaS platforms where continuity of patient records is a regulatory consideration in many jurisdictions.

If a stricter lock is a deliberate business decision, this decision should be documented explicitly in the spec/plan with a risk acknowledgment.

---

### REC-004: "Admin Actions Blocked During Grace Period" Needs a Canonical Definition

**Risk level**: MEDIUM

FR-019 says "block all admin-level write operations" but the boundary between "admin write" and "daily operation" is ambiguous. Edge cases that need explicit decisions:

| Operation | Recommended Status | Reason |
|---|---|---|
| Add Inventory Batch | **BLOCKED** | Grows org footprint, not urgent |
| Record Sale / POS | **ALLOWED** | Core daily pharmacy operation |
| Process Return | **ALLOWED** | Required for POS integrity |
| Create Supplier | **BLOCKED** | Non-urgent administrative action |
| Create Prescription | **ALLOWED** | Patient care — cannot be interrupted |
| Change System Settings | **BLOCKED** | Non-urgent administrative action |
| View any Report | **ALLOWED** | Read-only, needed for operations |
| Export any Report | **ALLOWED** | Pharmacists need records access |
| Create Patient Record | **ALLOWED** | Patient care — cannot be interrupted |
| Create Drug in DB | **BLOCKED** | Non-urgent administrative action |
| Process Insurance Claim | **ALLOWED** | Revenue collection — cannot be interrupted |

**Recommendation**: Define a named constant (e.g., `GRACE_PERIOD_BLOCKED_OPERATIONS`) in the implementation so the exact list is maintained in one place, not scattered across individual API routes. This maps to FR-019's requirement for a "named set."

---

### REC-005: The License Suspension Cascade Has a Schema Gap

**Risk level**: MEDIUM

The current `DeviceLicense` model is linked to `Branch`, not directly to `Organization`. The cascade path is `Organization → Branches → DeviceLicenses`. This works correctly, but the current schema does not have an `organizationId` on `DeviceLicense`.

The suspension cascade must:
1. Query all branches for the organization
2. Query all device licenses for those branches
3. Set all to `isActive = false` in a single transaction

This is achievable with the current schema, but the re-activation scenario (FR-027) introduces a complexity: when re-activating, the system must restore only the licenses that were deactivated *by the suspension* — not licenses that were independently deactivated for other reasons (e.g., a stolen device). This requires either:
- **Option A**: Store a `suspendedByOrgSuspension Boolean @default(false)` flag on `DeviceLicense` — set to `true` when deactivated via org cascade, and check this flag on re-activation.
- **Option B**: Keep a suspension event log with timestamps, and restore licenses that were deactivated within a narrow time window of the suspension event.

**Recommendation**: Option A is simpler and safer. Add this flag to the schema before implementation begins.

---

### REC-006: `isSuspended` Field is Missing from the Schema

**Risk level**: MEDIUM

As noted in Assumptions, the `Organization` model does not currently have an `isSuspended` boolean. Without this field:
- Subscription state must be computed by comparing `now()` to `subscriptionEndsAt` on every request — expensive and error-prone
- Manual SUPER_ADMIN suspension (not caused by expiry) has no storage location
- The desktop offline token cannot cleanly represent "manually suspended"

**Recommendation**: Add `isSuspended Boolean @default(false)` and `suspendedAt DateTime?` to the Organization model before any other Part C/D/E work begins. This becomes the canonical source of truth for suspension state. A background job (or a check on each API request) can flip `isSuspended = true` when `subscriptionEndsAt + 5 days < now()`. SUPER_ADMIN can also flip it manually. The offline token includes this flag directly.

---

### REC-007: Grace Period Abuse Prevention

**Risk level**: LOW

The 5-day grace period could theoretically be exploited: a tenant pays exactly when the grace period ends, resets the clock, and then intentionally misses the next renewal — effectively getting 5 extra days of service every billing cycle at no cost.

**Recommendation**: Track `gracePeriodUsedAt` on the Organization model. If a tenant has used the grace period more than N times (suggest: 2 times in a 12-month window), subsequent lapses skip the grace period and go directly to the Lock Overlay. This is standard practice for subscription-based SaaS with billing integrations (Stripe, etc.) and should be considered for Phase 2 billing integration.

---

### REC-008: Subscription Renewal Propagation Latency

**Risk level**: LOW

FR-022 states the Lock Overlay is lifted "on the next page load." In the desktop app, FR-035 states the token is refreshed "when online and a new token is available." This means there is a brief window after renewal where:
- Web user must do a full page reload
- Desktop user must wait for the next check-in cycle

This is acceptable UX, but the spec should explicitly state the maximum acceptable latency: **web lock-lift within 30 seconds of renewal** (one page reload), **desktop lock-lift within the next check-in cycle (max 15 minutes)**. Without this, implementation teams may optimize differently.

---
