# T024 — End-to-End Integration Test Guide

## Prerequisites

1. A test organization in the DB with:
   - `isSuspended = true`
   - A Plan with `price > 0` (e.g. 10,000 IQD/month)
2. `.env` populated with **Zain Cash sandbox** credentials:
   ```
   ZAINCASH_API_URL=https://test.zaincash.iq
   ZAINCASH_MERCHANT_ID=...
   ZAINCASH_MERCHANT_SECRET=...
   ZAINCASH_MSISDN=07xxxxxxxxx
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
3. Dev server running: `pnpm --filter web dev`

---

## Test Scenario A — Escape Hatch (SC-001, SC-002)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Log in as the suspended tenant's ADMIN | Redirected to `/dashboard` |
| 2 | Navigate to `/dashboard/inventory` | Suspended Overlay appears |
| 3 | Click "جدد الاشتراك" on the overlay | Navigated to `/dashboard/settings/billing` |
| 4 | Verify on `/dashboard/settings/billing` | **Overlay is ABSENT** — page content visible |
| 5 | Navigate to `/dashboard/debts` | **Overlay is ABSENT** |
| 6 | Navigate to `/dashboard/inventory` | Overlay reappears |

**Pass Criteria**: Steps 4 and 5 show no overlay; step 6 does.

---

## Test Scenario B — Full Payment Flow (SC-003 → SC-006)

| Step | Action | Expected |
|------|--------|----------|
| 1 | On `/dashboard/settings/billing`, note current `subscriptionEndsAt` | Recorded |
| 2 | Click "تجديد الاشتراك عبر زين كاش" | Button shows spinner |
| 3 | Observe redirect to Zain Cash sandbox page | URL starts with `https://test.zaincash.iq` |
| 4 | Authorize payment on the sandbox | Success screen shown by Zain Cash |
| 5 | Zain Cash redirects back to `/dashboard/settings/billing?txn_id=<uuid>` | |
| 6 | Observe green success banner | "تمّت عملية الدفع بنجاح!" visible |
| 7 | Verify `PaymentTransaction` in DB: `status = COMPLETED`, `completedAt` set | |
| 8 | Verify `Organization.isSuspended = false` | Overlay no longer appears anywhere |
| 9 | Verify `Organization.subscriptionEndsAt` = old date + 1 month | |
| 10 | Refresh billing page | Payment appears in history table with status "مكتملة" |

**Pass Criteria**: All 10 steps pass.

---

## Test Scenario C — Failed/Cancelled Payment (SC-006)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "تجديد الاشتراك عبر زين كاش" | Redirected to Zain Cash sandbox |
| 2 | Cancel the payment / choose "Back" | Redirected back with txn_id |
| 3 | Observe red failure banner | "فشلت عملية الدفع" visible |
| 4 | Verify `PaymentTransaction.status = FAILED` in DB | |
| 5 | Verify `Organization.isSuspended` unchanged | Still suspended |

---

## Test Scenario D — Idempotency (SC-005)

| Step | Action | Expected |
|------|--------|----------|
| 1 | After a COMPLETED payment, manually GET the billing page with the same `?txn_id=` | |
| 2 | Observe no duplicate DB writes (check `PaymentTransaction` row count) | Still 1 row, no error |
| 3 | Observe success banner shown (idempotent UI) | |

---

## Test Scenario E — PENDING Timeout (T022)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Manually insert a `PaymentTransaction` with `status = PENDING`, `initiatedAt = NOW() - 31 minutes` | |
| 2 | Load `/dashboard/settings/billing` | |
| 3 | Check `PaymentTransaction` in DB | `status = EXPIRED` |
| 4 | History table shows "منتهية الصلاحية" badge | |

---

## Test Scenario F — Webhook (T021)

```bash
# Simulate Zain Cash server-to-server callback
# 1. Get a PENDING txn UUID from DB
# 2. Sign a JWT payload with ZAINCASH_MERCHANT_SECRET
# 3. POST to the webhook endpoint

node -e "
const jwt = require('jsonwebtoken');
const secret = process.env.ZAINCASH_MERCHANT_SECRET;
const token = jwt.sign(
  { orderId: '<PENDING_TXN_UUID>', status: 'success', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 300 },
  secret,
  { algorithm: 'HS256' }
);
console.log(token);
"

curl -X POST http://localhost:3000/api/webhooks/zaincash \
  -H 'Content-Type: application/json' \
  -d '{"token":"<TOKEN_FROM_ABOVE>"}'
```

**Expected**: Returns `{"received":true}`, `PaymentTransaction.status = COMPLETED`, `Organization` updated.
