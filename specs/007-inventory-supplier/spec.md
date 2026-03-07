# Feature Specification: Supplier Selection in Inventory Management

**Feature Branch**: `007-inventory-supplier`
**Created**: 2026-03-04
**Status**: Draft
**Input**: User description: "Add supplier selection field to inventory management pages across all three apps (web, mobile, desktop). When adding stock to inventory or adding a new drug, users should be able to select/assign a supplier (مورد). This should be implemented consistently across the web app, mobile app, and desktop app."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select Supplier When Adding Stock Batch (Priority: P1)

A pharmacist or inventory manager opens the "Add Stock" form (add-batch) for an existing drug and sees a supplier dropdown. They can pick the supplier that delivered this shipment before saving. The batch is recorded with that supplier linked to it.

**Why this priority**: This is the most common stock entry workflow. Without this, the system cannot trace which supplier provided a given batch, making audits, quality control, and return-to-supplier workflows impossible.

**Independent Test**: Open the Add Stock Batch form on any of the three apps, select a supplier from the dropdown, complete the form, then verify the saved batch displays the associated supplier name in the batch history.

**Acceptance Scenarios**:

1. **Given** the Add Stock form is open, **When** the user taps/clicks the supplier field, **Then** a searchable list of all active suppliers is displayed.
2. **Given** a supplier is selected and the form is submitted, **Then** the saved batch record is associated with that supplier.
3. **Given** no supplier is selected, **When** the form is submitted, **Then** the batch is saved without a supplier (supplier is optional, not required).
4. **Given** there are no suppliers registered in the system, **When** the user opens the supplier field, **Then** an inline message indicates that no suppliers exist yet, with a link/prompt to create one.

---

### User Story 2 - Select Supplier When Quickly Creating a New Drug (Priority: P2)

A pharmacist scans a new barcode that doesn't exist yet and a "Create New Drug" form opens. In addition to drug name, price, and initial quantity, the form includes a supplier field so the initial stock can be attributed to a supplier.

**Why this priority**: When a drug is first entered into the system, it always arrives from a supplier. Capturing it at creation time is more accurate than having to go back and edit the batch later.

**Independent Test**: Trigger the Quick Create Drug flow on any app, fill in all fields including a supplier, submit, then verify the drug's initial batch shows the correct supplier in batch history.

**Acceptance Scenarios**:

1. **Given** the Quick Create Drug form is open, **When** the user opens the supplier field, **Then** a searchable list of all suppliers is shown.
2. **Given** a supplier is selected and the drug is saved, **Then** the first batch for this drug is linked to that supplier.
3. **Given** the supplier field is left blank, **Then** the drug and initial batch are created successfully without a supplier association.

---

### User Story 3 - View Supplier on Batch History (Priority: P3)

An admin reviewing inventory can see, for each stock batch, which supplier it came from. This is visible in the batch details in all three apps.

**Why this priority**: Tracking which supplier provided which batch is the primary value of the feature. Without visibility, recording the supplier at entry time is pointless.

**Independent Test**: After linking a batch to a supplier (via Story 1 or 2), open the inventory detail / batch history screen in any app and confirm the supplier name appears next to the batch entry.

**Acceptance Scenarios**:

1. **Given** a batch has an associated supplier, **When** viewing inventory batch history, **Then** the supplier name is shown next to that batch.
2. **Given** a batch has no associated supplier, **When** viewing batch history, **Then** no supplier label is shown (no placeholder or error).

---

### User Story 4 - Supplier Selection in Mobile App (Priority: P2)

The mobile app pharmacist uses the same "Add Stock" and "Quick Create Drug" flows with supplier selection, consistent with the web app experience, adapted for touch input with a searchable bottom-sheet or modal picker.

**Why this priority**: Mobile is the primary tool for pharmacists at the branch level who handle day-to-day stock entry.

**Independent Test**: Perform stock entry from the mobile app, select a supplier, confirm the save succeeds and the batch shows the supplier in mobile inventory detail.

**Acceptance Scenarios**:

1. **Given** the mobile "Add Stock" form is open, **When** the user taps the supplier field, **Then** a modal/bottom-sheet with searchable supplier list opens.
2. **Given** a supplier is selected, **Then** the supplier name appears in the form field and is saved with the batch.

---

### User Story 5 - Supplier Selection in Desktop App (Priority: P3)

The desktop app's inventory entry forms (add drug, add stock) include a supplier field consistent with the web and mobile apps. Since the desktop works offline and syncs, supplier data must be available locally and sync correctly.

**Why this priority**: Desktop is used in pharmacies without reliable internet. Supplier data needs to be available offline and synced when online.

**Independent Test**: Open the desktop app in offline mode, add stock and select a supplier from the locally cached list, confirm the batch is saved. Once online, sync and verify the batch appears in the web app with the correct supplier.

**Acceptance Scenarios**:

1. **Given** the desktop app has synced supplier data, **When** the user opens the Add Stock form, **Then** the supplier dropdown lists all known suppliers (including offline mode).
2. **Given** the desktop creates a batch with a supplier while offline, **When** the app syncs to the cloud, **Then** the supplier association is preserved correctly.

---

### Edge Cases

- What happens when the supplier list is very long (100+ suppliers)? The picker must support search/filter by name.
- What if a supplier is deleted after batches were associated with it? The batch should retain the supplier name as a snapshot or show "deleted supplier" gracefully.
- What if the desktop app has never synced suppliers (first run, no internet)? The supplier field should be optional and the form should still submit without it.
- What happens when the same batch number is received from two different suppliers? Each entry is a separate batch record; supplier is per-batch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All three apps (web, mobile, desktop) MUST display a supplier selection field in the "Add Stock to Inventory" form.
- **FR-002**: All three apps MUST display a supplier selection field in the "Create New Drug / Quick Add Drug" form.
- **FR-003**: The supplier field MUST be optional in all forms — submitting without a supplier selection MUST be allowed.
- **FR-004**: The supplier picker MUST support search/filter by supplier name to support large supplier lists.
- **FR-005**: Each saved stock batch MUST store the supplier association when one is selected.
- **FR-006**: The batch history / inventory detail view in all three apps MUST display the supplier name for batches that have one.
- **FR-007**: The web app supplier list used in the pickers MUST be loaded from the existing suppliers data source (no new supplier management needed — suppliers already exist in the system).
- **FR-008**: The mobile app MUST fetch the supplier list from the API and cache it for the session to avoid repeated requests.
- **FR-009**: The desktop app MUST store supplier reference data locally so it is available in offline mode, refreshed on each sync cycle.
- **FR-010**: When a purchase order is received (existing flow), the supplier association on the resulting batches MUST be automatically set from the purchase order's supplier — no manual selection needed for that flow.

### Key Entities

- **Batch**: A unit of stock with a specific expiry date, quantity, cost price, and batch number. After this feature, it also stores an optional supplier reference.
- **Supplier**: An existing entity with name, phone, email, address, and balance. No new fields are needed on Supplier itself.
- **InventoryEntry (Quick Create / Add Batch)**: The form action that creates a batch. After this feature, it accepts an optional supplier identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the "Add Stock with Supplier" form in under 60 seconds — no more time than the current form without supplier.
- **SC-002**: 100% of batches created through any of the three apps store their supplier reference when one is provided — no data loss on save or sync.
- **SC-003**: Supplier field renders correctly in all three apps with no layout regression on any screen size (phone, tablet, desktop).
- **SC-004**: Offline desktop entry with supplier selection syncs without error in 100% of cases when connectivity is restored.
- **SC-005**: The supplier picker correctly filters results as the user types, returning matching results within 300ms on the web and mobile apps.

## Assumptions

- Supplier management (create/edit/delete supplier) is out of scope for this feature — suppliers already exist in the system and have full CRUD in the web app.
- The existing purchase order → receive stock flow already correctly links batches to the purchase's supplier; this feature focuses only on the direct add-batch and quick-create paths.
- Supplier data does not need to be added to the desktop local schema as a full entity — a lightweight local cache (name + id) is sufficient for the offline dropdown.
- Deleting a supplier will not cascade-delete existing batch associations; historical batches retain the supplier reference (soft reference by name or ID snapshot).
- The mobile app connects to the cloud API for supplier data; no separate mobile-only supplier storage is needed beyond session caching.
