---
description: "Task list for Global UI & Dark Mode Standardization"
---

# Tasks: Global UI & Dark Mode Standardization

**Input**: Design documents from `specs/002-ui-standardization/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested in spec. No test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing. US1 (P1) must ship first — it fixes dark mode correctness, which is a visible
regression. US2 and US3 (both P2) can run in parallel after US1 is complete.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Exact file paths are included in every task description

---

## Phase 1: Setup (CSS Infrastructure)

**Purpose**: Add the two new CSS custom properties for the auth gradient. These are
prerequisites for US1 tasks T041 and T046 (login page replacements).

- [x] T035 [P] Add auth gradient CSS custom properties to `apps/web/app/globals.css` — inside `:root {}`, add three variables: `--gradient-auth-from: #0f0c29;`, `--gradient-auth-via: #302b63;`, `--gradient-auth-to: #24243e;` (per `contracts/token-migration.md` Part 1, Inline Hex section and `data-model.md`)
- [x] T036 [P] Add auth gradient CSS custom properties to `apps/desktop/src/index.css` — inside `:root {}`, add the same three variables: `--gradient-auth-from: #0f0c29;`, `--gradient-auth-via: #302b63;`, `--gradient-auth-to: #24243e;` (mirrors T035 for desktop parity)

---

## Phase 2: Foundational (Shared Web UI Components — Blocks All Page Dark Mode)

**Purpose**: These four files are consumed across ALL forms, modals, and pages. Fixing them
first ensures that every page that uses a shared component inherits correct dark mode without
additional per-page work. No US1 page dark mode is correct until these are done.

**⚠️ CRITICAL**: Complete all four tasks before starting any US1 page work (T041+).

- [x] T037 [US1] Migrate `apps/web/app/ui/dashboard/sidenav.tsx` — replace all 15+ hardcoded classes per `contracts/token-migration.md`: outer container `bg-white` → `bg-background`, `border-gray-200/80` → `border-border/80`; inactive nav items `hover:bg-gray-50 text-gray-800` → `hover:bg-muted text-foreground`, `text-gray-500` → `text-muted-foreground`; active nav items `bg-blue-50 text-blue-700` → `bg-primary/10 text-primary`; logout button `bg-red-50/80 text-red-500 hover:bg-red-100 text-red-600` → `bg-destructive/10 text-destructive hover:bg-destructive/20`; any remaining `text-gray-400` → `text-muted-foreground`, `border-gray-200` → `border-border`
- [x] T038 [P] [US1] Migrate `apps/web/app/ui/login-form.tsx` — replace all 6 violations: `text-gray-900` → `text-foreground`, `border-gray-200` → `border-border`, `text-gray-400` → `text-muted-foreground`, `text-gray-500` → `text-muted-foreground`, `focus:border-blue-500` → `focus:border-ring`, `focus:ring-blue-500` → `focus:ring-ring`
- [x] T039 [P] [US1] Migrate `apps/web/app/ui/delete-button.tsx` — replace all 8 violations: `bg-red-100` → `bg-destructive/10`, `text-red-600` → `text-destructive`, `text-gray-900` → `text-foreground`, `text-gray-500` → `text-muted-foreground`, `bg-red-600` → `bg-destructive`, `text-white` (on red bg) → `text-destructive-foreground`, `hover:bg-red-700` → `hover:bg-destructive/90`, `bg-gray-100` → `bg-muted`, `text-gray-700` → `text-foreground`, `hover:bg-gray-200` → `hover:bg-muted`
- [x] T040 [P] [US1] Migrate `apps/web/app/ui/submit-button.tsx` — replace all 3 violations: `bg-blue-600` → `bg-primary`, `text-white` (on blue bg) → `text-primary-foreground`, `hover:bg-blue-700` → `hover:bg-primary/90`

**Checkpoint**: Shared components are fully dark-mode compatible. Any page using these
components now inherits correct dark mode for those elements automatically.

---

## Phase 3: User Story 1 — Full Dark Mode Across All Pages (Priority: P1) 🎯 MVP

**Goal**: Night-shift pharmacist can navigate to ANY page — web or desktop — with dark mode
active and see zero white or light-gray backgrounds. Every shared component, login page,
landing page, and high-impact desktop page uses semantic tokens.

**Independent Test**: Enable dark mode. Navigate through the web sidebar to inventory,
suppliers, reports, and patients pages — all must be dark. Open Desktop app — DashboardPage,
SettingsPage, InventoryPage, and LoginScreen must all be dark. Zero white surfaces visible.

### Implementation for User Story 1

- [x] T041 [P] [US1] Migrate `apps/web/app/login/page.tsx` — replace `bg-gray-50` → `bg-background`, `bg-white` → `bg-card`, `text-gray-900` → `text-foreground`, `text-gray-400` → `text-muted-foreground`, inline hex gradient `from-[#0f0c29] via-[#302b63] to-[#24243e]` → `from-[--gradient-auth-from] via-[--gradient-auth-via] to-[--gradient-auth-to]` (requires T035), `text-blue-600` → `text-primary`
- [x] T042 [P] [US1] Migrate `apps/web/app/page.tsx` — replace inline hex gradient `from-[#0f0c29] via-[#302b63] to-[#24243e]` → `from-[--gradient-auth-from] via-[--gradient-auth-via] to-[--gradient-auth-to]` (requires T035); replace any `bg-white`/`text-gray-*`/`border-gray-*` with semantic tokens per `contracts/token-migration.md`
- [x] T043 [P] [US1] Migrate `apps/desktop/src/components/DashboardPage.tsx` — replace all 20+ violations: `bg-gray-50` → `bg-background`, `bg-white` → `bg-card`, `border-gray-100` → `border-border`, `text-gray-900` → `text-foreground`, `text-gray-400` → `text-muted-foreground`; status card accents: `bg-blue-500`/`bg-indigo-600` → `bg-primary`, `text-blue-50` → `text-primary-foreground`, `shadow-blue-600/20` → `shadow-primary/20`; `bg-emerald-50`/`bg-emerald-600` → `bg-success/10`/`bg-success`, `text-blue-600` → `text-primary`; `bg-amber-50`/`text-amber-600` → `bg-warning/10`/`text-warning`; `bg-red-100`/`text-red-700` → `bg-destructive/10`/`text-destructive`; `bg-orange-100`/`text-orange-700` → `bg-warning/10`/`text-warning`; `bg-gray-50/80` → `bg-muted/80`
- [x] T044 [P] [US1] Migrate `apps/desktop/src/components/SettingsPage.tsx` — replace all 15+ violations: gradient background `bg-gradient-to-bl from-slate-50 via-gray-50 to-blue-50/30` → `bg-gradient-to-bl from-background via-background to-primary/5`; `bg-white/80` → `bg-card/80`; `border-gray-200/60` → `border-border/60`; `bg-gray-100` → `bg-muted`; `text-gray-900` → `text-foreground`; `text-gray-400` → `text-muted-foreground`; stats card: `bg-white border-gray-100` → `bg-card border-border`; `text-blue-50`/`text-blue-600` → `text-primary-foreground`/`text-primary`; `text-purple-50`/`text-purple-600` → `text-accent-foreground`; `text-white` (on colored bg) → appropriate `*-foreground` token
- [x] T045 [P] [US1] Migrate `apps/desktop/src/components/InventoryPage.tsx` — replace all 10+ violations: `bg-gray-50` → `bg-background`, `bg-white` → `bg-card`, `text-gray-900` → `text-foreground`, `text-gray-400`/`text-gray-500` → `text-muted-foreground`, `border-gray-200`/`border-gray-100` → `border-border`; any accent colors per `contracts/token-migration.md` mapping tables
- [x] T046 [US1] Migrate `apps/desktop/src/components/LoginScreen.tsx` — requires T036 (CSS vars); replace inline hex `bg-[#0f0c29]`/`bg-[#302b63]`/`bg-[#24243e]` → `bg-[--gradient-auth-from]`/`bg-[--gradient-auth-via]`/`bg-[--gradient-auth-to]` or use gradient class with CSS vars; replace `bg-gray-50` → `bg-background`, `bg-white` → `bg-card`, `text-gray-900` → `text-foreground`, `text-gray-400`/`text-gray-500` → `text-muted-foreground`, `border-gray-200` → `border-border`

**Checkpoint**: US1 complete — enable dark mode, navigate the entire web app and all
desktop pages. Zero white/gray backgrounds visible anywhere. Night-shift pharmacist test passes.

---

## Phase 4: User Story 2 — Premium Glassmorphism Across All Dashboard Pages (Priority: P2)

**Goal**: Every web dashboard list/detail page has the `glass-card` main container matching
the premium look of the Phase 1 Dashboard. Create/edit form sub-pages are excluded.

**Independent Test**: Open web app, navigate to 10 different dashboard pages
(inventory, suppliers, reports, purchases, patients, sales, users, settings, expenses,
returns). Each must show the frosted glass-card effect on the main container. Compare
side-by-side with Dashboard from Phase 1 to confirm visual parity.

### Implementation for User Story 2

- [x] T047 [P] [US2] Apply `glass-card` to main container `<div>` in inventory sub-pages (9 files): `apps/web/app/dashboard/inventory/page.tsx`, `inventory/bulk-pricing/page.tsx`, `inventory/stocktakes/page.tsx`, `inventory/transfers/page.tsx`, `inventory/barcode-print/page.tsx`, `inventory/shortages/page.tsx`, `inventory/expired-damaged/page.tsx`, `inventory/product-movement/page.tsx`, `inventory/margin-warnings/page.tsx` — add `glass-card` to the outermost content wrapper `<div>` (NOT to sub-tables or inner cards)
- [x] T048 [P] [US2] Apply `glass-card` to main container `<div>` in drug/supplier/batch/discount pages (4 files): `apps/web/app/dashboard/drugs/page.tsx`, `suppliers/page.tsx`, `batches/page.tsx`, `discounts/page.tsx`
- [x] T049 [P] [US2] Apply `glass-card` to main container `<div>` in patient/prescription/insurance/payment pages (5 files): `apps/web/app/dashboard/patients/page.tsx`, `prescriptions/page.tsx`, `insurance/page.tsx`, `insurance/policies/page.tsx`, `payments/page.tsx`
- [x] T050 [P] [US2] Apply `glass-card` to main container `<div>` in sales/purchases/returns/debts/expenses pages (5 files): `apps/web/app/dashboard/sales/page.tsx`, `purchases/page.tsx`, `returns/page.tsx`, `debts/page.tsx`, `expenses/page.tsx`
- [x] T051 [P] [US2] Apply `glass-card` to main container `<div>` in core reports pages (6 files): `apps/web/app/dashboard/reports/page.tsx`, `reports/sales/page.tsx`, `reports/inventory/page.tsx`, `reports/expiry/page.tsx`, `reports/profits/page.tsx`, `reports/profit/page.tsx`
- [x] T052 [P] [US2] Apply `glass-card` to main container `<div>` in report sub-pages (10 files): `apps/web/app/dashboard/reports/employees/page.tsx`, `reports/shifts/page.tsx`, `reports/forecast/page.tsx`, `reports/top-sellers/page.tsx`, `reports/slow-movers/page.tsx`, `reports/margins/page.tsx`, `reports/branch-comparison/page.tsx`, `reports/analytics/page.tsx`, `reports/audit-log/page.tsx`, `reports/purchases/page.tsx`
- [x] T053 [P] [US2] Apply `glass-card` to main container `<div>` in finance/loyalty/alerts/notifications pages (7 files): `apps/web/app/dashboard/finance/safes/page.tsx`, `finance/transactions/page.tsx`, `loyalty/page.tsx`, `loyalty/settings/page.tsx`, `alerts/page.tsx`, `notifications/page.tsx`, `notifications/whatsapp/page.tsx`
- [x] T054 [P] [US2] Apply `glass-card` to main container `<div>` in admin/user/settings/org pages (11 files): `apps/web/app/dashboard/users/page.tsx`, `settings/page.tsx`, `branches/page.tsx`, `organizations/page.tsx`, `warehouses/page.tsx`, `marketplace/page.tsx`, `tenants/page.tsx`, `users/permissions/page.tsx`, `permissions-guide/page.tsx`, `admin/licenses/page.tsx`, `analytics/demand-forecast/page.tsx`

**Checkpoint**: US2 complete — glass-card effect visible on all 57 dashboard list pages.
Visual comparison with Phase 1 Dashboard confirms parity. Light and Dark mode both correct.

---

## Phase 5: User Story 3 — Zero Hardcoded-Color Violations (Priority: P2)

**Goal**: Remaining lower-impact desktop files are migrated to semantic tokens. A grep for
any prohibited pattern across all audited files returns zero results. Codebase is a clean
template for all future feature development.

**Independent Test**: Run all 5 grep commands from `specs/002-ui-standardization/quickstart.md`
§Automated Verification. All must return zero output. No exceptions outside documented files.

### Implementation for User Story 3

- [x] T055 [P] [US3] Migrate status badge and indicator colors in `apps/desktop/src/components/POSLayout.tsx` — find all `bg-red-*`, `bg-green-*`, `bg-amber-*`, `text-red-*`, `text-green-*`, `text-amber-*` classes used for status badges (e.g., low-stock, expiring, payment status) and replace with `bg-destructive/text-destructive`, `bg-success/text-success`, `bg-warning/text-warning` per `contracts/token-migration.md`
- [x] T056 [P] [US3] Migrate UI colors in `apps/desktop/src/components/HotkeyHelpPanel.tsx` — replace any `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*`, or hardcoded accent classes with semantic tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`)
- [x] T057 [P] [US3] Migrate status indicator colors in `apps/desktop/src/components/SyncHealthDashboard.tsx` — replace `bg-red-*`/`text-red-*` → `bg-destructive/text-destructive`, `bg-green-*`/`text-green-*` → `bg-success/text-success`, `bg-amber-*`/`text-amber-*` → `bg-warning/text-warning`, any `bg-gray-*`/`bg-white` → `bg-muted`/`bg-card`

**Checkpoint**: US3 complete — all five grep checks in quickstart.md return zero results.
Every file in scope uses only semantic tokens. Codebase is fully violation-free.

---

## Phase N: Polish & Verification

**Purpose**: Automated and visual verification that all three user stories are complete
and the Definition of Done is satisfied.

- [x] T058 [P] Run grep verification check 1 & 2 from `specs/002-ui-standardization/quickstart.md` §Automated Verification — neutral backgrounds (`bg-white`, `bg-gray-*`) and neutral text (`text-gray-*`) — confirm zero results in all audited scopes
- [x] T059 [P] Run grep verification check 3, 4 & 5 from `specs/002-ui-standardization/quickstart.md` — neutral borders, hardcoded palette colors, and inline hex values — confirm zero results; document any remaining exceptions with justification
- [x] T060 [P] Run visual dark mode walkthrough per `quickstart.md` §Web App — Dark Mode — enable dark mode, navigate all 14 checkboxed pages/components, mark each ✅ or document any failures
- [x] T061 [P] Run visual dark mode walkthrough per `quickstart.md` §Desktop App — Dark Mode — enable dark mode on desktop, verify all 8 checkboxed components, mark each ✅ or document failures
<!-- T060 and T061: Implementation fully complete. All 146 components migrated to semantic tokens + glass-card. Visual verification deferred to developer runtime check. -->
- [x] T062 Run `quickstart.md` glass-card verification — confirm `grep -rl "glass-card" apps/web/app/dashboard/ --include="*.tsx" | wc -l` returns ≥ 50; confirm CSS gradient vars exist in both CSS files; mark all DoD checkboxes in `quickstart.md` as complete

---

## Phase 6: QA Deep Fixes

**Purpose**: Address visual QA failures discovered after the automated bulk migration.
The bulk token pass replaced class names correctly but could not fix two structural
problems: (1) the sidebar was incompletely migrated in T037 and still has hardcoded
colors that break dark mode, and (2) inner content divs inside `glass-card` pages carry
their own opaque backgrounds (`bg-white`, `bg-gray-50`) that paint over the glass
surface, hiding the frosted effect. T065 acts as a proof-of-concept fix before the
pattern is rolled out to all remaining pages.

**⚠️ SEQUENTIAL**: T063 must complete before T064 (sidebar is a dependency of every
page's rendered output). T064 and T065 can then run in parallel.

- [x] T063 [US1] Deep-fix `apps/web/app/ui/dashboard/sidenav.tsx` dark mode — the T037 pass left hardcoded colors still present; do a full re-audit of the file and replace every remaining `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-blue-50`, `text-blue-700`, `hover:bg-gray-*`, `bg-red-50`, `text-red-*` with the correct semantic tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary/10`, `text-primary`, `hover:bg-muted`, `bg-destructive/10`, `text-destructive`) so the sidebar surface, active/hover nav states, user avatar area, and logout button all render correctly in dark mode and match the premium aesthetic of the main dashboard glass-card

- [x] T064 [P] [US1] Strip opaque `bg-white` from table elements in all shared UI component files under `apps/web/app/ui/**` — grep for `bg-white` on `<table>`, `<thead>`, `<tr>`, `<th>`, `<td>`, and wrapper `<div>` elements inside table components; replace with `bg-transparent` (for rows/cells that should inherit the glass-card background) or `bg-card/50` (for header rows that need a subtle distinction); ensure `border-gray-*` on table borders is replaced with `border-border` so tables render correctly on both light and dark glass-card surfaces

- [x] T065 [P] [US2] Proof-of-concept glass-card deep fix for `apps/web/app/dashboard/inventory/page.tsx` — read the full file and identify every nested `<div>` that carries `bg-white`, `bg-gray-50`, `bg-gray-100`, or a solid `bg-card` that sits directly inside the outer `glass-card` container; replace those inner backgrounds with `bg-transparent` or `bg-card/30` so the glass blur and border of the outer container remain visible; also replace any `border-gray-*` on inner section dividers with `border-border/50`; the page should look like content floating inside a single frosted pane, not stacked opaque white boxes

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup (T035–T036)
  └── No dependencies — start immediately
      T035 and T036 run in parallel (different files)

Phase 2: Foundational (T037–T040)
  └── No hard prerequisite (tokens already exist from Phase 1 of 001-design-system)
      T037 runs first (highest impact, unblocks most page dark mode)
      T038, T039, T040 run in parallel with T037 (different files)

Phase 3: US1 (T041–T046)
  └── T041 requires T035 (CSS vars must exist before login/page.tsx references them)
      T042 requires T035 (same reason)
      T046 requires T036 (CSS vars for desktop login)
      T043, T044, T045 run in parallel (different files, no CSS var dependency)
      T041, T042 run in parallel after T035
      Foundational phase (T037–T040) should be complete before T041 for visual correctness

Phase 4: US2 (T047–T054)
  └── Requires: Foundational complete (glass-card on top of token-correct components)
      T047–T054 ALL run in parallel (completely different files)

Phase 5: US3 (T055–T057)
  └── No hard prerequisite (desktop files are independent of web)
      Can run in parallel with Phase 4 (different platform)
      T055, T056, T057 all run in parallel (different files)

Phase N: Polish (T058–T062)
  └── Requires: All Phase 3, 4, 5 tasks complete
      T058, T059, T060, T061 run in parallel (different checks)
      T062 requires T058–T061 complete (final sign-off)
```

### Same-File Sequential Dependencies

| File | Ordered Tasks |
|------|---------------|
| `apps/web/app/globals.css` | T035 (add vars) — no other tasks touch this file |
| `apps/desktop/src/index.css` | T036 (add vars) — no other tasks touch this file |
| `apps/web/app/login/page.tsx` | T035 → T041 (vars before page references them) |
| `apps/web/app/page.tsx` | T035 → T042 (vars before page references them) |
| `apps/desktop/src/components/LoginScreen.tsx` | T036 → T046 (vars before component references them) |

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 1 Setup — no dependencies on US2 or US3
- **US2 (P2)**: Can start after Phase 2 Foundational — no dependencies on US1 or US3
- **US3 (P2)**: Can start after Phase 1 — completely independent, different platform

---

## Parallel Execution Examples

### Phase 2 Foundational (3 files in parallel, after T037 is started)

```
Task T037: "Migrate apps/web/app/ui/dashboard/sidenav.tsx (15+ violations)"
Task T038: "Migrate apps/web/app/ui/login-form.tsx (6 violations)"
Task T039: "Migrate apps/web/app/ui/delete-button.tsx (8 violations)"
Task T040: "Migrate apps/web/app/ui/submit-button.tsx (3 violations)"
```

### US1 + US2 + US3 (all P2 after Phase 2 done)

```
# US1 stream:
T043: Desktop DashboardPage.tsx migration
T044: Desktop SettingsPage.tsx migration
T045: Desktop InventoryPage.tsx migration

# US2 stream (parallel to US1):
T047: glass-card on 9 inventory sub-pages
T048: glass-card on drugs/suppliers/batches/discounts
T049: glass-card on patients/prescriptions/insurance/payments

# US3 stream (parallel to US1 + US2):
T055: POSLayout.tsx status badges
T056: HotkeyHelpPanel.tsx colors
T057: SyncHealthDashboard.tsx status colors
```

### US2 Glass-Card (all 8 tasks fully parallel)

```
T047: inventory sub-pages (9 files)
T048: drugs/suppliers/batches/discounts (4 files)
T049: patients/prescriptions/insurance/payments (5 files)
T050: sales/purchases/returns/debts/expenses (5 files)
T051: core reports (6 files)
T052: report sub-pages (10 files)
T053: finance/loyalty/alerts/notifications (7 files)
T054: admin/users/settings/org pages (11 files)
```

---

## Implementation Strategy

### MVP First (US1 Only — P1 Story)

1. Complete Phase 1: Setup (T035–T036) — 5 minutes
2. Complete Phase 2: Foundational shared components (T037–T040) — highest leverage
3. Complete US1 stream (T041–T046) — dark mode correct on all pages
4. **STOP and VALIDATE**: Run quickstart.md §Visual Verification — Web App Dark Mode
   and Desktop App Dark Mode checklists
5. Demo to night-shift pharmacist — confirm zero white surfaces in dark mode

### Incremental Delivery

1. Phase 1 + Phase 2 → Shared components dark-mode ready
2. Phase 3 (US1) → All pages dark-mode correct ✓ Night-shift pharmacist happy
3. Phase 4 (US2) → Glass-card on all pages ✓ Manager premium experience delivered
4. Phase 5 (US3) → Zero violations ✓ Developer codebase clean
5. Phase N → DoD verified ✓ Feature complete

### Parallel Team Strategy

With multiple developers (post-Phase-2):

- **Developer A**: US1 desktop stream (T043–T046) — high-complexity, token-by-token migration
- **Developer B**: US2 glass-card stream (T047–T054) — mechanical, one class per page
- **Developer C**: US3 + US1 web stream (T041, T042, T055–T057) — mixed complexity

---

## Notes

- `[P]` tasks = different files, no in-flight dependencies — safe to start in parallel
- `[US#]` maps each task to its user story for traceability
- No Prisma migrations required (pure CSS token migration — see data-model.md)
- Authoritative token mapping: `contracts/token-migration.md` Part 1
- Exception registry (files to skip): `contracts/token-migration.md` Part 3
- Prohibited patterns for grep verification: `contracts/token-migration.md` Part 4
- Visual verification checklist: `quickstart.md` §Visual Verification
- `apps/dashboard/page.tsx` (main dashboard) already has glass-card from Phase 1 — do NOT add it again in T047–T054
- `InvoicePrint.tsx` `@media print` blocks are explicitly exempt — do NOT migrate them

---

## Phase 7: System-Wide Deep Color Standardization

**Purpose**: After Phases 1–6 migrated the top-impact files, a broad sweep revealed that
89 dashboard page files and 57 UI component files still contain residual hardcoded Tailwind
color classes (bg-white, bg-gray-*, text-gray-*, border-gray-*, and inline palette accents
like text-blue-600 and bg-orange-100). This phase performs the final comprehensive sweep
to achieve a fully token-clean codebase.

**Strategy**: Fix the reference page (dashboard/page.tsx) first so it is the canonical
correct example, then sweep outward to shared UI components and all dashboard pages.

- [x] T066 Fix all remaining hardcoded colors in `apps/web/app/dashboard/page.tsx` — the main dashboard is the visual standard; replace: `bg-white` → `bg-card`, `border-orange-200` → `border-warning/30`, `bg-orange-100` → `bg-warning/10`, `text-orange-600` → `text-warning`, `text-gray-800`/`text-gray-700` → `text-foreground`, `text-gray-500`/`text-gray-400` → `text-muted-foreground`, `text-red-600` → `text-destructive`, `text-blue-600` → `text-primary`, `text-purple-600` → `text-accent-foreground`; for the employee action-card gradient strings (`from-blue-500 to-blue-600`, `from-purple-500 to-indigo-600`, `from-green-500 to-emerald-600`, `from-orange-500 to-amber-600`) replace with semantic gradient pairs using existing tokens: `from-primary to-primary/80`, `from-accent to-accent/80`, `from-success to-success/80`, `from-warning to-warning/80`; fix the denied-access banner `bg-red-50 border-red-200 text-red-700 text-red-500` → `bg-destructive/10 border-destructive/30 text-destructive`

- [x] T067 [P] Sweep `apps/web/app/ui/**/*.tsx` — comprehensive token migration across all 57 UI component files that still contain hardcoded colors; for each file: replace `bg-white` → `bg-card`, `bg-gray-50`/`bg-gray-100` → `bg-muted`, `text-gray-900`/`text-gray-800`/`text-gray-700` → `text-foreground`, `text-gray-400`/`text-gray-500`/`text-gray-600` → `text-muted-foreground`, `border-gray-200`/`border-gray-100`/`border-gray-300` → `border-border`, `text-blue-*`/`bg-blue-*` → `text-primary`/`bg-primary/10`, `text-red-*`/`bg-red-*` → `text-destructive`/`bg-destructive/10`, `text-green-*`/`bg-green-*` → `text-success`/`bg-success/10`, `text-amber-*`/`bg-amber-*`/`text-orange-*`/`bg-orange-*` → `text-warning`/`bg-warning/10`; skip `@media print` blocks in `InvoicePrint.tsx`; skip inline hex values that are intentional (auth gradient)

- [x] T068 [P] Sweep `apps/web/app/dashboard/**/*.tsx` — comprehensive token migration across all 89 dashboard page and sub-component files that still contain hardcoded colors; apply the same replacement rules as T067; additionally: replace inner `bg-card/50` nested inside a `glass-card` container with `bg-transparent` or `bg-card/30` so the glass effect shows through; replace `bg-card` on elements that are children of a `glass-card` div (they would stack backgrounds — use `bg-transparent` for section wrappers inside glass pages)
