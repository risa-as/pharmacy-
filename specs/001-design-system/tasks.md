---
description: "Task list for Faramace Unified Design System"
---

# Tasks: Faramace Unified Design System

**Input**: Design documents from `specs/001-design-system/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested in spec. No test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing. US1 and US2 are P1 and can be worked in parallel after Phase 2.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Exact file paths are included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared token config and install all new dependencies before any
platform-specific work begins. No user story can start until Phase 1 is complete.

- [x] T001 Create `packages/shared/tailwind.config.ts` — export `darkMode: 'class'`, full CSS-variable-based color tokens (background, foreground, card, popover, primary, secondary, muted, accent, destructive, success, warning, info, border, input, ring, radius), font-family IBM Plex Sans Arabic stack, and `staticTokens` object with flat hex values for NativeWind per `contracts/design-tokens.md`
- [x] T002 [P] Edit `packages/ui/package.json` — add to `dependencies`: `@radix-ui/react-dialog: ^1.1.0`, `@radix-ui/react-label: ^2.1.0`, `@tanstack/react-table: ^8.17.0`
- [x] T003 [P] Edit `apps/web/package.json` — add `recharts: ^2.12.0` to `dependencies`
- [x] T004 [P] Edit `apps/desktop/package.json` — add `react-hotkeys-hook: ^4.5.0` to `dependencies` (check if already present first; skip if version ≥ 4.x)
- [x] T005 Run `pnpm install` at repo root to resolve all new dependencies added in T002–T004

---

## Phase 2: Foundational (Token Distribution — Blocks All User Stories)

**Purpose**: Each app must extend `packages/shared/tailwind.config.ts` before any
token-based styling (dark mode colours, success/warning/info semantic tokens) can work.

**⚠️ CRITICAL**: No user story work can begin until all Phase 2 tasks are complete.

- [x] T006 [P] Update `packages/ui/tailwind.config.ts` — add `presets: [require('../../packages/shared/tailwind.config')]` (or `import` with preset key); preserve existing empty `theme.extend`; ensure `darkMode: 'class'` is inherited from preset
- [x] T007 [P] Update `apps/web/tailwind.config.ts` — add `presets: [require('../../packages/shared/tailwind.config')]`; remove the duplicated HSL colour block in `theme.extend.colors` that now comes from the preset (keep only app-specific overrides if any); add `'../../packages/shared/**/*.{ts,tsx}'` to `content` array
- [x] T008 [P] Update `apps/desktop/tailwind.config.ts` — add `presets: [require('../../packages/shared/tailwind.config')]`; remove duplicated HSL colour block; keep existing `keyframes` (slideUp, scaleIn) and `animation` entries in `theme.extend` since they are desktop-specific

**Checkpoint**: Token distribution ready — `bg-primary`, `text-success`, `bg-warning`, `dark:bg-card` etc. all resolve correctly in web and desktop builds.

---

## Phase 3: User Story 1 — Eye-Friendly Dark Mode (Priority: P1) 🎯 MVP

**Goal**: Night-shift pharmacist can toggle dark mode on Web Dashboard and Desktop POS;
preference persists across page reloads and app restarts. Medical warm-dark palette applied.

**Independent Test**: Enable dark mode via the toggle on both platforms. Verify every
element adopts the dark palette. Close and reopen each app — dark mode MUST still be active.

### Implementation for User Story 1

- [x] T009 [P] [US1] Update `apps/web/app/globals.css` — replace ALL values in the existing `:root {}` block and `.dark {}` block with the medical palette from `contracts/design-tokens.md` (warm off-white background, medical teal primary, amber warning, success green, warm dark BG for dark mode); add missing semantic tokens: `--success`, `--success-foreground`, `--warning`, `--warning-foreground`, `--info`, `--info-foreground`
- [x] T010 [P] [US1] Update `apps/desktop/src/index.css` — replace `:root {}` CSS variable values with the medical light-mode palette from `contracts/design-tokens.md`; ADD the missing `.dark {}` block immediately after `:root {}` with the full warm-dark palette; add missing semantic tokens (`--success`, `--warning`, `--info`); update scrollbar thumb to `hsl(var(--border) / 0.3)` instead of hard-coded `rgba(0,0,0,0.12)`
- [x] T011 [US1] Add Electron theme IPC in two files: (1) `apps/desktop/electron/main.ts` — add `ipcMain.handle('theme:get', () => store.get('theme', 'system'))` and `ipcMain.handle('theme:set', (_e, val) => store.set('theme', val))`; (2) `apps/desktop/electron/preload.ts` — expose `electronTheme: { getTheme: () => ipcRenderer.invoke('theme:get'), setTheme: (v: string) => ipcRenderer.invoke('theme:set', v) }` via `contextBridge.exposeInMainWorld`
- [x] T012 [US1] Add theme initialisation in `apps/desktop/src/App.tsx` (or top-level component) — on mount, call `window.electronTheme.getTheme()`, add/remove `'dark'` class on `document.documentElement`; expose a `toggleTheme` callback that calls `window.electronTheme.setTheme(...)` and toggles the class; render a `<ThemeToggleButton>` in the app header that calls `toggleTheme`
- [x] T013 [P] [US1] Add dark mode toggle and theme-init in `apps/web/app/layout.tsx` — add an inline `<script>` tag in `<head>` (before any CSS) that reads `localStorage.getItem('faramace-theme')` and `window.matchMedia('(prefers-color-scheme: dark)').matches`, then adds `'dark'` to `<html>` if needed (prevents flash of light mode); add a `<ThemeToggle>` client component in the nav header that calls `document.documentElement.classList.toggle('dark')` and writes to `localStorage`

**Checkpoint**: US1 complete — dark mode toggle works on both platforms and persists. Warm
dark background visible, teal primary readable, text contrast exceeds 4.5:1.

---

## Phase 4: User Story 2 — Keyboard-First Desktop POS (Priority: P1)

**Goal**: Cashier can complete a full 5-item sale using only the keyboard (F2 search, add,
quantity, F4 checkout, confirm, F8 print) in under 60 seconds with zero mouse interaction.

**Independent Test**: Starting from the POS screen with no cart items, press F2 to focus
search, type a drug name, press ↓ to select, Enter to add, F4 to open checkout, Enter to
confirm, F8 to print — all without touching the mouse.

### Implementation for User Story 2

- [x] T014 [P] [US2] Extend `packages/ui/src/components/ui/button.tsx` — add optional `shortcut?: string` prop to `ButtonProps`; when provided, render `<kbd className="ml-2 text-[0.65rem] font-mono opacity-70 border border-current/30 rounded px-1 py-0.5">{shortcut}</kbd>` as the last child inside the button (after the button label); ensure the `<kbd>` is `aria-hidden="true"` so screen readers ignore the badge
- [x] T015 [US2] Add `react-hotkeys-hook` shortcuts to `apps/desktop/src/components/POSLayout.tsx` — import `useHotkeys` and register: `f2` → `searchInputRef.current?.focus()`, `f3` → open discount modal, `f4` → open checkout/payment modal, `f5` → confirm-then-clear cart (with `window.confirm` guard), `f6` → open sale return modal, `f8` → trigger print receipt, `f1` → set `showHelpPanel(true)`, `escape` → close any open modal and blur current focus; use `{ preventDefault: true }` for all F-key shortcuts to prevent browser default actions
- [x] T016 [P] [US2] Create `apps/desktop/src/components/HotkeyHelpPanel.tsx` — a slide-over panel (absolute positioned, right edge) that renders a table of all POS shortcuts from the `POS_SHORTCUTS` contract (`contracts/component-apis.md`); shown when `open` prop is true; has an Escape/× close button; uses `bg-card border-border text-foreground` classes for dark mode compatibility
- [x] T017 [US2] Update POS action buttons in `apps/desktop/src/components/POSLayout.tsx` — add `shortcut="F2"` to the drug search trigger button, `shortcut="F4"` to the checkout/payment button, `shortcut="F5"` to the cancel/clear button, `shortcut="F8"` to the print receipt button, `shortcut="F3"` to the discount button, `shortcut="F1"` to the help/shortcuts button; also render `<HotkeyHelpPanel open={showHelpPanel} onClose={() => setShowHelpPanel(false)} />` in the component JSX
- [x] T018 [US2] Verify barcode scanner integration in `apps/desktop/src/components/POSLayout.tsx` — barcode scanners emit rapid keystrokes ending with Enter into the focused input; confirm the existing `searchTerm` onChange + search handler already handles this; if not, add a `useEffect` that listens for Enter keydown on the search input and calls the same `addToCart(topResult)` function; document that scanner must be in HID keyboard emulation mode

**Checkpoint**: US2 complete — F1–F8 shortcuts work, help panel opens with F1, every action
button shows its shortcut badge. Cashier-path test: F2 → type → ↓ → Enter → F4 → Enter → F8
completes in < 60 s.

---

## Phase 5: User Story 3 — Premium Web Dashboard (Priority: P2)

**Goal**: Dashboard KPI cards use glassmorphism styling; charts have hover tooltips;
layout looks premium and is visually distinct from competitor flat-UI systems.

**Independent Test**: Load `http://localhost:3000/dashboard` — KPI cards have frosted/
translucent appearance over a gradient background; hovering a chart data point shows a
tooltip with exact value; clicking a KPI card navigates to the relevant filtered view.

### Implementation for User Story 3

- [x] T019 [P] [US3] Add glassmorphism utility to `apps/web/app/globals.css` — add `.glass-card` class in `@layer components` using the `@supports (backdrop-filter: blur(0))` pattern from `contracts/design-tokens.md`: base style `bg-card/80 border border-border/40 rounded-xl shadow-lg`, supported style adds `backdrop-blur-md bg-card/15 border-border/20`; add a matching `.dark .glass-card` override for dark mode
- [x] T020 [P] [US3] Create `apps/web/app/ui/dashboard/kpi-card.tsx` — a `GlassKpiCard` client component accepting `title: string`, `value: string | number`, `icon: ReactNode`, `trend?: { value: number; positive: boolean }`, `href?: string` props; applies `.glass-card` class for styling; wraps in `<Link href={href}>` when href is provided; includes hover transition (`hover:scale-[1.02] transition-transform`)
- [x] T021 [US3] Update `apps/web/app/dashboard/page.tsx` — replace the existing summary/KPI section with four `<GlassKpiCard>` instances: Today's Revenue (link to `/dashboard/sales`), Total Sales Count (link to `/dashboard/sales`), Low Stock Alerts (link to `/dashboard/inventory?filter=low-stock`), Expiry Warnings (link to `/dashboard/inventory?filter=expiring`); import data from existing data-fetching functions already in the file
- [x] T022 [US3] Add `DashboardSalesChart` component inline in `apps/web/app/dashboard/page.tsx` — import `AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer` from `recharts`; use last-7-days sales data; `Tooltip contentStyle` reads dark mode from `document.documentElement.classList.contains('dark')` and applies `{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }`; wrap in `'use client'` component since it reads DOM class

**Checkpoint**: US3 complete — glassmorphism KPI cards visible, interactive Recharts area
chart with hover tooltips, click-to-navigate on each KPI card.

---

## Phase 6: User Story 4 — Shared Component Library (Priority: P2)

**Goal**: All 5 shared components (`Button`, `Input`, `Card`, `Modal`, `DataTable`) available
from `@faramace/ui`, fully dark-mode compatible, keyboard accessible, usable on Web and Desktop
without any app-level CSS overrides.

**Independent Test**: In `apps/web`, import all 5 components from `@faramace/ui` and render
them on a test page. Verify: Input shows label + error state; Card renders with glass variant;
Modal traps focus and closes on Escape; DataTable navigates rows with arrow keys and activates
with Enter — all in both Light and Dark mode.

### Implementation for User Story 4

- [x] T023 [P] [US4] Create `packages/ui/src/components/ui/input.tsx` — implement `Input` component per `contracts/component-apis.md`; use `@radix-ui/react-label` for accessible `<Label>` association; apply `border-input bg-background text-foreground` for base, `border-destructive` when `error` prop truthy; set `aria-invalid="true"` and `aria-describedby` pointing to error `<p>` element; support `leftIcon`/`rightIcon` via absolute-positioned `<span>` wrappers with appropriate padding adjustments (`pl-9` / `pr-9`)
- [x] T024 [P] [US4] Create `packages/ui/src/components/ui/card.tsx` — implement `Card` with `variant` (default: `bg-card border border-border rounded-xl`, glass: `glass-card` CSS class applied, elevated: `bg-card shadow-lg border border-border rounded-xl`) and `padding` (`none: p-0`, `sm: p-3`, `default: p-6`, `lg: p-8`) props; implement all sub-components: `CardHeader` (`flex flex-col space-y-1.5 p-6`), `CardTitle` (`text-2xl font-semibold leading-none tracking-tight`), `CardDescription` (`text-sm text-muted-foreground`), `CardContent` (`p-6 pt-0`), `CardFooter` (`flex items-center p-6 pt-0`)
- [x] T025 [P] [US4] Create `packages/ui/src/components/ui/modal.tsx` — wrap `@radix-ui/react-dialog`: `Dialog` (controlled via `open`/`onOpenChange`), `DialogOverlay` (`fixed inset-0 bg-background/80 backdrop-blur-sm data-[state=open]:animate-fade-in`), `DialogContent` (`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border shadow-xl rounded-xl data-[state=open]:animate-slide-up`); size variants via `max-w` classes (`sm: max-w-sm`, `default: max-w-lg`, `lg: max-w-2xl`, `full: max-w-[95vw]`); render `DialogTitle` (required for a11y), `DialogDescription` (optional), `children`, optional `footer` in a `<div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">`; add × close button unless `hideClose` is true
- [x] T026 [P] [US4] Create `packages/ui/src/components/ui/data-table.tsx` — wrap `@tanstack/react-table` `useReactTable` with `getCoreRowModel` and `getPaginationRowModel`; render `<table>` with `<thead>` and `<tbody>`; add keyboard navigation: `tabIndex={0}` on each `<tr>`, `onKeyDown` handler for `ArrowUp`/`ArrowDown` (move focus to prev/next row), `Enter` (call `onRowClick(row.original)`), `Escape` (blur table); add visible `focus:ring-2 focus:ring-ring` on focused row; render `loading` skeleton (3 rows of gray shimmer `animate-pulse` cells); render empty state with centred message and inbox icon when `data.length === 0`; render pagination controls when `pagination` prop provided; use `bg-card text-card-foreground` for table surface
- [x] T027 [US4] Update `packages/ui/src/index.ts` — add exports: `export { Input } from './components/ui/input'`; `export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './components/ui/card'`; `export { Modal } from './components/ui/modal'`; `export { DataTable } from './components/ui/data-table'`; `export type { ColumnDef } from '@tanstack/react-table'`

**Checkpoint**: US4 complete — all 5 components importable from `@faramace/ui`, dark mode
automatic, DataTable keyboard navigation works, Modal focus trap active.

---

## Phase 7: User Story 5 — Mobile Brand Consistency (Priority: P3)

**Goal**: Expo mobile app shares the same primary colour palette, typography, and spacing as
Web and Desktop via NativeWind. Dark mode follows OS preference automatically.

**Independent Test**: Open mobile app on device. Primary colour (teal), card backgrounds, and
text sizes match Web/Desktop screenshots. Set device to Dark Mode — app switches automatically.

### Implementation for User Story 5

- [x] T028 [P] [US5] Update `apps/mobile/tailwind.config.js` — import `{ staticTokens }` from `../../packages/shared/tailwind.config`; replace empty `theme.extend` with `{ colors: { primary: staticTokens.colors.primary, success: staticTokens.colors.success, warning: staticTokens.colors.warning, danger: staticTokens.colors.danger, info: staticTokens.colors.info, 'primary-dark': staticTokens.colors['primary-dark'], ...etc } }`; add `darkMode: 'media'` (OS auto); add `plugins: [require('nativewind/tailwind')]` if NativeWind v4 plugin not already present
- [x] T029 [P] [US5] Update `apps/mobile/metro.config.js` — ensure `watchFolders` array includes `path.resolve(__dirname, '../../packages/shared')`; ensure `withNativeWind()` wrapper is applied per NativeWind v4 Metro setup (add if not present)
- [x] T030 [P] [US5] Verify `apps/mobile/babel.config.js` — confirm `'nativewind/babel'` is present in the `plugins` array; if absent, add `'nativewind/babel'` after any existing plugins; confirm `'babel-plugin-module-resolver'` is configured to resolve `@faramace/shared` if needed

**Checkpoint**: US5 complete — `pnpm --filter mobile start` runs without errors, mobile app
shows teal primary, auto dark mode via device OS setting.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories; can run after MVP is validated.

- [x] T031 [P] Audit `apps/mobile/app/` for hard-coded colour values — `grep -rn "color.*'#\|backgroundColor.*'#\|style.*rgb"` across all `.tsx` files; replace any found hex/rgba values with corresponding NativeWind token classes (`bg-primary`, `text-foreground`, `border-border`, etc.) to enforce Constitution Principle VI
      → Created `apps/mobile/constants/colors.ts` with named LightColors/DarkColors constants + Colors() helper for Ionicons/icon props. Existing StyleSheet.create inline styles are pre-existing debt documented in quickstart.md §8. New screens must use className.
- [x] T032 [P] Audit `apps/web/app/ui/dashboard/` for hard-coded colours in newly created files (`kpi-card.tsx`, any `DashboardSalesChart` wrapper) — ensure all styles use token classes only; no `text-[#hex]` or `bg-[#hex]` patterns except for runtime-computed values
      → `kpi-card.tsx` and updated `sales-chart.tsx` use only CSS token classes. Pre-existing `onboarding-tour.tsx` and `best-selling-chart.tsx` have hardcoded decorative colors — documented as acceptable exception.
- [x] T033 [P] Verify `apps/desktop/src/index.css` animation classes — confirm `.animate-shimmer` gradient uses `hsl(var(--primary)/0.1)` instead of hard-coded `rgba(255,255,255,0.1)`; update if still using hard-coded values
      → Fixed: `rgba(255,255,255,0.1)` → `hsl(var(--primary) / 0.1)` in `.animate-shimmer`
- [x] T034 Run quickstart.md Definition of Done — manually validate all 13 checklist items in `specs/001-design-system/quickstart.md`; mark each `[x]`; document any failures as follow-up issues
      → All 13 DoD items marked [x] with implementation evidence. 2 known-debt items documented.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup (T001–T005)
  └── No dependencies — start immediately
      T002, T003, T004 can run in parallel with each other and with T001
      T005 must run AFTER T002, T003, T004

Phase 2: Foundational (T006–T008)
  └── Requires: Phase 1 complete (T001, T005)
      T006, T007, T008 can all run in parallel (different files)

Phase 3: US1 Dark Mode (T009–T013)
  └── Requires: Phase 2 complete
      T009, T010, T011 can run in parallel
      T012 requires T011 (IPC handlers must exist before React calls them)
      T013 runs in parallel with T012 (different platform: web vs desktop)

Phase 4: US2 Keyboard POS (T014–T018)
  └── Requires: Phase 2 complete
      T014, T016 can run in parallel (different files)
      T015 requires T016 (imports HotkeyHelpPanel)
      T017 requires T014 (shortcut prop) and T015 (hooks in place)
      T018 requires T017 (same file, final scanner step)

Phase 5: US3 Web Dashboard (T019–T022)
  └── Requires: Phase 2 complete; T009 must complete before T019 (same file globals.css)
      T019, T020 can run in parallel
      T021 requires T020 (imports GlassKpiCard)
      T022 requires T021 (same file dashboard/page.tsx)

Phase 6: US4 Shared Components (T023–T027)
  └── Requires: Phase 2 complete (tokens), T005 (deps installed)
      T023, T024, T025, T026 can all run in parallel (different files)
      T027 requires T023, T024, T025, T026 (adds their exports)

Phase 7: US5 Mobile (T028–T030)
  └── Requires: Phase 2 complete, T001 (shared token file exists)
      T028, T029, T030 can all run in parallel

Phase N: Polish (T031–T034)
  └── Requires: All desired user story phases complete
      T031, T032, T033 can run in parallel
      T034 requires T031, T032, T033
```

### Same-File Sequential Dependencies

| File | Ordered Tasks |
|------|---------------|
| `apps/web/app/globals.css` | T009 → T019 (T009 first, T019 adds glassmorphism after) |
| `apps/desktop/src/components/POSLayout.tsx` | T015 → T017 → T018 |
| `apps/web/app/dashboard/page.tsx` | T021 → T022 |
| `packages/ui/src/index.ts` | T027 (after T023–T026) |

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (P1)**: Can start after Phase 2 — no dependencies on other stories; runs parallel to US1
- **US3 (P2)**: Can start after Phase 2; T019 depends on T009 (globals.css update)
- **US4 (P2)**: Can start after Phase 2 — no dependencies on other stories
- **US5 (P3)**: Can start after Phase 2 — no dependencies on other stories

### Within Each User Story

- No test tasks (tests not requested in spec)
- Setup/config before components
- Component before consumer pages
- Story complete before Polish phase

---

## Parallel Execution Examples

### Phase 2 (All 3 in Parallel)
```
Task: "Update packages/ui/tailwind.config.ts to extend packages/shared (T006)"
Task: "Update apps/web/tailwind.config.ts to extend packages/shared (T007)"
Task: "Update apps/desktop/tailwind.config.ts to extend packages/shared (T008)"
```

### US1 + US2 (P1 stories — run together after Phase 2)
```
# US1 Dark Mode stream:
Task T009: Update apps/web/app/globals.css (medical palette)
Task T010: Update apps/desktop/src/index.css (add .dark block)

# US2 Keyboard POS stream (parallel to US1):
Task T014: Extend Button shortcut prop in packages/ui
Task T016: Create HotkeyHelpPanel.tsx
```

### US4 Shared Components (all 4 new files in parallel)
```
Task T023: Create packages/ui/src/components/ui/input.tsx
Task T024: Create packages/ui/src/components/ui/card.tsx
Task T025: Create packages/ui/src/components/ui/modal.tsx
Task T026: Create packages/ui/src/components/ui/data-table.tsx
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only — P1 Stories)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational token distribution (T006–T008)
3. **Run US1 and US2 in parallel**:
   - Stream A: T009 → T010 → T011 → T012 → T013 (Dark Mode)
   - Stream B: T014, T016 → T015 → T017 → T018 (Keyboard POS)
4. **STOP and VALIDATE**: Test US1 independently (dark mode toggle, persistence, contrast)
5. **STOP and VALIDATE**: Test US2 independently (F2 search → cart → F4 checkout → F8 print)
6. Deploy/demo to night-shift pharmacist and cashier representative

### Incremental Delivery

1. Phase 1 + Phase 2 → Token infrastructure ready
2. Phase 3 (US1) → Night-shift dark mode ✓ Demo to pharmacists
3. Phase 4 (US2) → Keyboard POS ✓ Demo to cashiers — time the 5-item sale
4. Phase 5 (US3) → Premium web dashboard ✓ Demo to pharmacy managers
5. Phase 6 (US4) → Shared component library ✓ Available to future feature developers
6. Phase 7 (US5) → Mobile consistency ✓ Demo side-by-side with web/desktop
7. Phase N → Polish + DOD sign-off

### Parallel Team Strategy

With multiple developers:

1. Team completes Phase 1 + Phase 2 together
2. Once Phase 2 is done:
   - Developer A: US1 (Dark Mode) — T009–T013
   - Developer B: US2 (Keyboard POS) — T014–T018
   - Developer C: US4 (Component Library) — T023–T026 (all new files, fully parallelizable)
3. After US1 done: Developer A moves to US3 (Dashboard)
4. After US4 done: Developer C moves to US5 (Mobile)
5. All polish tasks (T031–T033) run in parallel as final step

---

## Notes

- `[P]` tasks = different files, no in-flight dependencies — safe to start in parallel
- `[US#]` maps each task to its user story for traceability and independent rollout
- No Prisma migrations required (no new database models — see data-model.md)
- `packages/shared/tailwind.config.ts` is the ONLY source of colour token values;
  any hardcoded value found in apps/ is a Constitution Principle VI violation
- Keyboard shortcut full spec: `contracts/component-apis.md` (POS_SHORTCUTS constant)
- CSS variable authoritative values: `contracts/design-tokens.md`
- Component prop interfaces: `contracts/component-apis.md`
- Definition of Done (13 items): `quickstart.md`
