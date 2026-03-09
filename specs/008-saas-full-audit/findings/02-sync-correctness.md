# Findings: Sync Pipeline Correctness (US2)

**Auditor**: Claude Code
**Date**: 2026-03-09
**Severity Scale**: Critical > High > Medium > Low

---

## Sync Route Inventory

| Route | Method | Auth Present | branchId Validated | Idempotency | Status |
|-------|--------|-------------|-------------------|-------------|--------|
| /api/sync/sales | POST | YES (auth()) | YES — role-aware check against DB | ID check (findUnique before create) | ✅ PASS |
| /api/sync/loyalty | POST | YES (auth()) | YES — role-aware check against DB | ID check (findUnique before create) | ✅ PASS |
| /api/sync/patients | GET | YES (auth()) | YES — role-aware check against DB | N/A (read-only) | ✅ PASS |
| /api/sync/shifts | POST | YES (auth()) | YES — role-aware check against DB | ID check + SyncActionLog idempotency key | ✅ PASS |
| /api/sync/returns | POST | YES (auth()) | YES — role-aware check against DB | ID check (findUnique before create) | ✅ PASS |
| /api/sync/debt-payments | GET | YES (auth()) | YES — validateBranchAccess helper | N/A (read-only) | ✅ PASS |
| /api/sync/debt-payments | POST | YES (auth()) | YES — validateBranchAccess helper | ID check (findUnique before create) | ✅ PASS |
| /api/sync/transactions | POST | YES (auth()) | YES — role-aware check against DB | ID check + SyncActionLog idempotency key | ✅ PASS |
| /api/sync/notifications | GET | YES (auth()) | N/A — filtered by session.user.id | N/A (read-only) | ✅ PASS |
| /api/sync/products | GET | **NO** — no auth() call | **NO** — branchId accepted without ownership check | N/A (read-only) | ❌ FAIL |
| /api/sync/users | GET | **NO** — no auth() call | **NO** — branchId accepted without ownership check | N/A (read-only) | ❌ FAIL |
| /api/sync/settings | GET | **NO** — no auth() call | **NO** — branchId accepted without ownership check | N/A (read-only) | ❌ FAIL |
| /api/sync/offline-token | GET | **NO** — uses licenseKey + branchId instead of auth() | Partial — validated via DeviceLicense DB lookup | N/A (token issuance) | ⚠️ WARN |

---

## PASS Items

- ✅ **sales auth** — `auth()` called at line 39; 401 returned if no session. Role-aware branchId ownership check at lines 57-64.
- ✅ **sales idempotency** — `tx.sale.findUnique({ where: { id: sale.id } })` at line 79; returns early if already exists.
- ✅ **sales inventory deduction** — FIFO deduction from batches by `expiryDate asc` (lines 94-113). Correct decrement via `{ decrement: deduction }`.
- ✅ **sales credit balance update** — `patient.balance` incremented by `total - discount` for CREDIT payment method (line 196).
- ✅ **sales patient FK guard** — patient snapshot upserted before sale FK reference (lines 134-165); P2002 unique collision handled with phone+branchId fallback.
- ✅ **sales partial failure isolation** — each sale processed in its own `prisma.$transaction`; failure of one does not block others (lines 76-207).
- ✅ **loyalty auth** — `auth()` called at line 26; branchId ownership validated at lines 51-58.
- ✅ **loyalty idempotency** — `findUnique({ where: { id: txData.id } })` at line 107; skips duplicate transactions.
- ✅ **loyalty disabled acknowledgement** — when `loyaltyEnabled=false`, all transaction IDs returned as syncedIds so desktop stops retrying (lines 63-72).
- ✅ **loyalty tier recalculation** — tier promoted from BRONZE→SILVER→GOLD based on lifetimePoints thresholds after each EARN (lines 152-161).
- ✅ **loyalty accountBalances returned** — server sends back authoritative balances after sync (lines 173-184), enabling desktop reconciliation.
- ✅ **patients auth** — `auth()` called at line 10; ownership validated at lines 24-41.
- ✅ **patients branchId filter** — query uses `OR: [{ branchId }, { branchId: null }]` to include shared (null-branch) patients (line 46).
- ✅ **shifts auth** — `auth()` called at line 33; branchId ownership validated at lines 56-64.
- ✅ **shifts idempotency** — x-idempotency-key header required (400 if missing); SyncActionLog upsert records processed state; ID check before insert (lines 38-41, 81-115).
- ✅ **shifts update on re-sync** — if shift already exists it is updated rather than skipped (lines 84-95), allowing status transitions (OPEN→CLOSED).
- ✅ **returns auth** — `auth()` called at line 30; branchId ownership validated at lines 49-57.
- ✅ **returns idempotency** — `tx.saleReturn.findUnique({ where: { id: ret.id } })` at line 63; returns early if exists.
- ✅ **returns inventory restoration** — returned quantities re-added to most recent batch (`expiryDate desc`) (lines 87-103).
- ✅ **returns credit balance restoration** — for CREDIT original sales, `patient.balance` decremented by `ret.total` (lines 107-116).
- ✅ **debt-payments auth (GET+POST)** — `auth()` called in both handlers; `validateBranchAccess` helper reused.
- ✅ **debt-payments sale ownership check** — POST verifies `sale.branchId === branchId` before creating payment (line 121).
- ✅ **debt-payments idempotency** — `findUnique({ where: { id: payment.id } })` at line 124; skips if already exists.
- ✅ **debt-payments balance decrement** — `patient.balance` decremented inside transaction (line 144).
- ✅ **transactions auth** — `auth()` called at line 30; branchId ownership validated at lines 52-61.
- ✅ **transactions idempotency** — x-idempotency-key required; SyncActionLog records processed state; ID check per transaction (lines 78-81).
- ✅ **transactions safe balance update** — safe.balance updated via `+= amount` for IN, `-= amount` for OUT (lines 102-108). No double-update risk because ID check skips existing records.
- ✅ **notifications auth** — `auth()` called at line 20; query scoped to `session.user.id` (line 35).
- ✅ **offline-token license validation** — `DeviceLicense` looked up by `branchId + licenseKey + isActive` (lines 34-45); 403 if invalid. Using licenseKey as a machine credential instead of session auth is intentional for the desktop use case.

### Desktop sync.ts: PASS Items

- ✅ **syncSettings sends branchId** — URL built as `/sync/settings?branchId=${encodeURIComponent(branchId)}` (line 1401); falls back to no param only when branchId is missing.
- ✅ **syncSettings runs every 2 minutes** — `setInterval(syncSettings, 2 * 60 * 1000)` at line 1535.
- ✅ **syncLoyalty applies accountBalances** — server response `accountBalances` iterated at lines 891-907; local `loyaltyAccount` updated with authoritative `totalPoints`, `lifetimePoints`, `tier`.
- ✅ **syncSales marks records synced** — after POST succeeds, `prisma.sale.updateMany({ where: { id: { in: syncedIds } }, data: { synced: true } })` at lines 245-248.
- ✅ **syncSales DLQ on permanent client error** — 4xx errors park failed sales into `SyncFailure` table and mark `synced: true` to unblock retry loop (lines 264-278).
- ✅ **checkConnection sets wasOffline and triggers sync on reconnect** — `wasOffline` flag initialized `true` (line 74); on reconnect `justReconnected` captures previous state and triggers `syncSettings()` immediately (lines 113-122).
- ✅ **syncLoyalty marks transactions synced** — `prisma.loyaltyTransaction.updateMany({ data: { synced: true } })` at lines 881-884.
- ✅ **syncDebtPayments pull phase** — debt payments pulled from cloud and applied locally, with patient balance decrement and FK guard against missing local sale (lines 346-401).
- ✅ **syncProducts full snapshot with stale cleanup** — orphaned local inventories and batches deleted after snapshot sync (lines 1139-1188).

---

## FAIL Items

- ❌ **`/api/sync/products` — No authentication** — Route has no `auth()` call and no session check. Any client with knowledge of a valid `branchId` can retrieve the full inventory snapshot (drug catalog, prices, batch quantities, cost prices) without credentials. — `apps/web/app/api/sync/products/route.ts:6-61` — **Severity: Critical**

- ❌ **`/api/sync/users` — No authentication AND password hash exposure** — Route has no `auth()` call. Any unauthenticated request with a valid `branchId` receives a list of users including their `password` field (hashed or plaintext per the comment on line 21). This combines an auth bypass with sensitive credential leakage. — `apps/web/app/api/sync/users/route.ts:6-31` — **Severity: Critical**

- ❌ **`/api/sync/settings` — No authentication** — Route has no `auth()` call. Organization loyalty settings (points per dinar, redemption values) are publicly readable given any `branchId`. — `apps/web/app/api/sync/settings/route.ts:6-49` — **Severity: High**

- ❌ **`/api/sync/products` — No branchId ownership validation** — Even if auth were added, the current code performs no ownership check: any authenticated user from org A can request the inventory snapshot of org B's branch by supplying org B's `branchId`. — `apps/web/app/api/sync/products/route.ts:9-13` — **Severity: High**

- ❌ **`/api/sync/users` — No branchId ownership validation** — Same cross-tenant issue: an authenticated user from org A could retrieve users (with passwords) from org B's branch. — `apps/web/app/api/sync/users/route.ts:9-13` — **Severity: High**

- ❌ **`/api/sync/settings` — No branchId ownership validation** — An authenticated user from any org can read another org's settings by supplying an arbitrary `branchId`. — `apps/web/app/api/sync/settings/route.ts:9-12` — **Severity: Medium**

- ❌ **`/api/sync/transactions` — Safe balance race condition on duplicate key bypass** — The SyncActionLog idempotency check at lines 64-75 only returns early on a previously processed log. However, if the log does not yet exist (first attempt), individual transactions inside the Prisma `$transaction` are guarded only by ID check and `continue`. If two concurrent requests reach the batch loop simultaneously before the SyncActionLog upsert commits, a transaction record could be processed twice, double-counting the safe balance. The outer transaction mitigates this partially but does not hold a row lock before the ID check. — `apps/web/app/api/sync/transactions/route.ts:76-122` — **Severity: Medium**

- ❌ **`/api/sync/sales` — Inventory not updated on cloud** — The sale sync correctly performs FIFO batch deduction on the cloud database. However, it does **not** update the `inventory.quantity` aggregate field on the `Inventory` record — only individual `Batch.quantity` values are decremented. If any code on the web app reads `inventory.quantity` directly (rather than summing batches), it will show stale stock counts. — `apps/web/app/api/sync/sales/route.ts:89-130` — **Severity: Medium**

- ❌ **`/api/sync/returns` — Inventory restoration targets `quantity >= 0` batches only, skipping fully-depleted batches** — The batch query filter is `where: { quantity: { gte: 0 } }` (line 93), which includes zero-quantity batches. This is correct behaviour but the ordering is `expiryDate: 'desc'` — the most recently expiring batch gets the returned stock. This differs from the FIFO deduction order used in sales (`expiryDate: 'asc'`). The asymmetry means returned stock accumulates in a different batch than the one from which it was deducted, which can create batch-level quantity inconsistencies for FIFO cost reporting. — `apps/web/app/api/sync/returns/route.ts:89-103` — **Severity: Low**

- ❌ **`desktop/sync.ts syncUsers` — Does not use `fetchWithRetry`** — `syncUsers` calls `fetch(...)` directly at line 1223 instead of `fetchWithRetry(...)`. This means user sync has no retry logic or 15-second abort timeout, making it more vulnerable to transient network errors and hangs. All other sync functions use `fetchWithRetry`. — `apps/desktop/electron/sync.ts:1223` — **Severity: Low**

- ❌ **`desktop/sync.ts syncPatients` — Deletes all local patients if cloud returns 0 records** — When `cloudIds` is an empty array, `deleteWhere` becomes `{}` (line 1376), causing `tx.patient.deleteMany({ where: {} })` which deletes every local patient record. This is a destructive data-loss scenario if the sync/patients API returns an empty array due to a transient server error or misconfiguration. — `apps/desktop/electron/sync.ts:1376-1380` — **Severity: High**

- ❌ **`desktop/sync.ts syncPatients` — Nullifies all patientId FKs on sales if cloud returns 0 records** — The same empty-cloudIds condition at line 1354 causes `sale.updateMany` to nullify `patientId` on every local sale that has a patient, because `{ notIn: [] }` matches all records. Combined with the patient deletion above, a transient empty response destroys the patient-sale relationship for all historical records. — `apps/desktop/electron/sync.ts:1350-1358` — **Severity: High**

- ❌ **`desktop/sync.ts syncProducts` — Deletes all local inventory if cloud returns empty drug list** — The else branch at line 1176 (when `fetchedDrugIds.length === 0`) queries all branch inventories with no filter and deletes them all. An empty-response API failure would wipe local inventory entirely. — `apps/desktop/electron/sync.ts:1176-1189` — **Severity: High**

---

## Needs Fix

- [ ] Add `auth()` + branchId ownership validation to `/api/sync/products` — treat same as the pattern used in `/api/sync/patients` (role-aware SUPER_ADMIN/ADMIN/USER check).
- [ ] Add `auth()` + branchId ownership validation to `/api/sync/users` — and audit whether `password` should ever be included in the sync payload; if plaintext passwords can be stored, this is a separate critical issue.
- [ ] Add `auth()` to `/api/sync/settings` and add branchId ownership validation.
- [ ] Guard `syncPatients` against empty cloud response before performing deletes: `if (cloudIds.length === 0) { console.warn(...); return; }` — never delete all patients on an empty payload.
- [ ] Guard `syncPatients` sale FK nullification: skip `updateMany` when `cloudIds.length === 0`.
- [ ] Guard `syncProducts` against empty drug list before stale-inventory deletion: skip the delete-all path when `fetchedDrugIds.length === 0` and `fetchedInventoryIds.length === 0`.
- [ ] Replace bare `fetch(...)` in `syncUsers` with `fetchWithRetry(...)` for consistency and resilience.
- [ ] Consider adding `SELECT ... FOR UPDATE` or Prisma's `$executeRaw` advisory lock on the SyncActionLog row for the transactions endpoint to eliminate the safe-balance double-update race window.
- [ ] Investigate whether `inventory.quantity` aggregate column is kept in sync with batch sum — if yes, document the source of truth; if no, either keep it updated in the sales sync or remove it from the schema to avoid confusion.
- [ ] Document (or align) the return-to-LIFO vs. sell-from-FIFO batch ordering discrepancy in returns sync.
