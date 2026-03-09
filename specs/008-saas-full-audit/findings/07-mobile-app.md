# Findings: Mobile App (US7)

**Auditor**: Claude Code
**Date**: 2026-03-09

---

## Screen Inventory

Total screens found: 35

| Path | Description |
|---|---|
| `app/(tabs)/index.tsx` | Home — role-based dashboard delegation |
| `app/(tabs)/sales.tsx` | POS / point-of-sale |
| `app/(tabs)/purchases.tsx` | Purchase orders list |
| `app/(tabs)/inventory.tsx` | Inventory browser + quick-add modals |
| `app/(tabs)/debts.tsx` | Patient debts list + inline payment |
| `app/(tabs)/alerts.tsx` | Notifications + inventory alerts |
| `app/(tabs)/reports.tsx` | Financial reports (admin only) |
| `app/(tabs)/smart-orders.tsx` | Smart reorder suggestions |
| `app/(tabs)/settings.tsx` | Settings tab |
| `app/purchases/[id].tsx` | Purchase detail + WhatsApp |
| `app/purchases/[id]/receive.tsx` | Goods receipt flow |
| `app/crm/index.tsx` | Patient list |
| `app/crm/[id].tsx` | Patient detail |
| `app/crm/add.tsx` | Add new patient |
| `app/checkout/payment.tsx` | Standalone payment screen |
| `app/accounting/expenses.tsx` | Expenses list |
| `app/scan.tsx` | Barcode camera |
| `app/scan-prescription.tsx` | AI prescription scan |
| `app/reports/financial.tsx` | Detailed financial report |
| `app/settings/*` | Settings sub-screens (6 files) |
| `app/login.tsx` | Login |
| `app/index.tsx` | Root redirect |
| `app/alerts.tsx` | Legacy alerts screen |
| `app/printer-settings.tsx` | Printer pairing |
| `app/server-config.tsx` | Server URL config |

**Services audited**: `api.ts`, `crm.ts`, `printer.ts`, `sync.ts`

---

## PASS Items

- `(tabs)/sales.tsx` — Barcode lookup uses correct `POST /inventory/check-barcode` endpoint with `branchId`
- `(tabs)/sales.tsx` — Cash sale uses optimistic local-first flow; CREDIT sale is online-only with explicit connectivity guard
- `(tabs)/sales.tsx` — Loading state shown via `ActivityIndicator` on the barcode input and checkout buttons
- `(tabs)/sales.tsx` — Patient search debounced 300 ms; error silently handled, results cleared on short query
- `(tabs)/sales.tsx` — Loyalty points redemption done *before* sale creation; failure aborts the sale with user alert
- `(tabs)/sales.tsx` — Drug interaction / allergy pharmacovigilance check against `POST /pos/alerts` (endpoint exists)
- `(tabs)/purchases.tsx` — Calls `GET /purchases?branchId=...`; skeleton loading state; pull-to-refresh present
- `(tabs)/purchases.tsx` — Status filter chips (ALL/PENDING/RECEIVED/COMPLETED/CANCELLED) are client-side filtered, no extra round-trip
- `(tabs)/inventory.tsx` — Falls back to local SQLite via `dbService.searchProducts()` when offline
- `(tabs)/inventory.tsx` — Barcode scan returns to correct 3-path modal flow (add-batch / add-to-branch / create-quick)
- `(tabs)/inventory.tsx` — Admin vs pharmacist branch scoping: pharmacists are always locked to `authBranchId`
- `(tabs)/debts.tsx` — Calls `GET /debts?branchId=...`; error shown via `Alert.alert`; skeleton + pull-to-refresh present
- `(tabs)/debts.tsx` — Inline payment calls `POST /debts/pay` with `{ patientId, amount, note }` matching server contract
- `(tabs)/alerts.tsx` — Fetches both `GET /notifications/in-app?branchId=...` and `GET /alerts?branchId=...` in parallel
- `(tabs)/alerts.tsx` — Mark-read uses `POST /notifications/in-app` with correct body `{ ids: [...] }` / `{ all: true }`
- `(tabs)/reports.tsx` — Access-guarded: pharmacists see a lock screen; only admins proceed
- `(tabs)/reports.tsx` — Calls `GET /reports/sales?period=...&branchId=...`; skeleton loading + pull-to-refresh present
- `(tabs)/smart-orders.tsx` — Calls `GET /smart-order?branchId=...`; skeleton loading; empty state on no items
- `app/purchases/[id].tsx` — Calls `GET /purchases/:id`; loading spinner + not-found state handled
- `app/purchases/[id]/receive.tsx` — Calls `POST /purchases/:id/receive` with `{ items: [...] }`; validates batchNumber + expiryDate before submit; loading guard on submit button
- `app/checkout/payment.tsx` — Calls `POST /sales` via `apiService.createSale`; offline fallback to `dbService.saveOfflineSale` for non-DEBIT payments; DEBIT enforced online-only
- `app/accounting/expenses.tsx` — Calls `GET /accounting/expenses` via `request()` (auth-bearing); loading and empty states present
- `services/api.ts` — All `request()` calls include `Authorization: Bearer <token>` read from SecureStore
- `services/api.ts` — Retry logic: up to 3 attempts with exponential backoff (1 s / 2 s / 4 s) on network errors
- `services/api.ts` — 401 auto-logout: clears token, stops polling, navigates to `/login`; `noAutoLogout` variant prevents spurious logouts from background jobs
- `services/api.ts` — 15-second `AbortController` timeout on every fetch
- `services/sync.ts` — Sync skips if already in progress; skips if offline; uploads pending local sales then downloads inventory / debts / patients / loyalty
- `services/printer.ts` — BLE permissions requested before `init()` on Android; errors caught and logged

---

## FAIL Items

- `services/crm.ts` — **Missing auth token** on ALL three CRM endpoints (`getPatients`, `getPatient`, `createPatient`). Raw `fetch()` is used instead of `request()`, so no `Authorization` header is sent. Any server auth middleware will reject these with 401. — `apps/mobile/services/crm.ts:18,24,31` — **Severity: Critical**

- `app/crm/index.tsx` + `app/crm/[id].tsx` + `app/crm/add.tsx` — Inherits the above: patient list, patient detail, and patient creation all fail in production. `crm/index.tsx` swallows errors with only `console.error`; no user-visible error message is shown. — `apps/mobile/app/crm/index.tsx:23`, `apps/mobile/app/crm/[id].tsx:18` — **Severity: Critical**

- `services/api.ts → addToBranch()` — **Field name mismatch**: client sends `costPrice` but the server route (`add-to-branch/route.ts:46`) destructures `cost`. The cost price is silently `undefined` on the server; inventory records are created with `cost: 0` regardless of user input. — `apps/mobile/services/api.ts:356`, `apps/web/app/api/inventory/add-to-branch/route.ts:46` — **Severity: High**

- `app/(tabs)/smart-orders.tsx → handleApprove()` — **Stub / not implemented**: clicking "إنشاء طلب شراء" shows a placeholder alert (`Alert.alert('تم', 'سيتم توجيهك...')`) instead of calling `apiService.createPurchase()`. No purchase order is ever created from smart orders. — `apps/mobile/app/(tabs)/smart-orders.tsx:74` — **Severity: High**

- `app/(tabs)/sales.tsx → printReceipt()` — **Stale closure bug**: by the time the user taps "Print" on the success alert, `resetCart()` has already cleared `cart` to `[]`. `printReceipt` reads `cart` directly (not the snapshot), so the receipt always prints with zero line items. The `cartSnapshot` captured for sync is not reused here. — `apps/mobile/app/(tabs)/sales.tsx:332-339` — **Severity: High**

- `app/(tabs)/sales.tsx → processSale()` — **`branchId` missing from sale payload**: `saleData` does not include `branchId`. If the web API requires it to attribute the sale to a branch (needed for branch-scoped reporting and inventory deduction), pharmacist sales will be orphaned or rejected. — `apps/mobile/app/(tabs)/sales.tsx:260-266` — **Severity: High**

- `services/api.ts → addBatch()` TypeScript type — Declares `batchNumber: string` as **required** but `inventory.tsx` calls `addBatch` without providing it. The server auto-generates one when absent, so it does not fail at runtime, but the type contract is incorrect and will cause a TS compilation error under `strict` mode. — `apps/mobile/services/api.ts:331`, `apps/mobile/app/(tabs)/inventory.tsx:163` — **Severity: Medium**

- `services/api.ts → addToBranch()` TypeScript type — Same issue: `batchNumber: string` declared required but never passed by callers. — `apps/mobile/services/api.ts:345`, `apps/mobile/app/(tabs)/inventory.tsx:181` — **Severity: Medium**

- `app/purchases/[id]/receive.tsx` — **No loading state on mount**: `fetchDetails()` runs on mount but no spinner is shown during the fetch. Users see an empty form with no indication that data is loading. — `apps/mobile/app/purchases/[id]/receive.tsx:26-41` — **Severity: Medium**

- `services/api.ts → getLoyaltyInfo()` — Calls `GET /loyalty` (returns loyalty *settings*), same as `getLoyaltySettings()`. `sync.ts` passes this settings object to `dbService.saveLoyalty()`, which presumably expects patient account/points data. This creates a semantic mismatch that corrupts the local loyalty cache. — `apps/mobile/services/api.ts:642`, `apps/mobile/services/sync.ts:113` — **Severity: Medium**

- `app/crm/index.tsx` — **No debounce on patient search**: `handleSearch` fires `fetchPatients(text)` on every keystroke, generating a network request per character typed. — `apps/mobile/app/crm/index.tsx:31-33` — **Severity: Medium**

- `app/purchases/[id].tsx` — `item.cost` read without a defensive fallback (`?? 0`). If the server response shape changes, all line item amounts render as `undefined`. — `apps/mobile/app/purchases/[id].tsx:161` — **Severity: Low**

---

## Needs Fix

- [ ] **[Critical]** Rewrite `services/crm.ts` to use `request()` from `services/api.ts` instead of raw `fetch()`, ensuring the `Authorization` header is included on all CRM requests.
- [ ] **[Critical]** Add visible error alerts in `crm/index.tsx` and `crm/[id].tsx` when `crmService` calls throw (currently errors are swallowed with only `console.error`).
- [ ] **[High]** Fix field name mismatch in `addToBranch()`: rename `costPrice` to `cost` in the payload sent by `services/api.ts` (or rename `cost` to `costPrice` in the server route and keep both consistent).
- [ ] **[High]** Implement `handleApprove()` in `smart-orders.tsx`: call `apiService.createPurchase()` with the item's drug and suggested quantity, or navigate to the purchase-creation flow with the data pre-filled.
- [ ] **[High]** Fix stale-closure in `sales.tsx → printReceipt()`: capture the cart into a local variable before calling `resetCart()`, and pass that snapshot to `printerService.printReceipt()`.
- [ ] **[High]** Add `branchId` (from `useAuth()`) to the `saleData` object in `sales.tsx → processSale()`.
- [ ] **[Medium]** Make `batchNumber` optional (`batchNumber?: string`) in the `addBatch()` and `addToBranch()` TypeScript type signatures in `services/api.ts`.
- [ ] **[Medium]** Fix `getLoyaltyInfo()` / sync loyalty: either create a dedicated endpoint returning patient loyalty account data (points balance etc.) or remove the `saveLoyalty()` sync step since settings data is not what `dbService.saveLoyalty` expects.
- [ ] **[Medium]** Add a loading spinner to `purchases/[id]/receive.tsx` while `fetchDetails()` is in-flight on mount.
- [ ] **[Medium]** Debounce the patient search in `crm/index.tsx` by 300–500 ms to avoid one network request per keystroke.
- [ ] **[Low]** Add safe fallbacks (`?? 0`) for `item.cost` in `purchases/[id].tsx`.
