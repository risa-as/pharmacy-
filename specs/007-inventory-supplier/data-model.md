# Data Model: Supplier Selection in Inventory Management

**Feature**: 007-inventory-supplier
**Date**: 2026-03-04

---

## Changes to Existing Entities

### Batch (Web — PostgreSQL)

**File**: `apps/web/prisma/schema.prisma`

**Change**: Add optional `supplierId` field and `supplier` relation.

```
model Batch {
  id             String     @id @default(uuid())
  inventoryId    String
  expiryDate     DateTime
  quantity       Int
  batchNumber    String
  costPrice      Float      @default(0)
  supplierId     String?                          ← NEW
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  inventory      Inventory  @relation(...)
  supplier       Supplier?  @relation(...)        ← NEW
  stocktakeItems StocktakeItem[]
}
```

### Supplier (Web — PostgreSQL)

**File**: `apps/web/prisma/schema.prisma`

**Change**: Add back-relation `batches Batch[]`.

```
model Supplier {
  id        String            @id @default(uuid())
  name      String
  email     String?
  phone     String?
  address   String?
  balance   Float             @default(0)
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
  purchases Purchase[]
  payments  SupplierPayment[]
  batches   Batch[]                               ← NEW
}
```

---

## New Entity

### Supplier (Desktop — SQLite)

**File**: `apps/desktop/prisma/schema.prisma`

**Rationale**: Lightweight local cache for offline supplier picker. Populated/refreshed from cloud on each sync. No balance, no payment history (cloud-only concerns).

```
model Supplier {
  id      String  @id
  name    String
  phone   String?
  batches Batch[]
}
```

---

### Batch (Desktop — SQLite)

**File**: `apps/desktop/prisma/schema.prisma`

**Change**: Add optional `supplierId` field and `supplier` relation. Mirrors the web schema field for sync consistency.

```
model Batch {
  id          String    @id @default(uuid())
  inventoryId String
  inventory   Inventory @relation(...)
  batchNumber String
  expiryDate  DateTime
  quantity    Int
  costPrice   Float     @default(0)
  supplierId  String?                             ← NEW
  supplier    Supplier? @relation(...)            ← NEW
  stocktakeItems StocktakeItem[]
}
```

---

## Sync Mapping

| Cloud Field | Desktop Field | Notes |
|-------------|---------------|-------|
| `Batch.supplierId` | `Batch.supplierId` | Synced as-is. Null if no supplier selected. |
| `Supplier.id` | `Supplier.id` | Cloud-assigned UUID; desktop uses same ID. |
| `Supplier.name` | `Supplier.name` | Synced from cloud on each cycle. |
| `Supplier.phone` | `Supplier.phone` | Synced from cloud. |
| `Supplier.email`, `address`, `balance` | (not stored locally) | Cloud-only fields — not needed for dropdown. |

---

## Migrations Required

1. **Web**: `prisma migrate dev` in `apps/web` to add `Batch.supplierId` and `Supplier.batches` back-relation.
2. **Desktop**: `prisma migrate dev` in `apps/desktop` to add `Supplier` table and `Batch.supplierId`.

Both migrations are **[SYNC-IMPACT]** items per Constitution Principle V.

---

## Validation Rules

- `supplierId` is always **optional** (nullable) in both schemas.
- No cascade delete: if a `Supplier` is deleted, existing `Batch.supplierId` values are set to `NULL` (on delete: `SetNull`).
- Desktop `Supplier` table is read-only from the app's perspective — it is only written by the sync service, never by the user.
