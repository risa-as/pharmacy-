# API Contracts: Supplier Selection in Inventory Management

**Feature**: 007-inventory-supplier
**Date**: 2026-03-04

---

## Existing Endpoints (No Change)

### GET /api/suppliers

Returns a list of all suppliers for use in dropdown pickers. Already exists and requires no changes.

**Response**:
```json
[
  { "id": "uuid", "name": "Supplier Name", "phone": "07xxxxxxxx" }
]
```

---

## Modified Endpoints

### POST /api/inventory/add-batch

**File**: `apps/web/app/api/inventory/add-batch/route.ts`

**Change**: Accept optional `supplierId` in request body. Pass to `Batch.create()`.

**Request Body (additions)**:
```json
{
  "inventoryId": "uuid",
  "batchNumber": "BN-001",
  "quantity": 100,
  "expiryDate": "2027-06-01",
  "costPrice": 5000,
  "supplierId": "uuid-or-null"   ← NEW (optional)
}
```

**Response** (unchanged shape):
```json
{
  "success": true,
  "batch": { "id": "uuid", "supplierId": "uuid-or-null", ... },
  "ack": { "status": "processed", "idempotencyKey": "..." }
}
```

---

### POST /api/inventory/create-quick

**File**: `apps/web/app/api/inventory/create-quick/route.ts`

**Change**: Accept optional `supplierId` in request body. Pass to initial `Batch.create()`.

**Request Body (additions)**:
```json
{
  "barcode": "1234567890",
  "tradeName": "Drug Name",
  "scientificName": "drug-name",
  "price": 10000,
  "costPrice": 7000,
  "quantity": 50,
  "batchNumber": "BN-001",
  "expiryDate": "2027-06-01",
  "branchId": "uuid",
  "supplierId": "uuid-or-null"   ← NEW (optional)
}
```

**Response** (unchanged shape):
```json
{
  "success": true,
  "drug": { "id": "uuid", ... },
  "inventory": { "id": "uuid", ... },
  "ack": { "status": "processed", ... }
}
```

---

### POST /api/purchases/[id]/receive

**File**: `apps/web/app/api/purchases/[id]/receive/route.ts`

**Change**: When creating `Batch` records from received items, automatically set `supplierId` from the parent `Purchase.supplierId`. No request body change needed — this is an internal propagation.

**Behaviour**: The route fetches the purchase record (which already has `supplierId`) and passes it to every `Batch.create()` call within the receive transaction.

---

## Mobile API Service Contract

**File**: `apps/mobile/services/api.ts`

**New method**:
```typescript
async getSuppliers(): Promise<Array<{ id: string; name: string; phone?: string }>>
// GET /suppliers
// Returns [] on error (non-blocking)
```

**Modified method** (`addBatch` and `createQuickDrug` — if they exist):
Both must accept an optional `supplierId?: string` parameter and include it in the request body.

---

## Desktop Sync Contract

**File**: `apps/desktop/src/services/syncService.ts` (or equivalent)

**Supplier cache sync** (new behaviour):
- On each sync cycle: `GET /api/suppliers` → upsert all records into local `Supplier` table.
- Supplier sync runs before batch sync to ensure FK integrity.

**Batch sync** (updated behaviour):
- Include `supplierId` field in the batch payload sent to the cloud during sync.
- If `supplierId` is null, send `null` (do not omit the field).
