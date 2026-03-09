# Findings: Point of Sale Flows (US5)

**Auditor**: Claude Code
**Date**: 2026-03-09

---

## PASS Items

### Web POS (`apps/web/app/lib/actions/pos-actions.ts`)

- ✅ **Loyalty EARN updates both `totalPoints` AND `lifetimePoints`** — `totalPoints: { increment: pointsEarned }` and `lifetimePoints: { increment: pointsEarned }` in a single `loyaltyAccount.update` call — `pos-actions.ts:279-283`
- ✅ **Tier recalculated from `lifetimePoints`** — `newLifetime = loyaltyAccount.lifetimePoints + pointsEarned`, thresholds 5000/20000 applied, `tier: newTier` written atomically — `pos-actions.ts:272-284`
- ✅ **`loyaltyEnabled` checked before awarding points** — both EARN (`!isCredit && settings?.loyaltyEnabled && validPatient` — line 263) and REDEEM (`settings?.loyaltyEnabled && validPatient && data.pointsRedeemed > 0` — line 238) gate on the flag
- ✅ **CREDIT sales skip loyalty EARN** — `!isCredit` guard in EARN block — `pos-actions.ts:263`
- ✅ **Inventory decremented transactionally (FEFO)** — FEFO batch loop inside `prisma.$transaction`, each batch updated via `tx.batch.update` with `decrement` — `pos-actions.ts:131-179`
- ✅ **Safe balance and transaction recorded inside the same transaction** — cash path writes `tx.transaction.create` then `tx.safe.update` — `pos-actions.ts:209-223`

### Desktop POS (`apps/desktop/electron/main.ts` — `process-sale` handler, lines 2030-2292)

- ✅ **Loyalty EARN uses `Math.floor(total × pointsPerDinar)`** — `Math.floor(total * pointsPerDinar)` — line 2236
- ✅ **CREDIT sales skip EARN** — `!isCredit` guard on the EARN block — line 2233
- ✅ **`loyaltyEnabled` checked from local `CompanySettings`** — `settings?.loyaltyEnabled` read from `tx.companySettings.findFirst()` — lines 2195-2230
- ✅ **Both `totalPoints` AND `lifetimePoints` updated on EARN** — explicit `newTotal` and `newLifetime` computed, both written with absolute values to `tx.loyaltyAccount.update` — lines 2249-2262
- ✅ **Tier recalculated from `lifetimePoints`** — thresholds 5000 (SILVER) / 20000 (GOLD) applied against `newLifetime` — lines 2251-2253
- ✅ **Loyalty account auto-created if missing** — `loyaltyAccount.create` path when account not found — lines 2243-2246
- ✅ **Inventory decremented transactionally (FEFO + parent inventory quantity)** — desktop calls `tx.inventory.update { quantity: { decrement } }` and per-batch updates inside the same transaction — lines 2101-2121
- ✅ **Drug interaction check fires reactively as items are added** — `useEffect` on `cart` debounces 500 ms and invokes `pos:check-interactions` IPC — `POSLayout.tsx:337-375`. Allergy check included for selected patient.
- ✅ **Drug interaction warnings displayed in UI** — banners rendered at `POSLayout.tsx:1278-1310`

### Mobile POS (`apps/mobile/app/(tabs)/sales.tsx`)

- ✅ **Barcode scan calls correct endpoint `/api/inventory/check-barcode`** — `apiService.getDrugByBarcode` POSTs to `/inventory/check-barcode` — `api.ts:294`
- ✅ **Cart management works** — `addToCart`, `removeFromCart`, `updateQuantity` with stock ceiling guard — `sales.tsx:174-212`
- ✅ **CREDIT sale requires patient selection** — `handleCheckout` enforces patient before allowing CREDIT, with prompt to open patient modal — `sales.tsx:230-236`
- ✅ **CREDIT sale requires online connection** — `syncService.isOnline()` check before CREDIT flow — `sales.tsx:270-275`
- ✅ **Patient search implemented** — debounced 300 ms, calls `apiService.searchPatients` → `GET /patients?query=…` — `sales.tsx:148-159`
- ✅ **Loyalty `loyaltyEnabled` checked before EARN call** — `loyaltySettings?.loyaltyEnabled && finalSnapshot > 0` guard before `earnLoyaltyPoints` — `sales.tsx:327`
- ✅ **Drug interaction + allergy check fires on every item add** — `apiService.checkPharmacovigilance` called in `addToCart` — `sales.tsx:188-194`
- ✅ **Redemption sent to server before local save** — `redeemLoyaltyPoints` awaited and failure aborts checkout — `sales.tsx:249-257`
- ✅ **Web `/api/loyalty/earn` server-side double-checks `loyaltyEnabled`** — returns 400 if disabled, applies tier multiplier (1×/1.5×/2×), updates both `totalPoints` and `lifetimePoints` — `earn/route.ts:30-73`
- ✅ **Web `/api/sales` POST is idempotency-safe** — `x-idempotency-key` checked in `syncActionLog` before processing duplicate — `sales/route.ts:63-78`

---

## FAIL Items

- ❌ **Desktop: No shift enforcement at checkout — POS processes sale without an active shift** — `handlePayment` in `POSLayout.tsx:597-620` invokes `process-sale` with no `isShiftOpen` guard. The shift state exists (`isShiftOpen` flag, line 65) but is never consulted before calling `window.ipcRenderer.invoke('process-sale', …)`. A cashier with no open shift can complete sales; cash goes untracked (the IPC handler silently skips safe recording when `activeShift` is null — `main.ts:2162-2182`). — `apps/desktop/src/components/POSLayout.tsx:597-620` / `apps/desktop/electron/main.ts:2162` — **HIGH**

- ❌ **Desktop: Drug interaction check is advisory-only, not blocking** — `pos:check-interactions` result is displayed as a banner but sale is never halted; `handlePayment` has no guard on `interactions.length > 0` for HIGH-severity cases. A pharmacist can complete a sale through a HIGH-severity drug interaction without any forced acknowledgement. — `apps/desktop/src/components/POSLayout.tsx:354-355, 597-620` — **MEDIUM**

- ❌ **Mobile: CASH sale loyalty EARN is fire-and-forget with no error handling** — `void apiService.earnLoyaltyPoints(…)` called after `resetCart()` with the result discarded. If the network call fails silently, the patient loses earned points with no retry mechanism or local record. — `apps/mobile/app/(tabs)/sales.tsx:328` — **MEDIUM**

- ❌ **Mobile: CASH sale dispatches loyalty EARN with `saleId: null`** — `earnLoyaltyPoints(patientSnapshot.id, null, finalSnapshot)` always passes `null` for `saleId`, so the `LoyaltyTransaction` row is created with no sale reference, breaking auditability. — `apps/mobile/app/(tabs)/sales.tsx:328` / `apps/web/app/api/loyalty/earn/route.ts:81` — **LOW**

- ❌ **Mobile: Points redeemed before offline save — double-debit risk on save failure** — Points are redeemed server-side (lines 249-257) before `dbService.saveOfflineSale` is called (line 300). If `saveOfflineSale` fails, the points are already deducted but the sale is not recorded locally. Background `syncData()` will not re-create the sale, leaving a points deduction with no matching sale. — `apps/mobile/app/(tabs)/sales.tsx:249-302` — **MEDIUM**

- ❌ **Mobile endpoint `POST /api/sales`: no Payment record, no safe/shift transaction recorded** — The mobile CREDIT flow calls `POST /api/sales` which updates patient balance but never creates a `Payment` record or updates safe balance. The web `pos-actions.ts` flow does create a `Payment` record; this route does not. — `apps/web/app/api/sales/route.ts:80-158` — **MEDIUM**

- ❌ **Web `pos-actions.ts`: Loyalty EARN ignores tier multiplier** — Points earned via the web POS server action are calculated as `Math.floor(data.total * settings.loyaltyPointsPerDinar)` with no tier multiplier (1×/1.5×/2×). The dedicated `/api/loyalty/earn` route correctly applies a multiplier; `pos-actions.ts` does not, giving SILVER/GOLD members fewer points than intended on web. — `apps/web/app/lib/actions/pos-actions.ts:264` — **LOW**

---

## Needs Fix

- [ ] **[HIGH] Desktop shift enforcement**: Add `if (!isShiftOpen) { alert('يجب فتح وردية قبل البيع'); return; }` at the top of `handlePayment` in `POSLayout.tsx`. The IPC handler already safely handles a missing shift (skips safe update) but the UI must block the attempt entirely.
- [ ] **[MEDIUM] Desktop HIGH-severity interaction blocker**: Before calling `process-sale` in `handlePayment`, check `if (interactions.some(i => i.severity === 'HIGH'))` and require explicit `window.confirm` acknowledgement before proceeding.
- [ ] **[MEDIUM] Mobile loyalty EARN resilience**: Replace the fire-and-forget `void apiService.earnLoyaltyPoints(…)` with a queued retry mechanism (e.g., persist a pending-earn record in SQLite via `dbService` and retry on next successful sync).
- [ ] **[MEDIUM] Mobile loyalty EARN + REDEEM atomicity**: Restructure CASH checkout so that redemption and inventory save are either committed together or fully rolled back. Consider moving redemption deduction inside the server-side `POST /api/sales` body rather than as a separate prior request.
- [ ] **[MEDIUM] Mobile `POST /api/sales` endpoint**: Add `Payment` record creation and safe balance update inside the transaction, matching the behaviour of `pos-actions.ts`. Also respect `paymentMethod` for CREDIT validation.
- [ ] **[LOW] Mobile earnLoyaltyPoints saleId**: Pass the actual `saleId` returned from `createSale` or `saveOfflineSale` into the `earnLoyaltyPoints` call.
- [ ] **[LOW] Web pos-actions.ts tier multiplier**: Apply tier multiplier (1×/1.5×/2×) to `pointsEarned` calculation in `processWebSale`, consistent with `/api/loyalty/earn/route.ts`.
