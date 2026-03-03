# Tasks: Billing Management & Zain Cash Integration

**Input**: Design documents from `specs/005-billing-and-zaincash/`
**Spec**: spec.md (2 user stories)

---

## Phase 1: Escape Hatch & Settings Navigation

**Purpose**: Implement the `<OverlayManager />` to fix the Catch-22 lockout, refactor the settings section into a tabbed hub, and update the overlay's CTA links to point to the new billing route.
**⚠️ CRITICAL**: This phase must be complete before Phase 2 can be tested end-to-end. A suspended user cannot reach the billing page until the whitelist is live.

- [X] T001 Create `apps/web/app/ui/dashboard/overlay-manager.tsx` — a `"use client"` component accepting `isSuspended: boolean`, using `usePathname()` to check against the suspension whitelist (`/dashboard/settings/billing`, `/dashboard/debts`), and rendering `<SuspendedOverlay />` only when not whitelisted.
- [X] T002 Update `apps/web/app/dashboard/layout.tsx`: replace `{isSuspended && <SuspendedOverlay />}` with `<OverlayManager isSuspended={isSuspended} />` and swap the import accordingly.
- [X] T003 Create `apps/web/app/dashboard/settings/layout.tsx` — a Server Component that renders a sub-navigation tab bar with links to `/dashboard/settings` (General) and `/dashboard/settings/billing` (Billing), wrapping `{children}`.
- [X] T004 Update the `href` on the "جدد الاشتراك" (Renew Subscription) `<Link>` inside `apps/web/app/ui/dashboard/suspended-overlay.tsx` from `/dashboard/settings` to `/dashboard/settings/billing`.

**Checkpoint**: A suspended user can now navigate to `/dashboard/settings/billing` and `/dashboard/debts` freely. All other routes remain locked.

---

## Phase 2: Billing UI (User Story 1)

**Purpose**: Build the billing page shell and its presentational components. Uses hardcoded/placeholder data until Phase 3 provides the real schema.

**Independent Test**: Navigate to `/dashboard/settings/billing`. Verify the page loads with a plan status card, an empty payment history table, and a (disabled) "Renew with Zain Cash" button. Verify the General settings tab still works.

- [X] T005 Create `apps/web/app/dashboard/settings/billing/page.tsx` — a Server Component. For now, fetch `organization.isSuspended` and `organization.subscriptionEndsAt` (null until Phase 3) via the branch lookup pattern established in `layout.tsx`. Pass data to child components.
- [X] T006 Create `apps/web/app/ui/billing/subscription-status-card.tsx` — a presentational component displaying: Plan Name (from `Organization.plan.name`), status badge (derived via `getSubscriptionState()`), and expiry date (formatted with `date-fns`).
- [X] T007 Create `apps/web/app/ui/billing/payment-history-table.tsx` — a presentational component accepting a `transactions` prop (initially an empty array) and rendering a table with columns: Date, Amount, Currency, Gateway, Status. Shows an "No payment history" empty state.
- [X] T008 Create `apps/web/app/ui/billing/renew-button.tsx` — a `"use client"` component rendering the "Renew with Zain Cash" button. Disabled and shows a tooltip ("Coming Soon") until Phase 4 wires up the server action.

**Checkpoint**: User Story 1 is visually complete and independently testable.

---

## Phase 3: Database & Prisma Schema

**Purpose**: Add the `subscriptionEndsAt` field to `Organization` and create the `PaymentTransaction` audit model.
**⚠️ CRITICAL**: The Phase 4 server actions cannot be written until this migration is applied.

- [X] T009 [SYNC-IMPACT] Add `subscriptionEndsAt DateTime?` to the `Organization` model in `apps/web/prisma/schema.prisma`.
- [X] T010 [SYNC-IMPACT] Add the `PaymentTransaction` model to `apps/web/prisma/schema.prisma` with all fields specified in the spec: `id`, `organizationId`, `amount`, `currency`, `gateway`, `gatewayTransactionId` (unique), `status`, `renewalMonths`, `newExpiresAt`, `metadata` (Json), `initiatedAt`, `completedAt`, `createdAt`, `updatedAt`.
- [X] T011 [SYNC-IMPACT] Add the `PaymentGateway` enum (`ZAINCASH`, `STRIPE`, `MANUAL`) and `PaymentTransactionStatus` enum (`PENDING`, `COMPLETED`, `FAILED`, `EXPIRED`) to the schema.
- [X] T012 [SYNC-IMPACT] Add the `paymentTransactions PaymentTransaction[]` relation to the `Organization` model.
- [X] T013 Run `pnpm --filter web prisma migrate dev --name "add_subscription_expiry_and_payment_transactions"` to apply all schema changes in a single migration.
- [X] T014 Update `apps/web/app/dashboard/layout.tsx`: extend the `prisma.branch.findUnique` select to also retrieve `organization.subscriptionEndsAt`, then pass it (instead of always `null`) into `getSubscriptionState()` — activating the date-based warning/grace lifecycle.
- [X] T015 Update `apps/web/app/dashboard/settings/billing/page.tsx` to fetch real `PaymentTransaction` records for the organization and pass them to `<PaymentHistoryTable />`.

**Checkpoint**: The schema is live. The billing page shows real data. The dashboard banner now shows `warning` and `grace` states as expiry approaches.

---

## Phase 4: Zain Cash Server Actions & Verification (User Story 2)

**Purpose**: Implement the complete three-stage payment flow: initiation, redirect, and server-side verification with fulfillment.

- [X] T016 Add all required Zain Cash environment variables to `.env.example` with descriptive comments: `ZAINCASH_MERCHANT_ID`, `ZAINCASH_MERCHANT_SECRET`, `ZAINCASH_MSISDN`, `ZAINCASH_API_URL`, `NEXT_PUBLIC_APP_URL`.
- [X] T017 Create `apps/web/app/lib/actions/billing.ts` with the `initiateZainCashPayment(organizationId: string, renewalMonths: number)` server action:
  - Creates a `PaymentTransaction` with `status: PENDING`
  - Calculates the `amount` from the organization's plan price × `renewalMonths`
  - Builds the Zain Cash JWT payload using `jsonwebtoken` (sign with `ZAINCASH_MERCHANT_SECRET`)
  - POSTs to `ZAINCASH_API_URL/initiate` to receive `{ payUrl, transactionId }`
  - Updates the `PaymentTransaction.gatewayTransactionId` with Zain Cash's ID
  - Returns `{ payUrl }` to the client
- [X] T018 Add `verifyZainCashPayment(gatewayTransactionId: string)` server action to `billing.ts`:
  - Looks up `PaymentTransaction` by `gatewayTransactionId`
  - **Idempotency guard**: if `status !== PENDING`, return current status immediately (no-op)
  - Calls `ZAINCASH_API_URL/verify` to get the authoritative result (never trusts the redirect param)
  - On `SUCCESS`: updates `PaymentTransaction` (`status: COMPLETED`, `completedAt`, `newExpiresAt`), updates `Organization` (`subscriptionEndsAt: +renewalMonths`, `isSuspended: false`)
  - On `FAILED`: updates `PaymentTransaction.status = FAILED` only
  - Stores the raw Zain Cash response JSON in `PaymentTransaction.metadata`
  - Returns `PaymentTransactionStatus`
- [X] T019 Update `apps/web/app/ui/billing/renew-button.tsx` to call `initiateZainCashPayment` on click and use `router.push(payUrl)` to redirect the user. Remove the "Coming Soon" disabled state.
- [X] T020 Update `apps/web/app/dashboard/settings/billing/page.tsx` to read `txn_id` from `searchParams`. If present, call `verifyZainCashPayment(txn_id)` server-side on render and display a success or failure banner based on the result. Revalidate the page data after a successful verification.

**Checkpoint**: Full end-to-end payment flow is functional.

---

## Phase 5: Polish & Hardening

**Purpose**: Edge cases, security hardening, and final integration verification.

- [X] T021 Create `apps/web/app/api/webhooks/zaincash/route.ts` — an optional server-push webhook endpoint for Zain Cash's server-to-server callback. Validates request signature, calls `verifyZainCashPayment()`, returns `200 OK`. This handles cases where the user closes the browser before being redirected back.
- [X] T022 Add a PENDING transaction timeout: a background check (or on-demand check during billing page load) that marks `PaymentTransaction` records older than 30 minutes with `status: EXPIRED`.
- [X] T023 Add error handling for Zain Cash API downtime in `initiateZainCashPayment` — if the API call fails, delete the `PENDING` `PaymentTransaction` and surface a user-friendly error message rather than leaving ghost records.
- [X] T024 End-to-end integration test: Suspend an organization → navigate to `/dashboard/settings/billing` (overlay absent) → initiate Zain Cash payment → simulate success callback → confirm `Organization.isSuspended = false`, `subscriptionEndsAt` extended, overlay gone on next navigation.
- [X] T025 Code review pass: verify all 7 Success Criteria from `spec.md` are met.
