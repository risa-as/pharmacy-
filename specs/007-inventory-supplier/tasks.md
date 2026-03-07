# Tasks: Supplier Selection in Inventory Management

**Input**: Design documents from `/specs/007-inventory-supplier/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: No automated tests requested — manual QA via quickstart.md scenarios.

**Organization**: Tasks grouped by user story. Each story delivers an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story this task belongs to ([US1]–[US5])
- **[SYNC-IMPACT]**: Touches a synced entity — requires changes to both web and desktop schemas

---

## Phase 1: Setup

**Purpose**: Confirm branch, review existing structure — no new files needed.

- [x] T001 Confirm active branch is `007-inventory-supplier` and review affected files per plan.md project structure section

---

## Phase 2: Foundational — Database Schema & Migrations [SYNC-IMPACT]

**Purpose**: Schema changes that ALL user stories depend on. No user story work can begin until this phase is complete.

**⚠️ CRITICAL**: These are [SYNC-IMPACT] tasks — both the web (PostgreSQL) and desktop (SQLite) schemas must be updated.

- [x] T002 [SYNC-IMPACT] In `apps/web/prisma/schema.prisma`: add `supplierId String?` field and `supplier Supplier? @relation(fields: [supplierId], references: [id], onDelete: SetNull)` to the `Batch` model; also add `batches Batch[]` back-relation to the `Supplier` model
- [x] T003 [SYNC-IMPACT] Run web migration: `pnpm --filter web exec prisma migrate dev --name add_supplier_to_batch` to generate and apply the migration in `apps/web/prisma/migrations/`
- [x] T004 [SYNC-IMPACT] In `apps/desktop/prisma/schema.prisma`: add a new `Supplier` model with fields `id String @id`, `name String`, `phone String?`, `batches Batch[]`; also add `supplierId String?` and `supplier Supplier? @relation(fields: [supplierId], references: [id])` to the `Batch` model
- [x] T005 [SYNC-IMPACT] Run desktop migration: `pnpm --filter desktop exec prisma migrate dev --name add_supplier_to_batch` to generate and apply the migration in `apps/desktop/prisma/migrations/`

**Checkpoint**: Both database schemas updated and migrations applied. Verify `Batch` table now has `supplierId` column in both databases.

---

## Phase 3: User Story 1 — Select Supplier When Adding Stock Batch (Priority: P1) 🎯 MVP

**Goal**: Web dashboard users can select a supplier when adding a stock batch to any drug in inventory. This is the most common stock entry path.

**Independent Test**: Open the Add Batch modal on the web dashboard, select a supplier, submit — then verify the saved batch shows the supplier name in batch history (quickstart.md Scenario 1 & 2).

- [x] T006 [US1] Update `apps/web/app/api/inventory/add-batch/route.ts`: extract `supplierId` from request body and pass it to the `prisma.batch.create()` call (add `supplierId: supplierId ?? null` to the `data` object)
- [x] T007 [US1] Update `apps/web/app/api/purchases/[id]/receive/route.ts`: fetch the purchase record's `supplierId` inside the transaction and pass it to each `prisma.batch.create()` call so supplier is automatically inherited from the purchase order
- [x] T008 [US1] Update `apps/web/app/ui/inventory/add-batch-modal.tsx`: add state `suppliers` (loaded from `GET /api/suppliers` on modal open) and `supplierId` (selected value); add a `<select>` or `<Select>` component labeled "المورد (اختياري)" positioned before the batch number field; pass `supplierId` in the form submission body

**Checkpoint**: Open Add Batch modal → supplier dropdown appears → select a supplier → submit → batch saved. Open batch history → supplier name visible on that batch. Submitting without supplier also works (quickstart.md Scenario 2).

---

## Phase 4: User Story 2 — Select Supplier When Quick Creating a New Drug (Priority: P2)

**Goal**: Web dashboard users can assign a supplier when creating a new drug entry (quick-create flow), so the initial stock batch is attributed to a supplier.

**Independent Test**: Scan or enter a new barcode → Quick Create Drug modal opens → select a supplier → submit → drug created. View the drug's batch history: initial batch shows the supplier name (quickstart.md Scenario 3).

- [x] T009 [US2] Update `apps/web/app/api/inventory/create-quick/route.ts`: extract `supplierId` from request body and pass it to the `prisma.batch.create()` call inside the transaction
- [x] T010 [P] [US2] Update `apps/web/app/ui/inventory/create-drug-modal.tsx`: add state `suppliers` (loaded from `GET /api/suppliers` on modal open) and `supplierId`; add a `<select>` or `<Select>` dropdown labeled "المورد (اختياري)" after the cost price field; pass `supplierId` in the form submission body

**Checkpoint**: Quick Create Drug modal shows supplier dropdown → select supplier → drug and initial batch created with supplier. Leave supplier empty → drug still created successfully (optional field).

---

## Phase 5: User Story 3 — View Supplier on Batch History (Priority: P3)

**Goal**: Any user reviewing inventory in the web dashboard can see which supplier provided each batch. Batches without a supplier show nothing (no label or error).

**Independent Test**: After completing Phase 3 or 4 (any batch with supplierId), open the inventory batch history page → confirm supplier name appears next to the batch with a supplier, and nothing appears for batches without one (quickstart.md Scenario 1 step 7–8).

- [x] T011 [US3] In the web batch history/list component (locate in `apps/web/app/ui/inventory/` or `apps/web/app/dashboard/inventory/` — find the component that renders individual batch rows): add a supplier name column/field by including `supplier: { select: { name: true } }` in the Prisma query for batches, then render `{batch.supplier?.name}` conditionally in the batch row UI
- [x] T012 [P] [US3] Update `apps/web/app/api/inventory/add-batch/route.ts` GET query (if it exists separately) or the inventory detail API to include `supplier: { select: { name: true, id: true } }` in the `include` clause for batches so the supplier name is returned to the frontend

**Checkpoint**: Batch history displays supplier name for batches that have one. Batches without a supplier show no supplier label. No UI regressions on existing batch list layout.

---

## Phase 6: User Story 4 — Supplier Selection in Mobile App (Priority: P2)

**Goal**: Mobile app pharmacists can select a supplier when using the Quick Create Drug flow on the mobile inventory screen. The supplier picker uses a searchable modal appropriate for touch input.

**Independent Test**: Open mobile app → Inventory tab → trigger Quick Create Drug → supplier field appears → tap it → searchable supplier modal opens → select supplier → submit → batch created with supplier (quickstart.md Scenario 5).

- [x] T013 [US4] Add `getSuppliers()` method to `apps/mobile/services/api.ts`: calls `GET /suppliers` and returns `Array<{ id: string; name: string; phone?: string }>`, returns `[]` on error (non-blocking)
- [x] T014 [US4] Update `apps/mobile/app/(tabs)/inventory.tsx` Quick Create Drug modal: add state `suppliers` (loaded once when modal opens via `apiService.getSuppliers()`), `selectedSupplierId`, and `showSupplierPicker`; add a `TouchableOpacity` row labeled "المورد (اختياري)" that opens a `Modal` with a `FlatList` of suppliers supporting text search; selected supplier name shown in the field; pass `supplierId` in the `create-quick` API call body

**Checkpoint**: Mobile Quick Create modal has a tappable supplier field → opens searchable modal → filter by typing supplier name → select → name shown in field → submit saves batch with supplier. Leaving supplier empty also works.

---

## Phase 7: User Story 5 — Supplier Selection in Desktop App (Priority: P3)

**Goal**: Desktop app users can select a supplier when adding stock, even while offline. Supplier data is cached locally and synced from the cloud. The supplier association is preserved when the batch syncs back to the cloud.

**Independent Test**: Desktop app (offline) → Add Stock form → supplier dropdown populated from local cache → select supplier → save batch → go online → sync → verify batch appears in web dashboard with correct supplier name (quickstart.md Scenario 6).

- [x] T015 [US5] Update desktop sync service (find the service in `apps/desktop/src/` that calls the cloud API during sync — likely `syncService.ts` or `sync.ts`): add a supplier sync step that calls `GET /api/suppliers`, maps response to `{ id, name, phone }`, and upserts all records into the local `Supplier` table using `prisma.supplier.upsert()`; run this step before batch sync to ensure FK integrity
- [x] T016 [US5] Update the batch sync payload in the desktop sync service: include `supplierId` field when pushing local batch records to the cloud
- [x] T017 [US5] Update `apps/desktop/src/components/InventoryPage.tsx` inventory entry / add-stock form: add a supplier `<select>` dropdown loaded from the local SQLite `Supplier` table via `prisma.supplier.findMany({ orderBy: { name: 'asc' } })`; label it "المورد (اختياري)"; pass the selected `supplierId` in the batch creation call; if the supplier table is empty, show a disabled field with placeholder "لا يوجد موردون (مطلوب مزامنة)"

**Checkpoint**: Desktop Add Stock form shows supplier dropdown populated from local SQLite cache → select → save → batch stored with supplierId locally. After sync: cloud batch history shows correct supplier.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all three apps.

- [ ] T018 [P] Run all quickstart.md scenarios (1–7) manually across web, mobile, and desktop apps to confirm end-to-end behaviour
- [ ] T019 [P] Verify supplier dropdown in all forms shows an empty/placeholder option (e.g., "اختر مورداً...") as the default selected state so it is clear the field is optional
- [ ] T020 [P] Verify purchase order receive flow (quickstart.md Scenario 4): receive items from an existing purchase and confirm batches inherit the supplier automatically without any manual selection

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user story phases
- **Phase 3 (US1)**: Depends on Phase 2 — can start once both migrations are applied
- **Phase 4 (US2)**: Depends on Phase 2 — can run in parallel with Phase 3
- **Phase 5 (US3)**: Depends on Phase 3 (needs batches with supplierId to display)
- **Phase 6 (US4)**: Depends on Phase 2 — can run in parallel with Phase 3 & 4
- **Phase 7 (US5)**: Depends on Phase 2 — can run in parallel with Phase 3, 4, 6
- **Phase 8 (Polish)**: Depends on all Phases 3–7 being complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 only — no story dependencies
- **US2 (P2)**: After Phase 2 only — no story dependencies
- **US3 (P3)**: After US1 (needs batches with supplierId in DB to verify display)
- **US4 (P2)**: After Phase 2 only — no story dependencies
- **US5 (P3)**: After Phase 2 only — no story dependencies

### Within Each User Story

- API route changes before UI changes (UI depends on API accepting new field)
- Schema changes (Phase 2) must precede all API changes

### Parallel Opportunities

- T002 → T003 sequential (migration depends on schema edit)
- T004 → T005 sequential (migration depends on schema edit)
- T002/T003 (web) and T004/T005 (desktop) can run **in parallel** (different databases)
- T006 and T007 can run in parallel (different API route files)
- T009 and T010 can run in parallel (different files — API route vs UI component)
- Phases 3, 4, 6, 7 can all run in parallel once Phase 2 is complete

---

## Parallel Example: Foundation Phase

```
# Run web and desktop schema/migration work in parallel:
Task T002+T003: Web schema edit + migration
Task T004+T005: Desktop schema edit + migration  ← parallel with T002+T003
```

## Parallel Example: User Story 1 (Web)

```
# Run API + receive-route updates in parallel:
Task T006: Update add-batch route (apps/web/app/api/inventory/add-batch/route.ts)
Task T007: Update purchase receive route (apps/web/app/api/purchases/[id]/receive/route.ts)
# Then T008 depends on T006 (UI calls the updated API)
Task T008: Update add-batch-modal.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational — web migration only (T002+T003)
3. Complete Phase 3: US1 — web add-batch with supplier (T006, T007, T008)
4. **STOP and VALIDATE**: Test using quickstart.md Scenarios 1 & 2
5. Demo: Supplier selection working on web Add Stock form

### Incremental Delivery

1. Phase 1 + Phase 2 (T001–T005) → Schema ready for all apps
2. Phase 3 (US1) → Web add-stock with supplier ← **MVP**
3. Phase 4 (US2) → Web quick-create with supplier
4. Phase 5 (US3) → Batch history shows supplier name
5. Phase 6 (US4) → Mobile supplier picker
6. Phase 7 (US5) → Desktop offline supplier
7. Phase 8 → Final cross-app QA

### Single Developer Sequence

```
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 →
T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020
```

---

## Notes

- [SYNC-IMPACT] tasks (T002–T005) must both complete before any user story work begins
- The `supplierId` field is always optional — never add validation that blocks a form submission when supplier is not selected
- Desktop Supplier table is read-only from the UI — only the sync service writes to it
- The purchase receive flow (T007) requires no UI change — supplier is auto-propagated server-side
- For web Select component: use the existing `<select>` HTML element or the project's existing Select UI component — check `apps/web/app/ui/` for established patterns
- Total tasks: 20 | Foundation: 5 | US1: 3 | US2: 2 | US3: 2 | US4: 2 | US5: 3 | Polish: 3
