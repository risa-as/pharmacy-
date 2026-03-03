# Feature Specification: Faramace Unified Design System

**Feature Branch**: `001-design-system`
**Created**: 2026-02-23
**Status**: Draft
**Input**: Unified UI/UX redesign to make Faramace the #1 pharmacy system in Iraq — premium
medical theme, dark mode, keyboard-first POS, glassmorphism web dashboard, shared component
library, NativeWind mobile architecture.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Night-Shift Pharmacist: Eye-Friendly Dark Mode (Priority: P1)

Ahmed is a pharmacist who works the overnight shift (10 PM – 6 AM) at a busy Baghdad
pharmacy. He currently uses Faramace on both the Web Dashboard and the Desktop POS under
harsh fluorescent lighting. After 4 hours of work, his eyes become fatigued from the bright
white interface, causing headaches and errors when reading drug names and dosages.

With the new Dark Mode, Ahmed can switch the entire interface — every screen, modal, table,
and chart — to a low-luminance, blue-light-reduced palette. The switch persists across
sessions so he never has to re-enable it each night.

**Why this priority**: Night-shift work is a documented high-risk period for pharmacy errors.
Eye fatigue directly increases dispensing mistakes. Pharmacist welfare and error reduction
make this the most impactful single change for user health and safety. Competitor systems
offer no dark mode at all.

**Independent Test**: Dark mode can be fully validated by switching the UI theme on the Web
Dashboard and Desktop POS independently and confirming every element adopts the low-luminance
palette without broken contrast or invisible text.

**Acceptance Scenarios**:

1. **Given** a pharmacist is logged in during a night shift, **When** they enable Dark Mode
   from any settings or quick-toggle control, **Then** every visible element — backgrounds,
   text, tables, modals, charts, and form inputs — immediately switches to the dark palette
   with no page reload required.
2. **Given** a pharmacist has previously enabled Dark Mode, **When** they close and reopen
   the application (web browser or desktop app), **Then** Dark Mode is automatically active
   without any manual re-selection.
3. **Given** Dark Mode is active, **When** the pharmacist reads drug names, expiry dates, and
   quantity values in the DataTable, **Then** all text meets a minimum contrast ratio that
   makes values clearly distinguishable under typical night-shift lighting.
4. **Given** a pharmacist is on the Desktop POS in Dark Mode, **When** they switch to the Web
   Dashboard in the same session, **Then** the same dark palette and design language is
   present, reinforcing a consistent visual experience.

---

### User Story 2 — Cashier: Keyboard-First Desktop POS (Priority: P1)

Fatima is a pharmacy cashier at a high-traffic branch in Mosul. She processes 80–120
transactions per day. Currently, every sale requires her to reach for the mouse to select
drugs, enter quantities, apply discounts, and confirm payment. Each mouse-reach costs 2–3
seconds; over a shift, this adds up to 15+ minutes of wasted time and physical fatigue.

With the Keyboard-First POS redesign, Fatima can complete an entire sale — search drug,
add to cart, set quantity, apply discount, select payment method, and print receipt — using
only the keyboard. Every critical action has a documented shortcut shown on screen.

**Why this priority**: The Desktop POS is Faramace's primary revenue-generating screen and
is in use for the entire working day. Keyboard-first operation directly translates to more
sales per hour, reduced staff fatigue, and a decisive competitive advantage over legacy
systems where cashiers must switch between keyboard and mouse for every transaction.

**Independent Test**: A cashier can complete a 5-item sale with a discount and print a
receipt within 60 seconds using only the keyboard, with zero mouse interaction.

**Acceptance Scenarios**:

1. **Given** the POS screen is focused, **When** the cashier presses the drug-search shortcut,
   **Then** the search field is immediately focused and ready for input without mouse
   interaction.
2. **Given** search results are displayed, **When** the cashier uses arrow keys to navigate
   the result list and presses Enter/Tab, **Then** the selected drug is added to the current
   sale cart.
3. **Given** a drug is in the cart, **When** the cashier uses the quantity shortcut and types
   a number, **Then** the cart quantity updates instantly and the cursor returns to search for
   the next item.
4. **Given** the cart is ready, **When** the cashier presses the checkout shortcut, **Then**
   the payment modal opens with the default payment method pre-selected so confirmation
   requires a single keystroke.
5. **Given** a keyboard shortcut is available for any primary action, **Then** that shortcut
   is visibly displayed on the UI element (button label or tooltip) so no memorisation is
   required.
6. **Given** the cashier uses a barcode scanner, **When** a barcode is scanned, **Then** the
   drug is added to the cart in one step, exactly as if the shortcut key search path had been
   followed.

---

### User Story 3 — Pharmacy Manager: Premium Web Dashboard (Priority: P2)

Khalid is a pharmacy chain manager who reviews branch performance every morning via the Web
Dashboard on his laptop. Currently the dashboard displays plain tables and basic bar charts
that feel outdated compared to modern business software. He struggles to quickly spot
low-stock items, expiring drugs, and daily revenue trends because the data is dense and
visually undifferentiated.

With the redesigned dashboard, Khalid sees a clean, visually premium interface with
glassmorphism-styled cards for key metrics, interactive charts that respond to hover and
drill-down, and clear colour-coded status indicators. The interface feels modern and
trustworthy — suitable for presenting to pharmacy union representatives or investors.

**Why this priority**: The web dashboard is the face of Faramace to decision-makers and
prospects. Its visual quality directly influences purchase decisions and the perception of
system quality. A superior dashboard is a primary marketing asset and conversion driver.

**Independent Test**: The redesigned dashboard can be validated independently by loading it
in a browser and verifying: all metric cards display with frosted-glass styling, at least one
chart responds to hover interaction, and the layout renders cleanly at 1280×800 and above.

**Acceptance Scenarios**:

1. **Given** a manager opens the dashboard, **When** the page loads, **Then** key metric
   cards (today's revenue, total sales, low-stock alerts, expiry warnings) are prominently
   displayed in visually distinct glass-effect containers that stand out from the background.
2. **Given** metric cards are displayed, **When** the manager hovers over a revenue chart,
   **Then** an interactive tooltip shows the precise value for that data point without
   requiring a click.
3. **Given** a Low Stock or Expiry warning card is displayed, **When** the manager clicks on
   it, **Then** they are taken directly to the relevant inventory view filtered to the
   flagged items.
4. **Given** the manager is viewing the dashboard, **When** they switch between Light and
   Dark Mode, **Then** the glassmorphism cards, charts, and all visual elements adapt without
   visual glitches or broken contrast.

---

### User Story 4 — Developer / Implementer: Shared Component Library (Priority: P2)

A developer building a new feature for the Web Dashboard or Desktop POS currently duplicates
button, input, modal, and table implementations across both apps — leading to inconsistent
appearance, different keyboard behaviours, and double the maintenance burden. If the web
team changes the button style, the desktop app gets left behind.

With the shared component library in `packages/ui`, any developer implementing a new screen
imports the same `Button`, `Input`, `Card`, `Modal`, and `DataTable` components. Any style
or behaviour fix in the library propagates to both platforms simultaneously.

**Why this priority**: Without shared components, every future feature spec will re-specify
the same UI primitives. A shared library is the foundational investment that makes all future
features faster to implement and visually consistent.

**Independent Test**: An independent feature (e.g., a new report page on the web) can be
built exclusively using components from `packages/ui` with zero bespoke styling, and the
result matches the design system's visual language.

**Acceptance Scenarios**:

1. **Given** the shared library is installed, **When** a developer renders `<Button>`,
   `<Input>`, `<Card>`, `<Modal>`, and `<DataTable>` from the shared package, **Then**
   each component renders with the correct medical-theme colours, correct dark-mode
   appearance, and correct typography without any app-level style overrides required.
2. **Given** the `DataTable` component is used, **When** a keyboard user navigates the table
   rows with arrow keys and presses Enter on a row, **Then** the row action is triggered —
   meeting the keyboard-first requirement on the Desktop POS.
3. **Given** a design token (e.g., primary colour) is updated in the shared Tailwind config,
   **When** both Web and Desktop apps are rebuilt, **Then** the new colour is reflected across
   all instances of shared components without any manual per-app changes.
4. **Given** the `Modal` component is displayed, **When** the user presses Escape, **Then**
   the modal closes — this behaviour must be consistent on both platforms.

---

### User Story 5 — Mobile Pharmacist: Consistent Brand on Mobile (Priority: P3)

Sara is a pharmacy technician who uses the Faramace mobile app (Expo) on her phone to
check inventory and record sales while away from the desktop counter. Currently, the mobile
app uses different colours, different typography sizes, and different spacing conventions
than the desktop and web apps, making it feel like a different product entirely.

With the unified design token architecture, the mobile app shares the same primary palette,
typography scale, and spacing grid as the web and desktop interfaces — delivered via
NativeWind. Sara experiences a coherent Faramace brand whether she is on the desktop POS,
the web dashboard, or her mobile app.

**Why this priority**: Brand consistency builds trust and reduces cognitive load for staff
who switch between platforms. It is a P3 because the mobile app's functional gaps (audit
report: weak sync) are a higher priority; visual consistency is valuable but non-blocking.

**Independent Test**: The mobile app can be opened alongside the web dashboard; a colleague
unfamiliar with the codebase can confirm the colour palette, card style, and typography feel
like the same product family.

**Acceptance Scenarios**:

1. **Given** the shared design tokens are defined, **When** the mobile app is compiled and
   launched on a device, **Then** the primary brand colour, typography scale, and border
   radii match those of the Web Dashboard and Desktop POS.
2. **Given** the shared tokens include a dark-mode palette, **When** a mobile user's device
   OS is set to Dark Mode, **Then** the Faramace mobile app automatically adopts the dark
   palette without any manual toggle.
3. **Given** a spacing or colour token is updated in the shared config, **When** the mobile
   app is rebuilt, **Then** all NativeWind-styled screens reflect the updated token without
   individual file changes.

---

### Edge Cases

- What happens when a user's OS is set to Dark Mode but they have manually selected Light
  Mode inside the app — does the app preference override the OS preference?
  (Assumption: app-level preference takes priority and persists across sessions.)
- How does the glassmorphism effect degrade on low-end hardware that does not support
  `backdrop-filter`? The UI must remain fully usable with a graceful fallback to a solid
  card background.
- What happens when a keyboard shortcut conflicts with a browser or OS global shortcut
  (e.g., `Ctrl+P` for print vs. print receipt)? Conflicts must be documented and avoided
  where possible; where unavoidable, a non-conflicting alternative MUST be provided.
- What happens when a `DataTable` has 0 rows? The empty state must show a clear,
  appropriately styled "no data" message rather than a blank area or broken layout.
- What happens when the `Modal` is triggered on a small viewport (< 400px width)? The
  modal must scale to fit without overflow or loss of close affordance.

---

## Platform & Offline Scope

- **Web** (`apps/web`): Online-only for dashboard. The design system ships as static CSS
  tokens and React components; no network calls are required to render the design system
  itself. Dark mode preference is persisted in the user's browser/session.
- **Mobile** (`apps/mobile`): Dark mode follows OS system preference by default; user
  override is not required for P3 scope. NativeWind consumes shared Tailwind tokens
  compiled at build time — no runtime network dependency.
- **Desktop** (`apps/desktop`): MUST be fully offline-capable. Dark mode preference is
  persisted locally on-device (electron-store or equivalent). Keyboard shortcuts MUST work
  without any cloud connectivity. All shared components render from bundled assets.
- **Synced entities**: None. The Design System is a pure frontend/UI concern. No Prisma
  models or database migrations are introduced by this feature.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Design Tokens & Theming

- **FR-001**: The system MUST provide a unified design-token set (colours, typography scale,
  spacing grid, border radii, shadow levels) shared across all three platforms.
- **FR-002**: Every colour token MUST have a Light Mode value and a Dark Mode value.
  Dark Mode values MUST reduce luminance and blue-light emission relative to Light Mode
  equivalents to support eye comfort during night-shift use.
- **FR-003**: Dark Mode MUST be activatable by the user on the Web Dashboard and Desktop POS
  via a clearly visible control (toggle or menu item).
- **FR-004**: Dark Mode preference MUST persist across page reloads and app restarts on the
  platform where it was set, without requiring re-authentication.
- **FR-005**: On mobile, Dark Mode MUST automatically follow the device OS preference without
  requiring a manual in-app toggle (P3 scope).

#### Shared Component Library

- **FR-006**: The system MUST deliver five foundational shared UI components usable by both
  the Web and Desktop platforms: **Button**, **Input**, **Card**, **Modal**, **DataTable**.
- **FR-007**: Each shared component MUST support both Light and Dark Mode appearances
  automatically, driven by the active theme context.
- **FR-008**: The `DataTable` component MUST support full keyboard navigation (row
  selection via arrow keys, row action via Enter, exit focus via Escape).
- **FR-009**: The `Modal` component MUST close on Escape key press and MUST trap focus
  within the modal while open (no Tab escape to background elements).
- **FR-010**: The `Button` component MUST clearly display its associated keyboard shortcut
  (if one exists) as a visible badge or label on the button surface.
- **FR-011**: All shared components MUST render without any app-level style overrides being
  required; the shared Tailwind configuration MUST be sufficient.

#### Desktop POS Keyboard Navigation

- **FR-012**: Every primary action on the Desktop POS screen MUST be reachable via a
  keyboard shortcut. Primary actions include: open drug search, add to cart, adjust
  quantity, apply discount, open checkout, confirm payment, print receipt, and cancel sale.
- **FR-013**: All keyboard shortcuts MUST be displayed on the UI element they control (either
  as a visible label or on persistent hover tooltip) so that no memorisation is required.
- **FR-014**: The drug search field MUST be focusable from any state on the POS screen via
  a single shortcut key (e.g., `/` or `F2`).
- **FR-015**: Barcode scanner input MUST integrate seamlessly with the keyboard-first flow,
  producing identical behaviour to manually selecting a drug via keyboard search.
- **FR-016**: The POS screen MUST provide a visible, always-accessible keyboard shortcut
  reference panel or overlay (accessible via `?` or `F1`).

#### Web Dashboard Aesthetic

- **FR-017**: Metric summary cards on the Web Dashboard MUST use a layered, depth-conveying
  visual style (frosted/translucent surfaces over a gradient background) that distinguishes
  them visually from legacy flat-card designs.
- **FR-018**: All charts on the Web Dashboard MUST be interactive: hovering a data point
  MUST display a tooltip with the exact value; clicking a segment or bar MUST navigate to
  or filter the related data.
- **FR-019**: The Web Dashboard layout MUST be responsive and readable on viewports from
  1280px wide (standard pharmacy office monitor) upward.

#### Mobile Token Architecture

- **FR-020**: The mobile app MUST consume design tokens from the shared token source;
  no colour values, font sizes, or spacing values MUST be hard-coded in mobile component
  files.
- **FR-021**: The mobile build pipeline MUST resolve shared tokens at compile time so that
  no network request is required to apply the design system at runtime.

### Technical Constraints

- **TC-001**: Shared design tokens MUST live in `packages/shared`; no duplication of token
  definitions across `apps/*` is permitted (Constitution Principle VI).
- **TC-002**: The shared component library MUST live in `packages/ui` and be listed as a
  pnpm workspace dependency of `apps/web` and `apps/desktop`.
- **TC-003**: Mobile styling MUST use NativeWind as the TailwindCSS adapter; no alternative
  CSS-in-JS or React Native StyleSheet calls for design-system-covered values are permitted.
- **TC-004**: Inline `style={{}}` props are PROHIBITED in all shared components and in any
  screen that adopts the design system, except for runtime-computed dynamic values that
  cannot be expressed as Tailwind utilities (must be documented case-by-case).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A night-shift pharmacist can activate Dark Mode within 10 seconds of first
  looking for the option, using only on-screen affordances — no documentation required.
- **SC-002**: A trained cashier can complete a 5-item sale (search, add, quantity, discount,
  payment, receipt) on the Desktop POS in under 60 seconds using keyboard only, measured
  from the moment the first drug search begins.
- **SC-003**: In a usability test with 5 pharmacist-role participants, at least 4 of 5 rate
  the redesigned web dashboard as "visually superior" to the previous version when shown
  side-by-side.
- **SC-004**: All 5 shared components (`Button`, `Input`, `Card`, `Modal`, `DataTable`) pass
  automated accessibility checks for keyboard navigation and colour contrast in both Light
  and Dark Mode.
- **SC-005**: A developer building a new feature page can do so using only components from
  `packages/ui` with zero new bespoke CSS rules, as verified by code review.
- **SC-006**: Dark Mode text contrast meets a minimum 4.5:1 ratio for body text and 3:1 for
  large/bold text across all three platforms, measurable with a standard contrast-checking
  tool.
- **SC-007**: Updating a single design token (e.g., primary brand colour) in the shared
  package and rebuilding all apps results in the new colour appearing across all platforms,
  with zero manual per-app changes required — verifiable in under 5 minutes.
- **SC-008**: The mobile app's visual appearance (colour palette, card style, typography)
  is judged as belonging to the same product family as the web and desktop apps by
  3 out of 3 independent observers shown screenshots of all three platforms.

---

## Assumptions

- The existing TailwindCSS configuration files in each `apps/*` directory will be migrated
  to extend the shared base config; existing custom colours will be replaced by design
  tokens where they conflict.
- The chosen interactive charting library for the web dashboard will support both Light and
  Dark Mode theme props (specific library selection is deferred to the plan phase).
- "Glassmorphism" cards require `backdrop-filter: blur()` CSS support; browsers used in
  target pharmacy offices (Chrome 90+, Edge 90+) support this natively. A solid-background
  fallback is required for environments where it is unsupported.
- The shared `packages/ui` component library targets React DOM only (web + Electron renderer
  process); it does NOT target React Native. Mobile uses NativeWind-styled components that
  share tokens but not JSX component code.
- Keyboard shortcut scheme will be designed to avoid conflicts with Electron's built-in
  global shortcuts and common browser shortcuts; the exact key bindings are deferred to the
  plan phase.
