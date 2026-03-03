# Feature Specification: Billing Management & Zain Cash Integration

**Feature Branch**: `005-billing-and-zaincash`
**Created**: 2026-02-26
**Status**: Ready for Planning

## Overview

This feature delivers two things in sequence: first, it resolves the "Lockout Catch-22" introduced by the Suspended Overlay by building a proper client-side escape hatch (`<OverlayManager />`) and creating a dedicated Billing sub-page at `/dashboard/settings/billing`; second, it integrates Zain Cash (Iraq's dominant mobile wallet) as the first real payment gateway, allowing tenants to self-serve subscription renewal without contacting support.

---

## User Stories

### User Story 1 — Dedicated Billing Page (Priority: P1)

**As a tenant admin**, I want a dedicated Billing page separated from the general pharmacy settings so I can view my current subscription plan, status, expiry date, and full payment history in one place — without navigating through company configuration options.

**Why this priority**: This page is the functional destination of the Suspended Overlay's "Renew Subscription" button. Without it, the escape hatch has nowhere to escape *to*. It is also a prerequisite for US2.

**Independent Test**: Navigate to `/dashboard/settings/billing`. Verify it shows the current plan name, subscription status badge, expiry date, and a (currently empty) payment history table. Verify that the General settings at `/dashboard/settings` are still fully accessible.

**Acceptance Scenarios**:

1. **Given** I am a tenant ADMIN navigating the dashboard, **When** I visit `/dashboard/settings`, **Then** I see a sub-navigation with two tabs: "General" (active) and "Billing".
2. **Given** I click the "Billing" tab, **When** the page loads, **Then** I see my organization's current plan name, a colour-coded status badge (Active / Warning / Grace / Suspended), and the subscription expiry date.
3. **Given** my organization has made past payments, **When** the billing page loads, **Then** I see a table of `PaymentTransaction` records showing Date, Amount, Gateway, and Status for each.
4. **Given** my organization is suspended, **When** I navigate to any `/dashboard/*` route, **Then** the Suspended Overlay appears — **except** on `/dashboard/settings/billing` and `/dashboard/debts`, where I can act freely to resolve the issue.

---

### User Story 2 — Zain Cash Subscription Renewal (Priority: P1)

**As a tenant admin**, I want to initiate a subscription renewal payment using Zain Cash so that I can restore or extend my access immediately, without calling anyone.

**Why this priority**: Self-service renewal directly reduces churn and eliminates manual SUPER_ADMIN intervention for every expiry event.

**Independent Test**: On the billing page, click "Renew with Zain Cash". Verify you are redirected to the Zain Cash payment page. After simulated authorization, verify you are redirected back to `/dashboard/settings/billing`, the `PaymentTransaction` record shows `COMPLETED`, `Organization.subscriptionEndsAt` is extended by 30 days, and `Organization.isSuspended` is set to `false`.

**Acceptance Scenarios**:

1. **Given** I click "Renew with Zain Cash", **When** the server action runs, **Then** a `PaymentTransaction` record is created with `status: PENDING` and I am redirected to the Zain Cash payment URL.
2. **Given** I authorize the payment on Zain Cash, **When** I am redirected back to the billing page with a `txn_id` query param, **Then** the server verifies the transaction with Zain Cash's API (not just trusting the redirect) and updates the record accordingly.
3. **Given** the payment is verified as `SUCCESS`, **When** verification completes, **Then** `Organization.subscriptionEndsAt` is extended, `Organization.isSuspended` is set to `false`, and a success banner is shown. The Suspended Overlay no longer appears.
4. **Given** the payment is verified as `FAILED` or the user cancels, **When** redirected back, **Then** the `PaymentTransaction` record shows `FAILED`, a clear error message is shown, and the organization's state is unchanged.

---

## Architecture

### Routing Structure

**Before this feature:**
```
/dashboard/settings              ← Single page: company info + backup manager
```

**After this feature:**
```
/dashboard/settings/             ← Settings hub (new layout.tsx adds sub-nav tabs)
├── page.tsx                     ← "General" tab — company info, logo, backup (unchanged)
└── billing/
    └── page.tsx                 ← "Billing" tab — plan status, payment history, renewal
```

The new `settings/layout.tsx` wraps both tabs in a shared shell. It is role-gated to `ADMIN` only (same rule as the existing `settings/page.tsx` guard). No changes to the general settings page are required.

### Settings Layout Refactoring

```
apps/web/app/dashboard/settings/
├── layout.tsx        ← NEW: Server Component, sub-nav tabs [General | Billing]
├── page.tsx          ← EXISTING (no changes): General pharmacy settings
└── billing/
    └── page.tsx      ← NEW: Billing & subscription management
```

The sub-nav renders two `<Link>` components. Active state is determined server-side using the request's pathname (or via `usePathname()` if made a Client Component for active highlighting).

### Escape Hatch: `<OverlayManager />`

The Suspended Overlay currently renders unconditionally for all `/dashboard/*` routes. A new Client Component `<OverlayManager isSuspended={boolean} />` wraps the overlay and consults `usePathname()` before rendering it. Routes on the whitelist are fully accessible even when suspended.

**Whitelist (exact match or prefix):**
```
/dashboard/settings/billing      ← Renewal destination
/dashboard/debts                 ← Debt collection (existing overlay CTA links here)
```

> **Why `/dashboard/settings/billing` and not `/dashboard/settings`?** Precision matters.
> The general settings page allows editing company name, logo, and backups — operations that
> should remain locked during suspension. Only the billing sub-page needs to be open.

### Zain Cash Payment Flow

Zain Cash (Iraq) uses a JWT-signed REST API. No npm client library exists; the integration uses `jsonwebtoken` (already a project dependency) for token signing and native `fetch` for HTTP calls.

```
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1 — INITIATION (Server Action)                        │
│                                                              │
│  Client clicks "Renew"                                       │
│       │                                                      │
│       ▼                                                      │
│  initiateZainCashPayment(renewalMonths)                      │
│  1. INSERT PaymentTransaction { status: PENDING }            │
│  2. Build JWT: { msisdn, amount, orderId,                    │
│                  serviceType, redirectUrl }                   │
│  3. Sign with ZAINCASH_MERCHANT_SECRET                       │
│  4. POST /api/pay → receive { payUrl, transactionId }        │
│  5. UPDATE PaymentTransaction.gatewayTransactionId           │
│  6. Return payUrl to client                                  │
│       │                                                      │
│       ▼                                                      │
│  Client: router.push(payUrl)                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  STAGE 2 — USER AUTHORIZATION (Zain Cash Hosted Page)        │
│                                                              │
│  User authorizes payment on Zain Cash mobile page            │
│  Zain Cash redirects to:                                     │
│  /dashboard/settings/billing?txn_id=ZC_XXX&status=success   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  STAGE 3 — VERIFICATION & FULFILLMENT (Server Action)        │
│                                                              │
│  Page loads, searchParams.txn_id is detected                 │
│  verifyZainCashPayment(txnId) is called                      │
│                                                              │
│  1. Lookup PaymentTransaction by gatewayTransactionId        │
│  2. Guard: if status !== PENDING → return (idempotency)      │
│  3. Call Zain Cash verification endpoint                     │
│                                                              │
│  ┌── SUCCESS ──────────────────────────────────┐            │
│  │ UPDATE PaymentTransaction { status: COMPLETED } │        │
│  │ UPDATE Organization {                        │            │
│  │   subscriptionEndsAt: now + renewalMonths,   │            │
│  │   isSuspended: false                         │            │
│  │ }                                            │            │
│  └──────────────────────────────────────────────┘            │
│                                                              │
│  ┌── FAILURE ──────────────────────────────────┐            │
│  │ UPDATE PaymentTransaction { status: FAILED } │            │
│  │ No change to Organization                    │            │
│  └──────────────────────────────────────────────┘            │
│                                                              │
│  ⚠️  Security: The `status` query param from the redirect is │
│  used ONLY for optimistic UI. The actual authoritative       │
│  result comes exclusively from the Zain Cash API call        │
│  in step 3. The redirect param must never gate DB writes.    │
└─────────────────────────────────────────────────────────────┘
```

### Environment Variables Required

```bash
ZAINCASH_MERCHANT_ID=         # Merchant account identifier
ZAINCASH_MERCHANT_SECRET=     # Signing secret for JWT
ZAINCASH_MSISDN=              # Merchant's registered Zain Cash phone number
ZAINCASH_API_URL=             # Zain Cash production/staging base URL
NEXT_PUBLIC_APP_URL=          # Base URL for constructing redirectUrl callback
```

---

## Data Model Changes

Two changes are required to `apps/web/prisma/schema.prisma`.

### Change 1 — Add `subscriptionEndsAt` to `Organization`

```prisma
model Organization {
  // ... existing fields ...
  subscriptionEndsAt DateTime?   // NEW
}
```

**Rationale**: `subscription-state.ts` already accepts and handles `subscriptionEndsAt` (lines 41–68), but `layout.tsx` has always passed `null` because the field didn't exist on `Organization`. This change activates the full lifecycle state machine: `active → warning → grace → suspended` based on real dates, rather than relying solely on the manual `isSuspended` flag.

### Change 2 — New `PaymentTransaction` Model

```prisma
model PaymentTransaction {
  id                   String                   @id @default(uuid())
  organizationId       String
  amount               Float
  currency             String                   @default("IQD")
  gateway              PaymentGateway           @default(ZAINCASH)
  gatewayTransactionId String?                  @unique
  status               PaymentTransactionStatus @default(PENDING)
  renewalMonths        Int                      @default(1)
  newExpiresAt         DateTime?
  metadata             Json?
  initiatedAt          DateTime                 @default(now())
  completedAt          DateTime?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
}

enum PaymentGateway {
  ZAINCASH
  STRIPE
  MANUAL
}

enum PaymentTransactionStatus {
  PENDING
  COMPLETED
  FAILED
  EXPIRED
}
```

**Why this model:**

| Field | Purpose |
|---|---|
| `gatewayTransactionId` | Unique constraint prevents double-processing the same Zain Cash callback |
| `metadata` | Stores raw Zain Cash API response; invaluable for support debugging |
| `newExpiresAt` | Snapshot of the expiry date that was set on success; creates an immutable audit trail even if Organization is later modified |
| `renewalMonths` | Supports future variable-length plans (1 month, 3 months, 12 months) |
| `PaymentGateway` enum | Leaves the door open for Stripe or manual top-ups without schema changes |

---

## Success Criteria

| ID | Criterion |
|---|---|
| SC-001 | A suspended tenant navigating to `/dashboard/settings/billing` sees the page content — not the overlay |
| SC-002 | A suspended tenant navigating to `/dashboard/inventory` still sees the overlay |
| SC-003 | Clicking "Renew with Zain Cash" redirects the user to a valid Zain Cash payment URL within 2 seconds |
| SC-004 | A successful payment sets `Organization.isSuspended = false` and extends `subscriptionEndsAt` by the correct number of days |
| SC-005 | Calling the verification action twice with the same `txn_id` is idempotent — the second call is a no-op |
| SC-006 | All payment attempts (success and failure) are permanently recorded in `PaymentTransaction` |
| SC-007 | The `subscription-state.ts` warning/grace states are triggered correctly in the dashboard banner as `subscriptionEndsAt` approaches |
