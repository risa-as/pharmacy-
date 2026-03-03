# Feature Specification: Global UI & Dark Mode Standardization

**Feature Branch**: `002-ui-standardization`
**Created**: 2026-02-23
**Status**: Draft
**Input**: Apply the semantic design-token system established in Phase 1 (T001–T034) across ALL
pages in the web dashboard, desktop app, and shared components. Remove every hardcoded color
and replace with semantic CSS variable tokens. Apply glass-card styling to main page containers
to match the premium Dashboard aesthetic.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Night-Shift Pharmacist: Full Dark Mode Across All Pages (Priority: P1)

Ahmed works the overnight shift and enabled Dark Mode during Phase 1. However, when he
navigates to the Inventory page, Suppliers page, or any non-dashboard section, the background
reverts to white and text appears in hardcoded dark gray. The dark mode toggle is broken for
any page outside the main dashboard. This causes eye strain and breaks his trust in the feature.

After this phase, every single page — login, inventory, suppliers, reports, purchases, debts,
discounts, patients, prescriptions, users, settings — inherits dark mode seamlessly. No
page is left behind.

**Why this priority**: Dark mode was already committed to users in Phase 1. Any screen that
reverts to white in dark mode is a regression. This is the most visible and impactful defect
to fix. All other visual polish is secondary to correctness of the already-shipped feature.

**Independent Test**: With dark mode active, navigate through every item in the web sidebar
and every desktop app tab. Every page must show a dark background with light text. Zero
white or light-gray screens in dark mode.

**Acceptance Scenarios**:

1. **Given** Dark Mode is enabled on the Web Dashboard, **When** the user navigates to any
   dashboard sub-page (inventory, reports, suppliers, purchases, discounts, etc.), **Then**
   every element uses the dark palette — no white backgrounds, no broken contrast.
2. **Given** Dark Mode is enabled on the Desktop app, **When** the user switches between
   DashboardPage, InventoryPage, SettingsPage, and LoginScreen, **Then** each page uses
   the dark palette with no hardcoded white or gray backgrounds visible.
3. **Given** Dark Mode is enabled, **When** the user opens a form modal or confirmation dialog,
   **Then** the modal background uses the dark card token — not a hardcoded white — and all
   text inside is readable with sufficient contrast.
4. **Given** Dark Mode is enabled on the Web app, **When** the sidebar is visible, **Then**
   the sidebar uses semantic background tokens, the active nav item uses the primary accent
   tone, and hover states use the muted background token — not hardcoded blue or gray classes.

---

### User Story 2 — Pharmacy Manager: Premium Glassmorphism Across All Pages (Priority: P2)

Khalid praised the premium look of the main Dashboard after Phase 1. But when he navigates
to the Inventory page, Suppliers page, or Purchases page for his daily review, the page
reverts to a flat white card with gray borders — looking like a completely different product.

After this phase, every major page in the web dashboard has the glass-card container that
provides the same frosted-glass depth as the Dashboard. The experience is visually consistent
from first click to last, reinforcing the premium brand on every screen Khalid uses for
his daily work.

**Why this priority**: Visual consistency reinforces brand quality and professional trust.
After Phase 1 set the premium bar on the Dashboard, leaving other pages visually inconsistent
undercuts the investment. This directly affects manager-facing screens used daily for
business decisions.

**Independent Test**: Open the web app and navigate to six different dashboard pages (e.g.,
inventory, suppliers, reports, purchases, patients, users). Each page's main container must
show the glass-card frosted effect — not a flat white card. Compare side-by-side with the
Phase 1 Dashboard to confirm visual parity.

**Acceptance Scenarios**:

1. **Given** a manager opens any web dashboard page, **When** the page loads, **Then** the
   main page container displays the frosted-glass appearance consistent with the Dashboard
   page established in Phase 1.
2. **Given** the glass-card effect is applied to all pages, **When** the manager switches
   between Light Mode and Dark Mode, **Then** the glass-card appearance adapts correctly in
   both modes with no visual glitches or broken contrast.
3. **Given** a page uses a data table inside a glass-card container, **When** the table
   renders, **Then** the table surface remains readable against the glass-card background
   in both light and dark mode.

---

### User Story 3 — Developer: Zero Hardcoded-Color Violations Across All Migrated Files (Priority: P2)

A developer adding a new feature to the codebase uses existing component files as templates.
If those files contain `bg-white`, `text-gray-900`, and `border-gray-200`, the new feature
will naturally copy those patterns — perpetuating the violation.

After this phase, every audited file uses only semantic tokens. The codebase is a clean
reference for future development. Any new page built by copying an existing page automatically
inherits dark-mode correctness and design-system compliance.

**Why this priority**: Clean source files prevent future regressions. Residual violations in
shared UI components (like delete buttons or form inputs) propagate into every form and modal
built using them — making them the highest-leverage files to fix.

**Independent Test**: Run a search across all `.tsx` files in the audited directories for the
patterns `bg-white`, `bg-gray-`, `text-gray-`, `border-gray-`, and inline hex values. Zero
matches must be returned after this phase is complete (excluding documented exceptions).

**Acceptance Scenarios**:

1. **Given** any shared UI component in the web UI directory is rendered, **When** dark mode
   is active, **Then** the component correctly inherits the dark palette — confirming all
   shared components use only semantic tokens.
2. **Given** the Desktop login screen contains inline hex gradients, **When** this phase is
   complete, **Then** the gradient is expressed via a named CSS custom property defined in
   the app's CSS file, and resolves correctly in both light and dark mode.
3. **Given** a new developer references any existing page file as a template, **When** they
   copy its styling classes verbatim, **Then** the resulting page is automatically dark-mode
   correct and design-system compliant because no hardcoded values remain.

---

### Edge Cases

- What happens to status badge colors (e.g., "Low Stock" in red, "Expiring" in amber) still
  using hardcoded palette classes? These must migrate to semantic destructive/warning/success
  tokens — not removed, as they carry meaning.
- How are inline hex gradients on the login and landing pages handled? They must be moved to
  named CSS custom properties so the gradient can be referenced without raw hex in markup.
- What about print stylesheets? `InvoicePrint.tsx` and any `@media print` block may retain
  absolute black/white as those are correct for paper output — this is an explicit exception.
- What happens when a button uses `text-white` over a colored background (e.g., a red delete
  button)? The correct token is `text-destructive-foreground`, not `text-white`, to ensure
  correct contrast in all theme variants.
- What happens when a page component has already been written using semantic tokens (added
  after Phase 1)? It should be verified as already compliant and marked as no change needed
  — not blindly modified.

---

## Platform & Offline Scope

- **Web** (`apps/web`): Online-only dashboard. This phase is a pure Tailwind class-name
  substitution — no network calls, no API changes. All semantic tokens are already defined
  in `globals.css` from Phase 1.
- **Desktop** (`apps/desktop`): Fully offline-capable — unchanged by this phase, as it is
  CSS-only. Dark mode preference is already persisted from Phase 1. This phase only updates
  Tailwind class names in `.tsx` files and moves one gradient to CSS variables in `index.css`.
- **Mobile** (`apps/mobile`): Out of scope for this phase. Mobile token migration was
  completed in Phase 1 (T031).
- **Synced entities**: None. No Prisma models, database schema, or API routes are touched.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Web Dashboard — Semantic Token Migration

- **FR-001**: Every `.tsx` file in `apps/web/app/dashboard/` and `apps/web/app/ui/` MUST
  replace `bg-white` and `bg-gray-50` with `bg-background` or `bg-card` as semantically
  appropriate (card surfaces use `bg-card`, page backgrounds use `bg-background`).
- **FR-002**: Every `.tsx` file in those directories MUST replace `text-gray-900` with
  `text-foreground` and `text-gray-400` / `text-gray-500` / `text-gray-600` with
  `text-muted-foreground`.
- **FR-003**: Every `.tsx` file in those directories MUST replace `border-gray-200`,
  `border-gray-100`, and `border-slate-*` with `border-border`.
- **FR-004**: Hardcoded semantic-color classes in `apps/web/app/ui/` MUST be replaced with
  the corresponding semantic tokens: brand blues → `bg-primary`/`text-primary`, error reds →
  `bg-destructive`/`text-destructive`, warnings → `bg-warning`/`text-warning`, success →
  `bg-success`/`text-success`.
- **FR-005**: The web sidebar (`apps/web/app/ui/dashboard/sidenav.tsx`) MUST use semantic
  tokens for all backgrounds, borders, active states, and hover states. Active nav items
  MUST use `bg-primary/10 text-primary`; hover MUST use `hover:bg-muted`.
- **FR-006**: Inline hex gradient values in `apps/web/app/login/page.tsx` and
  `apps/web/app/page.tsx` MUST be moved to named CSS custom properties in
  `apps/web/app/globals.css`.

#### Web Dashboard — Glass-Card Application

- **FR-007**: The main page container `<div>` in every `apps/web/app/dashboard/**/page.tsx`
  MUST have the `glass-card` CSS class applied (in addition to any existing layout classes).
- **FR-008**: Glass-card pages MUST remain fully usable in both Light and Dark Mode with no
  visual glitches, relying on the existing `@supports` fallback from Phase 1.

#### Desktop App — Semantic Token Migration

- **FR-009**: `apps/desktop/src/components/DashboardPage.tsx` MUST replace all `bg-gray-*`,
  `bg-white`, `border-gray-*`, `text-gray-*`, and hardcoded accent colors with semantic
  tokens. Status indicators MUST use `bg-primary`, `bg-success`, `bg-warning`, `bg-destructive`.
- **FR-010**: `apps/desktop/src/components/SettingsPage.tsx` MUST replace its gradient
  background and all hardcoded neutrals and accent colors with semantic tokens.
- **FR-011**: `apps/desktop/src/components/InventoryPage.tsx` MUST replace all hardcoded
  neutral and accent colors with semantic tokens.
- **FR-012**: `apps/desktop/src/components/LoginScreen.tsx` MUST replace inline hex gradients
  with named CSS custom properties in `apps/desktop/src/index.css`, and replace all
  `bg-white` / `text-gray-*` / `border-gray-*` with semantic tokens.
- **FR-013**: Lower-impact desktop files (`POSLayout.tsx`, `HotkeyHelpPanel.tsx`,
  `SyncHealthDashboard.tsx`) MUST have their status badge and indicator colors migrated to
  semantic tokens.

### Technical Constraints

- **TC-001**: No new CSS classes may be introduced — only existing token classes from
  `packages/shared/tailwind.config.ts` and the CSS variables already in `globals.css` /
  `index.css` are permitted.
- **TC-002**: Inline `style={{}}` props are PROHIBITED for any color value expressible as
  a Tailwind token class (Constitution Principle VI).
- **TC-003**: Exception: `apps/desktop/src/components/InvoicePrint.tsx` and any
  `@media print` rule may retain `bg-white text-black` for paper-output correctness.
- **TC-004**: All changes are class-name and CSS-property substitutions only — no component
  logic, no API calls, no Prisma schema changes.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A search for `bg-white` across all `.tsx` files in the audited directories
  returns zero matches (excluding `@media print` blocks).
- **SC-002**: A search for `text-gray-`, `bg-gray-`, `border-gray-`, `bg-slate-` across the
  same scope returns zero matches.
- **SC-003**: A search for hardcoded palette classes (`bg-blue-`, `bg-red-`, `bg-amber-`,
  `bg-emerald-`, `bg-green-`, `bg-orange-`) across the same scope returns zero matches
  outside of documented exception files.
- **SC-004**: A search for inline hex Tailwind values (`bg-[#`, `text-[#`) across the same
  scope returns zero matches — all hex values are moved to CSS custom properties.
- **SC-005**: With dark mode active, a visual walkthrough of all web dashboard pages and all
  desktop app pages shows zero white or light-gray backgrounds — every surface uses the
  dark palette.
- **SC-006**: All web dashboard pages render with a visible glass-card effect on their main
  container — verifiable by loading each page in a browser and confirming the frosted
  appearance matches the Dashboard page from Phase 1.
- **SC-007**: Switching between Light Mode and Dark Mode while on any migrated page produces
  an instant, correct transition with no broken-contrast elements — verifiable by toggling
  the theme on each page and visually inspecting.

---

## Assumptions

- The `.glass-card` CSS class is already defined in `apps/web/app/globals.css` (from T019 in
  Phase 1) with both `@supports` and fallback variants. No new CSS authoring is required for
  the glass-card application tasks.
- The semantic token CSS custom properties (`--primary`, `--destructive`, `--warning`,
  `--success`, `--border`, `--card`, etc.) are already defined in `globals.css` and
  `index.css` from Phase 1 (T009 and T010). Only class-name substitutions in `.tsx` files
  are needed.
- The inline hex gradients (`#0f0c29`, `#302b63`, `#24243e`) represent a dark-purple auth
  gradient used on the login and landing pages. These values will be preserved visually —
  this is a token migration, not a redesign.
- `InvoicePrint.tsx` is explicitly excluded from token migration for `@media print`-scoped
  styles, as print output requires absolute black/white for paper rendering.
- Dashboard sub-pages that were newly written after Phase 1 may already use semantic tokens.
  Each file should be verified before modification — no-change files are valid outcomes.
- Web UI component files under `apps/web/app/ui/` (e.g., `delete-button.tsx`,
  `submit-button.tsx`, `login-form.tsx`) are shared across all dashboard forms and modals.
  Migrating these delivers the highest leverage: one fix propagates to all consumers.