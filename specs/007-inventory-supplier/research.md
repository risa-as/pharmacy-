# Research: Supplier Selection in Inventory Management

**Feature**: 007-inventory-supplier
**Date**: 2026-03-04

---

## Decision 1: Where to Store Supplier Reference on a Batch

**Decision**: Add an optional `supplierId` field directly to the existing `Batch` model in both the web (PostgreSQL) and desktop (SQLite) schemas.

**Rationale**: The `Batch` model is the natural home — it represents a physical shipment of a specific drug. Linking it directly to a `Supplier` record is the simplest and most queryable design. The alternative (creating a separate `BatchSupplier` join table) adds complexity with no benefit for a 1:1 optional relation.

**Alternatives considered**:
- Join table `BatchSupplier` — rejected (overkill for optional 1:1 relation)
- Storing supplier name as a denormalized string — rejected (breaks referential integrity, can't filter by supplier)
- Linking supplier at `Inventory` level rather than `Batch` level — rejected (different batches can come from different suppliers)

---

## Decision 2: Desktop Offline Supplier Cache

**Decision**: Add a lightweight `Supplier` model to the desktop SQLite schema (`apps/desktop/prisma/schema.prisma`) containing only `id`, `name`, and `phone`. This table is populated/refreshed during each sync cycle from the cloud.

**Rationale**: The desktop must work fully offline (Constitution Principle II). The supplier picker needs a list to render. Storing just `id` + `name` is sufficient for a dropdown — no need for balance, address, or payment history in the local cache.

**Alternatives considered**:
- Store supplier as free-text name on desktop `Batch` — rejected (loses FK integrity on sync, can't match to cloud record)
- Require online for supplier selection — rejected (violates offline-first principle)
- Full supplier model mirror locally — rejected (unnecessary data; payments/balance are cloud-only)

---

## Decision 3: When Purchase Order Flows Through, No Manual Supplier Selection

**Decision**: When stock is received via a Purchase Order (the existing `purchases/[id]/receive` flow), the `supplierId` is automatically inherited from the purchase record. No UI change is needed for that flow — the supplier is already captured at purchase creation time.

**Rationale**: Purchase orders already store `supplierId`. Creating the batch from a purchase receive should automatically propagate this supplier ID to the batch without user input, maintaining consistency and avoiding duplicate data entry.

**Implementation**: The `POST /api/purchases/[id]/receive` route must be updated to pass the purchase's `supplierId` when creating each `Batch` record.

---

## Decision 4: Supplier List API Already Exists

**Decision**: Reuse the existing `GET /api/suppliers` endpoint which returns `{ id, name, phone }` for all suppliers. No new API endpoint is needed.

**Rationale**: The endpoint already returns the correct shape for a searchable dropdown. The mobile API service just needs a `getSuppliers()` method added that calls this endpoint.

---

## Decision 5: Supplier Field is Optional Everywhere

**Decision**: `supplierId` is `String?` (nullable) in both schemas. All forms allow submission without a supplier selected.

**Rationale**: Spec FR-003 explicitly states the field is optional. Pharmacies may receive stock from ad-hoc sources or add stock corrections without a formal supplier. Making it required would block legitimate workflows.

---

## Decision 6: Desktop Sync Strategy for Supplier Data

**Decision**: The existing desktop sync service will be extended to:
1. Pull the supplier list from `GET /api/suppliers` during each sync cycle and upsert into the local `Supplier` table.
2. When syncing a `Batch` record to the cloud, include `supplierId` in the sync payload.

**Rationale**: This follows the established sync pattern in the project. Suppliers are master data that rarely change — syncing the full list on each cycle (which is small, typically < 200 records) adds negligible overhead.

---

## Existing Codebase Findings

| Item | Finding |
|------|---------|
| `Supplier` model | Exists in web schema. Fields: id, name, email, phone, address, balance. Has relations to `Purchase[]` and `SupplierPayment[]`. |
| `Batch` model (web) | Exists. Fields: id, inventoryId, expiryDate, quantity, batchNumber, costPrice, createdAt, updatedAt. **No supplierId** — must add. |
| `Batch` model (desktop) | Exists. Identical structure to web (minus timestamps). **No supplierId** — must add. |
| `Supplier` model (desktop) | Does NOT exist. Must create lightweight cache table. |
| `GET /api/suppliers` | Exists. Returns `{ id, name, phone }` array. Suitable as-is for dropdown. |
| `POST /api/inventory/add-batch` | Exists. Does NOT accept `supplierId` — must add. |
| `POST /api/inventory/create-quick` | Exists. Does NOT accept `supplierId` — must add. |
| `POST /api/purchases/[id]/receive` | Exists. Should auto-propagate supplierId from the purchase — must update. |
| Web UI `add-batch-modal.tsx` | Exists. Needs supplier `<Select>` component added. |
| Web UI `create-drug-modal.tsx` | Exists. Needs supplier `<Select>` component added. |
| Mobile `inventory.tsx` | Has quick-create modal. Needs supplier picker (modal/bottom-sheet). |
| Desktop `InventoryPage.tsx` | Has inventory entry forms. Needs supplier dropdown. |
| Mobile `api.ts` | Needs `getSuppliers()` method. |
