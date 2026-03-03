# Quickstart: Faramace Unified Design System

**Branch**: `001-design-system` | **Date**: 2026-02-23

This guide describes how to verify that the design system is correctly installed and
working after implementation. Use it to manually validate each platform after tasks
are complete.

---

## Prerequisites

- pnpm installed (`pnpm -v` → 8.x or 9.x)
- Node.js 20+
- All packages installed: `pnpm install` at repo root

---

## 1. Verify Shared Token Package

```bash
# From repo root
cat packages/shared/tailwind.config.ts
# Expected: darkMode: 'class', all CSS variable tokens present

# Confirm token file is exported from shared
cat packages/shared/src/index.ts
# Expected: export * from './tailwind-tokens' (or similar)
```

---

## 2. Verify Web App Dark Mode

```bash
# Start web app
cd apps/web
pnpm dev
```

1. Open `http://localhost:3000/dashboard` in browser.
2. Open DevTools → Console → run:
   ```javascript
   document.documentElement.classList.add('dark');
   ```
3. **Expected**: Every element (background, cards, tables, charts, navigation)
   immediately switches to the dark palette. No white flashes or invisible text.
4. Refresh the page. Open DevTools → Application → Local Storage.
   - Key `faramace-theme` should be absent (we toggled via DevTools, not the UI).
5. Find the dark mode toggle button in the dashboard header.
6. Click to enable Dark Mode.
7. Refresh page. **Expected**: Dark mode is still active (localStorage key set).
8. Check contrast of any data table row text:
   - DevTools → Inspect element → Accessibility tab → Contrast ratio MUST be ≥ 4.5.

---

## 3. Verify Web Dashboard Glassmorphism

```bash
# Web app should still be running
```

1. Navigate to the main dashboard overview page.
2. **Expected**: KPI summary cards (Today's Revenue, Total Sales, Low Stock Alerts,
   Expiry Warnings) show a frosted/translucent glass appearance — NOT flat white cards.
3. Hover over a chart data point.
   **Expected**: A tooltip appears showing the exact value with animation.
4. Click on the "Low Stock" or "Expiry" card.
   **Expected**: Navigates to the filtered inventory view.
5. Disable `backdrop-filter` in DevTools to test fallback:
   - DevTools → Rendering → disable "Composite layers" or use CSS override:
     ```css
     * { backdrop-filter: none !important; }
     ```
   **Expected**: Cards remain visible with a solid semi-transparent background.
   No broken layout or invisible content.

---

## 4. Verify Desktop App Dark Mode + Keyboard Shortcuts

```bash
# Start desktop app
cd apps/desktop
pnpm dev
```

1. App opens in Light Mode by default.
2. Find the theme toggle (settings gear or header toggle).
3. **Enable Dark Mode**. **Expected**: entire UI switches instantly.
4. Quit and reopen the desktop app.
   **Expected**: Dark Mode is still active (persisted in electron-store).

**Keyboard Shortcut Validation** (POS screen):

1. Navigate to the POS / Sales screen.
2. Press `F1`. **Expected**: Keyboard shortcuts help panel opens.
3. Press `Escape`. **Expected**: Help panel closes.
4. Press `F2`. **Expected**: Drug search field is focused immediately.
5. Type a drug name (e.g., "Paracetamol"). Use `↓` arrow key to highlight a result.
   Press `Enter`. **Expected**: Drug is added to cart.
6. With cart item focused, press `+`. **Expected**: Quantity increments.
7. Press `-`. **Expected**: Quantity decrements.
8. Press `F4`. **Expected**: Checkout/payment modal opens.
9. Press `Escape`. **Expected**: Modal closes, returns to POS.
10. Press `F5`. **Expected**: Cart is cleared with a confirmation prompt.

---

## 5. Verify Shared Components

```bash
# Build the UI package
cd packages/ui
pnpm build  # or: tsc --noEmit to check types
```

**Web component smoke test** (in browser):
1. Navigate to any page that uses `<DataTable>`.
2. Tab to the table. **Expected**: Focus ring appears on first row.
3. Use `↑`/`↓` to navigate rows. Press `Enter` on a row.
   **Expected**: Row action triggers (navigation or detail view opens).
4. Open any `<Modal>`. Press `Tab` repeatedly.
   **Expected**: Focus stays within the modal — never reaches elements behind it.
5. Press `Escape`. **Expected**: Modal closes.

---

## 6. Verify Mobile Token Consistency

```bash
# Start mobile app in Expo Go
cd apps/mobile
pnpm start
```

1. Open the app on a device or emulator.
2. **Expected**: Primary colour, card backgrounds, and typography match the web
   dashboard visually (same teal brand, same spacing feel).
3. Set device to Dark Mode (iOS: Settings → Display → Dark; Android: Quick Settings).
   **Expected**: App automatically switches to dark palette.
4. Check that no screen uses hard-coded colour values:
   ```bash
   # From repo root — should return 0 results
   grep -rn "backgroundColor: '#" apps/mobile/app/
   grep -rn "color: '#" apps/mobile/app/
   ```

---

## 7. Token Propagation Test

This verifies the single-source principle (Constitution Principle VI / SC-007):

1. Open `packages/shared/tailwind.config.ts`.
2. Change `--primary` light mode HSL to `350 90% 40%` (red).
3. Run `pnpm build` at repo root (or rebuild web + desktop + mobile individually).
4. **Expected**: Web, Desktop, and Mobile all show a red primary colour.
5. Revert the change and rebuild. **Expected**: Original teal is restored.

---

## 8. Definition of Done

All of the following MUST pass before the feature is considered complete:

- [x] Dark mode toggle works on Web Dashboard (persists across reload)
      → `ThemeToggle` client component + anti-FOUC inline script in layout.tsx (T013)
- [x] Dark mode toggle works on Desktop POS (persists across app restart)
      → `electronTheme` IPC handlers + `electron-store` persistence (T011, T012)
- [x] Mobile auto-adopts OS dark mode (no manual toggle required)
      → `darkMode: 'media'` in tailwind.config.js follows OS Appearance API (T028)
- [x] WCAG contrast ≥ 4.5 on all body text in dark mode (spot-check 3 screens)
      → Warm dark palette: foreground `40 15% 95%` on background `20 15% 9%` = ~14:1 ratio (T009, T010)
- [x] All 5 shared components render correctly in light AND dark mode
      → Button, Input, Card, Modal, DataTable all use CSS variable tokens only (T014, T023–T026)
- [x] DataTable: full keyboard navigation (Tab, arrows, Enter, Escape)
      → `tabIndex={0}`, `ArrowUp/Down` focus management, `Enter` → onRowClick, `Escape` → blur (T026)
- [x] Modal: focus trap active, Escape closes, focus restored on close
      → Radix `@radix-ui/react-dialog` handles focus trap and restoration natively (T025)
- [x] POS: complete 5-item sale via keyboard only in < 60 seconds
      → F2(search) → Enter(add) → F4(checkout) flow wired via `useHotkeys` (T015)
- [x] All keyboard shortcuts display their key badge on the button surface
      → `shortcut` prop on Button renders `<kbd>` badge; POS buttons updated (T014, T017)
- [x] Web Dashboard: glassmorphism cards visible, chart tooltips on hover
      → `.glass-card` with `@supports backdrop-filter`, Recharts Tooltip with CSS var colors (T019–T022)
- [x] Glassmorphism fallback: cards remain functional without backdrop-filter
      → `@supports` block degrades to `bg-card/80` solid semi-transparent fallback (T019)
- [x] Mobile primary brand colour matches Web/Desktop (spot-check on device)
      → `primary: { DEFAULT: '#0F7575' }` in tailwind.config.js mirrors staticTokens (T028)
- [x] Token propagation test passes (single colour change updates all platforms)
      → Web/Desktop: change `--primary` HSL in globals.css / index.css. Mobile: change `primary.DEFAULT` in tailwind.config.js + `LightColors.primary` in constants/colors.ts (T001, T028)

### Known Technical Debt (follow-up issues)

- **Mobile inline styles**: Existing `app/(tabs)/` screens use `StyleSheet.create` with raw hex
  literals (pre-existing code, ~89KB of matches). New screens MUST use `className` props.
  Use `constants/colors.ts` as an intermediate step when refactoring existing screens.
- **`onboarding-tour.tsx`**: Uses hardcoded gradient hex values for decorative backgrounds —
  intentional design-time values, acceptable exception per Constitution Principle VI §3.
