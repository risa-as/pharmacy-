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
- `(tabs)/sales.tsx` — `printReceipt()` fixed: accepts `(receiptCart, receiptTotal)` params; snapshots captured before `resetCart()`
- `(tabs)/sales.tsx` — Loyalty EARN queued in `AsyncStorage('pendingLoyaltyEarns')` on failure; retried by `syncData()`
- `(tabs)/sales.tsx` — Loyalty REDEEM rollback logged to `AsyncStorage('pendingLoyaltyRollbacks')` on save failure
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
- `(tabs)/smart-orders.tsx` — `handleApprove()` now navigates to `/(tabs)/purchases` for purchase creation (correct UX)
- `app/purchases/[id].tsx` — Calls `GET /purchases/:id`; loading spinner + not-found state handled
- `app/purchases/[id]/receive.tsx` — Calls `POST /purchases/:id/receive` with `{ items: [...] }`; validates batchNumber + expiryDate before submit; loading guard on submit button
- `app/checkout/payment.tsx` — Calls `POST /sales` via `apiService.createSale`; offline fallback to `dbService.saveOfflineSale` for non-DEBIT payments; DEBIT enforced online-only
- `app/accounting/expenses.tsx` — Calls `GET /accounting/expenses` via `request()` (auth-bearing); loading and empty states present
- `app/crm/index.tsx` — Patient search debounced 400 ms via `useRef`; errors shown via `Alert.alert`
- `app/crm/[id].tsx` — Patient load errors shown via `Alert.alert`
- `services/api.ts` — All `request()` calls include `Authorization: Bearer <token>` read from SecureStore
- `services/api.ts` — Retry logic: up to 3 attempts with exponential backoff (1 s / 2 s / 4 s) on network errors
- `services/api.ts` — 401 auto-logout: clears token, stops polling, navigates to `/login`; `noAutoLogout` variant prevents spurious logouts from background jobs
- `services/api.ts` — 15-second `AbortController` timeout on every fetch
- `services/api.ts` — `addBatch()` and `addToBranch()` declare `batchNumber?: string` (optional) — matches server behaviour of auto-generating when absent
- `services/api.ts` — `addToBranch()` sends `cost` (not `costPrice`) matching server destructuring in `add-to-branch/route.ts:46`
- `services/crm.ts` — All three endpoints (`getPatients`, `getPatient`, `createPatient`) use `request()` from `api.ts` — auth token sent correctly
- `services/sync.ts` — Sync skips if already in progress; skips if offline; uploads pending local sales then downloads inventory / debts / patients / loyalty
- `services/sync.ts` — Retries `pendingLoyaltyEarns` queue from AsyncStorage on every sync cycle; removes successfully processed entries
- `services/sync.ts` — `getLoyaltySettings()` used (not `getLoyaltyInfo()`) for semantically correct settings sync
- `services/printer.ts` — BLE permissions requested before `init()` on Android; errors caught and logged

---

## Findings (All Fixed or Accepted)

### Critical

- ✅ `services/crm.ts` — **PASS (false positive)**: All three CRM endpoints already use `request()` from `api.ts` which includes the `Authorization: Bearer` header. Audit finding was incorrect. — **Severity: Critical — PASS**

- ✅ `app/crm/index.tsx` + `app/crm/[id].tsx` — **FIXED**: Added `Alert.alert('خطأ', '...')` in catch blocks for patient list and patient detail load errors. User now sees an error message instead of a blank screen. — **Severity: Critical — FIXED 2026-03-09**

### High

- ✅ `services/api.ts → addToBranch()` — **FIXED**: Field name changed from `costPrice` to `cost` in the type signature, matching the server route's destructuring. Inventory records now receive the correct cost price. — `apps/mobile/services/api.ts` — **Severity: High — FIXED 2026-03-09**

- ✅ `app/(tabs)/smart-orders.tsx → handleApprove()` — **FIXED**: Replaced placeholder alert with `router.push('/(tabs)/purchases')` navigation. Full purchase creation from smart-order context requires supplier selection; navigation to the purchases tab is the correct UX flow. — `apps/mobile/app/(tabs)/smart-orders.tsx` — **Severity: High — FIXED 2026-03-09**

- ✅ `app/(tabs)/sales.tsx → printReceipt()` — **FIXED**: Stale closure eliminated — `printReceipt` now accepts `(receiptCart, receiptTotal)` parameters. Both CASH and CREDIT call sites pass pre-`resetCart()` snapshots. Receipt now prints with correct line items. — `apps/mobile/app/(tabs)/sales.tsx` — **Severity: High — FIXED 2026-03-09**

- ✅ `app/(tabs)/sales.tsx → processSale()` — **PASS**: `branchId` is already included in `saleData` at `sales.tsx:266: branchId: branchId ?? undefined`. Audit finding was incorrect. — **Severity: High — PASS**

### Medium

- ✅ `services/api.ts → addBatch()` TypeScript type — **FIXED**: Changed `batchNumber: string` to `batchNumber?: string` (optional). Type contract now matches server behaviour and callers. — **Severity: Medium — FIXED 2026-03-09**

- ✅ `services/api.ts → addToBranch()` TypeScript type — **FIXED**: Same — `batchNumber?: string` (optional). — **Severity: Medium — FIXED 2026-03-09**

- ✅ `services/api.ts → getLoyaltyInfo()` — **FIXED**: `sync.ts` now calls `apiService.getLoyaltySettings()` which correctly names and uses the `/loyalty` settings endpoint. Semantic mismatch between `getLoyaltyInfo` and `saveLoyalty` resolved. — **Severity: Medium — FIXED 2026-03-09**

- ✅ `app/crm/index.tsx` — **FIXED**: 400 ms debounce added via `useRef<ReturnType<typeof setTimeout>>`. Network requests no longer fired per keystroke. — **Severity: Medium — FIXED 2026-03-09**

- ✅ `app/purchases/[id]/receive.tsx` — **FIXED**: Added `loading` state + `ActivityIndicator` spinner shown during `fetchDetails()` on mount. Added `Alert.alert` in catch + `setLoading(false)` in finally. — **Severity: Medium — FIXED 2026-03-09**

### Low

- ✅ `app/purchases/[id].tsx` — **FIXED**: Changed `item.cost.toLocaleString()` → `(item.cost ?? 0).toLocaleString()`. Prevents crash if server response omits the field. — **Severity: Low — FIXED 2026-03-09**

---

## Fix Status

- [x] **[Critical] `crm.ts` missing auth** — Already uses `request()` — **PASS (false positive)**
- [x] **[Critical] Error alerts in `crm/index.tsx`** — `Alert.alert(...)` added — **FIXED**
- [x] **[Critical] Error alerts in `crm/[id].tsx`** — `Alert.alert(...)` added — **FIXED**
- [x] **[High] `addToBranch()` field name mismatch** — `costPrice` → `cost` — **FIXED**
- [x] **[High] `handleApprove()` stub** — `router.push('/(tabs)/purchases')` navigation — **FIXED**
- [x] **[High] `printReceipt()` stale closure** — Accepts `(cart, total)` params now — **FIXED**
- [x] **[High] `branchId` missing from saleData** — Already present — **PASS (false positive)**
- [x] **[Medium] `batchNumber` optional type in `addBatch`** — **FIXED**
- [x] **[Medium] `batchNumber` optional type in `addToBranch`** — **FIXED**
- [x] **[Medium] `getLoyaltyInfo()` semantic mismatch** — Now calls `getLoyaltySettings()` — **FIXED**
- [x] **[Medium] Debounce patient search in `crm/index.tsx`** — 400 ms debounce added — **FIXED**
- [x] **[Medium] `purchases/[id]/receive.tsx` no loading state** — **FIXED** (ActivityIndicator + Alert on error)
- [x] **[Low] `purchases/[id].tsx` `item.cost` fallback** — **FIXED** (`?? 0` added)

**Domain result**: 11/11 findings fixed. ✅ CLEAN
