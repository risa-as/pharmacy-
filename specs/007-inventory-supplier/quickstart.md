# Quickstart & Test Scenarios: Supplier Selection in Inventory Management

**Feature**: 007-inventory-supplier
**Date**: 2026-03-04

---

## Manual Test Scenarios

### Scenario 1 — Add Stock Batch with Supplier (Web)

1. Open web dashboard → Inventory → pick any drug in the list.
2. Click "Add Batch" / "إضافة دفعة".
3. **Verify**: A "Supplier" dropdown appears in the form.
4. Select a supplier from the dropdown.
5. Fill in batch number, quantity, expiry date and submit.
6. **Verify**: Success message shown.
7. Open the batch history for that drug.
8. **Verify**: The newly added batch shows the selected supplier's name.

---

### Scenario 2 — Add Stock Batch Without Supplier (Web)

1. Open the Add Batch form for any drug.
2. Leave the Supplier field empty.
3. Submit the form.
4. **Verify**: Form submits successfully — supplier is not required.
5. Check batch history — the batch row has no supplier label.

---

### Scenario 3 — Quick Create New Drug with Supplier (Web)

1. Scan or enter a barcode that doesn't exist yet.
2. The "Create New Drug" modal opens.
3. **Verify**: A Supplier dropdown is present in the modal.
4. Select a supplier and fill in all other required fields.
5. Submit.
6. **Verify**: Drug is created. In the batch history, the initial batch shows the supplier.

---

### Scenario 4 — Receive Purchase Order (Supplier Auto-Assigned)

1. Open an existing Purchase Order (with a supplier already set).
2. Go to the "Receive Items" page.
3. Enter batch details (batch number, expiry date, quantity) for each item.
4. Submit.
5. **Verify**: No supplier field is shown (supplier is inherited automatically).
6. Check the inventory batch history for one of the received drugs.
7. **Verify**: The new batch shows the purchase order's supplier name — without the user selecting it manually.

---

### Scenario 5 — Supplier Selection on Mobile App

1. Open the Mobile app → Inventory tab.
2. Tap "Add New Drug" / scan a new barcode.
3. The quick-create modal opens.
4. **Verify**: A supplier picker button/field is present.
5. Tap the supplier field → a searchable modal/bottom-sheet opens showing all suppliers.
6. Search for a supplier by name and select it.
7. Complete and submit the form.
8. **Verify**: Success. In the inventory detail, the batch shows the supplier.

---

### Scenario 6 — Desktop Offline Supplier Selection

1. Disconnect the desktop machine from the internet (or disable network).
2. Open the Desktop app → Inventory.
3. Open "Add Stock" for any drug.
4. **Verify**: The supplier dropdown still populates from local cache (suppliers were synced previously).
5. Select a supplier, fill in batch details, and save.
6. **Verify**: Saved locally with supplier reference.
7. Reconnect to the internet and trigger a sync.
8. **Verify**: The batch appears in the web dashboard with the correct supplier name.

---

### Scenario 7 — Supplier Search Filter

1. Open any supplier dropdown (web or mobile).
2. Type 3 characters of a supplier name.
3. **Verify**: Only matching suppliers are shown, filtered within 300ms.
4. Clear the search.
5. **Verify**: Full list is restored.

---

## Expected States After Feature Implementation

| Batch source | supplierId set? | How? |
|---|---|---|
| Add-batch form (web) — supplier selected | ✅ Yes | User selects from dropdown |
| Add-batch form (web) — no supplier | ❌ Null | User skips field |
| Quick-create drug (web/mobile) — supplier selected | ✅ Yes | User selects from picker |
| Quick-create drug — no supplier | ❌ Null | User skips field |
| Receive purchase order | ✅ Yes | Auto-inherited from purchase |
| Desktop offline batch entry | ✅ Yes (synced later) | User selects from local cache |
