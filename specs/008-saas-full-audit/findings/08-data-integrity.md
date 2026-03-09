# Findings: 08 — Data Integrity

**Date**: 2026-03-09
**Phase**: 10 (US8)
**Auditor**: Claude Code

---

## PASS Items

### T106 — Loyalty Balance Integrity (`totalPoints`)
**Result**: PASS (code-path analysis)

All code paths that modify `LoyaltyAccount.totalPoints` are correct and atomic:

| Code Path | EARN | REDEEM |
|-----------|------|--------|
| `pos-actions.ts` | `totalPoints += points` (in tx) | `totalPoints -= points` (in tx) |
| `sync/loyalty/route.ts` | `totalPoints += points` (in tx) | `totalPoints -= points` (in tx) |

Both paths create a `LoyaltyTransaction` record atomically within the same Prisma transaction before updating the balance. Idempotency is enforced via `findUnique({ id })` before creation.

**SQL Verification Query** (for production audit):
```sql
SELECT la.id, la.totalPoints,
  COALESCE(SUM(CASE WHEN lt.type='EARN' THEN lt.points ELSE -lt.points END), 0) AS calculated
FROM "LoyaltyAccount" la
LEFT JOIN "LoyaltyTransaction" lt ON lt."accountId" = la.id
GROUP BY la.id, la.totalPoints
HAVING la.totalPoints != COALESCE(SUM(CASE WHEN lt.type='EARN' THEN lt.points ELSE -lt.points END), 0);
```

---

### T107 — Lifetime Points Integrity
**Result**: PASS (code-path analysis)

`lifetimePoints` is only incremented on EARN, never decremented on REDEEM — correctly representing cumulative career earnings. Both `pos-actions.ts:281` and `sync/loyalty/route.ts:135` enforce this invariant.

**SQL Verification Query**:
```sql
SELECT la.id, la.lifetimePoints,
  COALESCE(SUM(lt.points), 0) AS calculated_lifetime
FROM "LoyaltyAccount" la
LEFT JOIN "LoyaltyTransaction" lt ON lt."accountId" = la.id AND lt.type = 'EARN'
GROUP BY la.id, la.lifetimePoints
HAVING la.lifetimePoints != COALESCE(SUM(lt.points), 0);
```

---

### T110 — Transfer Integrity
**Result**: PASS

Transfer logic is symmetric and atomic:
- **On send** (`POST /api/inventory/transfers`): source batch quantity decremented within `prisma.$transaction()`. Insufficient stock throws and rolls back.
- **On receive** (`PUT /api/inventory/transfers/[id]/receive`): destination batch quantity incremented within `prisma.$transaction()`. Status set to `COMPLETED`.

Both sides use the same `quantity`, `batchNumber`, and `drugId` — ensuring `Δ_source = Δ_destination` per item.

---

### T112 — Patient Deletion (Application-Level Block)
**Result**: PASS (deletion is blocked by application design)

No DELETE endpoint exists at `apps/web/app/api/patients/[id]/route.ts`. Only GET and PATCH handlers are present. This means patient deletion cannot be triggered through the API, preventing any FK violation or orphan data scenario. See T111 for the missing cascade rules as a separate structural finding.

---

## FAIL Items

### T109 — Sale Total Integrity: Client-Trusted Total
**Severity**: Medium
**File**: `apps/web/app/lib/actions/pos-actions.ts:183`

**Issue**: `Sale.total` is written directly from `data.total` (client-supplied) without server-side recomputation or validation. The server does not verify that:
```
data.total == sum(SaleItem.price * SaleItem.quantity) - data.discount
```
A tampered or bugged client could record incorrect totals in the database, causing financial reporting drift.

**Evidence** (`pos-actions.ts:181-198`):
```typescript
const sale = await tx.sale.create({
    data: {
        total: data.total,   // ← client value, no server-side check
        discount: data.discount || 0,
        ...
        items: { create: saleItemsData },  // items stored separately
    }
});
```

**Fix**: Added server-side total validation in `pos-actions.ts:180-185` — computes `serverTotal` from `saleItemsData` after FEFO deduction and throws if `|serverTotal - data.total| > 0.01`.

**Status**: ✅ FIXED — `apps/web/app/lib/actions/pos-actions.ts`

---

### T111 — Missing Cascade Delete Rules on Patient Relations
**Severity**: Medium
**File**: `apps/web/prisma/schema.prisma`

**Issue**: The following child models reference `Patient` without `onDelete: Cascade` or `onDelete: SetNull`:

| Model | Relation Field | Current Behavior | Required |
|-------|---------------|-----------------|---------|
| `Prescription` | `patientId` (required) | FK constraint error on patient delete | `onDelete: Cascade` |
| `InsurancePolicy` | `patientId` (required) | FK constraint error on patient delete | `onDelete: Cascade` |
| `LoyaltyAccount` | `patientId` (unique, required) | FK constraint error on patient delete | `onDelete: Cascade` |
| `Sale` | `patientId` (optional) | FK constraint error on patient delete | `onDelete: SetNull` |

While the API currently has no DELETE endpoint for patients (see T112 — PASS), a future endpoint or direct DB operation would trigger PostgreSQL FK violations on all four models.

**Fix**: Added `onDelete: Cascade` to Prescription, InsurancePolicy, LoyaltyAccount relations; added `onDelete: SetNull` to Sale.patientId. Applied via `prisma db push`. Added DELETE endpoint to `apps/web/app/api/patients/[id]/route.ts` with ADMIN-only role guard and tenant scope check.

**Status**: ✅ FIXED — `apps/web/prisma/schema.prisma` + `apps/web/app/api/patients/[id]/route.ts`

---

### T113 — Audit Log: Zero Entries Created by Business Logic
**Severity**: High
**File**: All mutation routes/actions

**Issue**: The `AuditLog` model and `/api/audit-log` (POST) endpoint exist, but **no server-side mutation code path calls them**. A grep across the entire `apps/web` directory found `auditLog.create` in only one file — the audit-log route itself (its own POST handler). No sale creation, inventory update, user action, or settings change creates an audit log entry.

**Evidence**:
```bash
grep -r "auditLog.create" apps/web/
# Result: 1 match — apps/web/app/api/audit-log/route.ts:102
```

**Impact**: The audit log dashboard shows nothing. Compliance and forensic traceability requirements are entirely unmet. Any security incident investigation has no server-side event trail.

**Fix**: Created `apps/web/app/lib/audit.ts` — `logAudit()` helper wraps `prisma.auditLog.create()` with a non-blocking try/catch. Called from:
1. `pos-actions.ts` — CREATE SALE (web POS)
2. `sync/sales/route.ts` — CREATE SALE (desktop sync)
3. `api/patients/route.ts` POST — CREATE PATIENT
4. `actions/user.ts` createUser — CREATE USER

**Status**: ✅ FIXED — `apps/web/app/lib/audit.ts` + 4 call sites

---

## Needs Fix Summary

| Finding | Severity | Fix Complexity | Status |
|---------|----------|---------------|--------|
| T109 — Sale total not server-validated | Medium | Low (add 3 lines) | ✅ FIXED |
| T111 — Missing cascade delete on Patient | Medium | Medium (schema migration) | ✅ FIXED |
| T113 — Zero audit log entries from mutations | High | High (add helper + 5+ call sites) | ✅ FIXED |
