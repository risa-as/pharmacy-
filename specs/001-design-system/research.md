# Research: Faramace Unified Design System

**Branch**: `001-design-system` | **Date**: 2026-02-23
**Phase**: Phase 0 — Research & Decision Log

---

## Overview

This document records all architectural decisions, library selections, and technical
resolutions made during Phase 0 research. Every decision here resolves an open
question from the spec or the Technical Context section of the plan.

---

## D-01: Shared Tailwind Config Location

**Question**: Where should the canonical design token config live in the monorepo?

**Decision**: `packages/shared/tailwind.config.ts` is the base token config.
`packages/ui/tailwind.config.ts` extends it (component styles). Each app's
`tailwind.config.ts` also extends `packages/shared` as the single token source.

**Rationale**:
- `packages/shared` is the established shared-primitives package (types, Zod schemas).
  Design tokens are another kind of shared primitive.
- Separating the token config from `packages/ui` allows mobile (which cannot use DOM
  components) to import tokens without pulling in Radix/React DOM component code.
- `packages/ui` extends the shared config and adds component-level animation tokens.

**Alternatives Considered**:
- *Tokens in `packages/ui` only*: Rejected — mobile would be forced to depend on a DOM
  component package to get tokens, violating package boundary semantics.
- *Separate `packages/tokens` package*: Rejected — over-engineered for current scale;
  a file in `packages/shared` achieves the same result with less overhead.

**Existing State**:
- `packages/ui/tailwind.config.ts` exists but has an empty `theme.extend` — ready to
  be updated to extend `packages/shared`.
- `apps/web` and `apps/desktop` tailwind configs already reference
  `../../packages/ui/src/**` in their `content` arrays.
- `apps/mobile/tailwind.config.js` extends nothing and has an empty theme — needs
  NativeWind integration added.

---

## D-02: Dark Mode Strategy

**Question**: `class` strategy or `media` strategy in Tailwind?

**Decision**: `darkMode: 'class'` in the shared base config.

**Rationale**:
- Pharmacy staff work day and night shifts. A manual toggle must override the OS
  system preference for shift-specific comfort.
- `class` strategy applies dark mode when `<html class="dark">` is present, giving full
  programmatic control. This is already partially implemented in `apps/web/app/globals.css`
  (the `.dark { ... }` block exists).
- System preference (`prefers-color-scheme`) is respected on first load via JavaScript
  before a user has set an explicit preference.

**Implementation Pattern**:
```typescript
// Theme initialisation (runs before first paint, in <head>)
const theme = localStorage.getItem('faramace-theme')
  ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
if (theme === 'dark') document.documentElement.classList.add('dark');
```

**Alternatives Considered**:
- *`media` strategy*: Rejected — no user override possible; pharmacist working a day
  shift with dark OS can't revert to light mode.

---

## D-03: Desktop Dark Mode Persistence

**Question**: How is dark mode preference persisted on the Electron desktop?

**Decision**: Use `electron-store` (already imported as `store` in `electron/store.ts`)
to persist the preference under key `'theme'`.

**Rationale**:
- `electron-store` is already in use for application settings (confirmed from
  `apps/desktop/electron/main.ts` which imports `store` from `./store`).
- Consistent with Constitution Principle III: use the prescribed storage mechanism per
  platform. `electron-store` is the secure, structured config store for Electron.

**Implementation**:
```typescript
// Read on startup
const theme = store.get('theme', 'system'); // 'light' | 'dark' | 'system'
// Write on toggle
store.set('theme', newTheme);
```

---

## D-04: Interactive Charting Library

**Question**: Which chart library for Next.js web dashboard with dark mode + hover tooltips?

**Decision**: **Recharts** (`recharts@^2.x`)

**Rationale**:
- SVG-based (not canvas): tooltip text is selectable, accessible, and styleable via CSS
  variables — dark mode is trivial with CSS custom properties.
- Fully declarative React API: `<AreaChart>`, `<Tooltip>`, `<Legend>` map directly to
  the JSX component model already used throughout the codebase.
- Smooth hover interactions with custom `Tooltip contentStyle` that reads dark mode
  CSS variables dynamically.
- Widely used in the Next.js ecosystem; well-maintained (last release < 3 months).

**Bundle Impact**: ~80 KB gzipped for the core package — acceptable for a Next.js
dashboard where code-splitting per route is automatic.

**Alternatives Considered**:
- *Chart.js (+ react-chartjs-2)*: Canvas-based — dark mode requires manual re-render on
  theme switch; tooltip text is not selectable. Rejected.
- *Victory*: Heavier API, opinionated theming system. Better suited for data-science apps.
  Rejected.

---

## D-05: Keyboard Shortcut Library

**Question**: How to manage keyboard shortcuts in Electron renderer (React)?

**Decision**: **`react-hotkeys-hook`** for component-level shortcuts.
Electron's built-in `globalShortcut` remains for app-level (outside-window) shortcuts.

**Rationale**:
- Hook-based: `useHotkeys('f2', handler)` — natural fit for React function components.
- Automatic cleanup on unmount prevents memory leaks in Electron's renderer process.
- Supports scoped shortcut contexts (critical for POS: search mode vs. checkout mode
  need different active shortcut sets).
- The `enabled` option allows shortcuts to be conditionally active (e.g., disable
  F2-search when a modal is open).

**Alternatives Considered**:
- *`hotkeys-js`*: Global, callback-based. No React lifecycle integration → manual cleanup
  required on every component. Rejected.
- *Native `addEventListener`*: Full control but verbose, error-prone cleanup, no scope
  management. Rejected for component-level; acceptable for app bootstrap.

---

## D-06: Glassmorphism Fallback

**Question**: What happens when `backdrop-filter` is unsupported?

**Decision**: Progressive enhancement with `@supports (backdrop-filter: blur(0))`.
Base style uses a solid semi-transparent background; blur is layered on when supported.

**CSS Pattern**:
```css
.glass {
  background: hsl(var(--card) / 0.8); /* solid fallback */
}
@supports (backdrop-filter: blur(0)) {
  .glass {
    background: hsl(var(--card) / 0.15);
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
  }
}
```

**Browser Coverage**: Chrome 76+, Safari 9+, Firefox 103+, Edge 79+ support
`backdrop-filter`. Target pharmacy environments (Chrome 90+ per audit) are fully covered.

---

## D-07: Medical Colour Palette

**Question**: What colour values serve night-shift pharmacists with eye-friendly dark mode?

**Decision**: Medical teal brand with warm dark backgrounds.

**Selected Values**:

| Token | Light Mode | Dark Mode | Purpose |
|-------|-----------|-----------|---------|
| `--primary` | `177 90% 30%` (HSL) | `177 65% 42%` | Brand / interactive |
| `--background` | `40 20% 98%` | `20 15% 9%` | Page background |
| `--card` | `0 0% 100%` | `20 12% 13%` | Card / surface |
| `--foreground` | `20 15% 9%` | `40 15% 95%` | Primary text |
| `--muted-foreground` | `20 8% 46%` | `30 8% 63%` | Secondary text |
| `--success` | `142 50% 35%` | `142 45% 48%` | Good / dispensed |
| `--warning` | `32 85% 40%` | `32 75% 55%` | Expiry / low stock |
| `--destructive` | `0 72% 45%` | `0 60% 60%` | Danger / delete |
| `--info` | `205 60% 40%` | `205 50% 55%` | Informational only |

**Design Rationale**:
- Background `#1A1513` equiv. (warm brown-black): red and green light channels are
  equal, reducing the perceived blue-light emission vs. cool gray (`#1A1A2E`).
- Primary teal sits on the cyan axis (`177°`): shifts eye focus away from the
  high-fatigue red/blue ends of the spectrum.
- Warning amber (`32°`): universally distinct for all colorblind types (not reliant
  solely on red-green contrast).
- All foreground/background pairings exceed WCAG AA (4.5:1) minimum; primary text
  on dark background achieves ~15:1 (AAA).

---

## D-08: Component Library — Extend Existing `packages/ui`

**Question**: Create a new package or extend `packages/ui`?

**Decision**: Extend `packages/ui`. Add `Input`, `Card`, `Modal`, `DataTable` alongside
the existing `Button`.

**Existing Inventory in `packages/ui`**:
- `Button` (complete — CVA variants, Radix Slot, forwardRef)
- `cn()` utility (clsx + tailwind-merge)
- Dependencies: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  `@radix-ui/react-slot`

**What to Add**:
- `@radix-ui/react-dialog` → Modal (focus trap, Escape close built-in)
- `@radix-ui/react-label` → Input label association
- No additional Radix dependencies needed for Card and DataTable

**Rationale**: Adding to an existing package avoids a new `pnpm-workspace.yaml` entry,
new `turbo.json` dependency, and new `package.json` version management. The package
already has the right peer dependency structure and is already listed in both web and
desktop `tailwind.config.ts` content paths.

---

## D-09: POS Keyboard Shortcut Scheme

**Question**: Which specific keys for each POS action?

**Decision**: Function-key-primary scheme (avoids conflicts with Electron menus and
browser shortcuts):

| Action | Shortcut | Rationale |
|--------|----------|-----------|
| Focus drug search | `F2` | Universal "rename/edit" function key; unambiguous |
| Add top search result | `Enter` (in search) | Natural confirmation key |
| Navigate results | `↑` / `↓` | Standard list navigation |
| Adjust quantity up/down | `+` / `-` (when row selected) | Intuitive arithmetic |
| Open checkout/payment | `F4` | Standard "open" function key |
| Confirm payment | `Enter` (in checkout) | Consistent confirmation |
| Cancel sale / clear cart | `F5` | "Refresh/reset" semantic |
| Return/refund mode | `F6` | Next available F-key |
| Print last receipt | `F8` | Avoids F7 (common browser spell-check) |
| Open shortcut help panel | `F1` or `?` | Universal help convention |
| Close modal / return to POS | `Escape` | Universal cancel/close |
| Apply discount | `F3` | Between search and checkout |

**Conflict Analysis**:
- `F1`–`F8`: Electron does not bind these by default. No Chromium conflicts.
- `Enter` / `Escape`: Managed by component focus context — only active when their
  host component is focused.
- `?`: Only active when search field is NOT focused (prevent search interference).
- `+`/`-`: Only active when a cart row is focused, not in free-text fields.

---

## D-10: NativeWind Integration Architecture

**Question**: How does mobile consume shared tokens with NativeWind v4?

**Decision**: `apps/mobile/tailwind.config.js` imports and extends
`packages/shared/tailwind.config.ts` (after compiling to JS). NativeWind processes
the config at Metro bundler time; no runtime token resolution is needed.

**Key Constraints**:
- NativeWind v4 requires the `withNativeWind()` Metro plugin wrapper.
- CSS variables (`hsl(var(--primary))`) are NOT supported in React Native at runtime —
  NativeWind v4 resolves them at build time by flattening the token config.
- Therefore, the shared config MUST export static color values for the mobile-consumed
  tokens (no `hsl(var(--token))` syntax for mobile; use direct values).
- Solution: shared config exports two color sets — `cssVars` (for web/desktop CSS) and
  `colors` (flattened static values for NativeWind/mobile consumption).

---

## Summary Decision Table

| # | Topic | Decision | Status |
|---|-------|----------|--------|
| D-01 | Token config location | `packages/shared/tailwind.config.ts` | ✅ Resolved |
| D-02 | Dark mode strategy | `class` strategy | ✅ Resolved |
| D-03 | Desktop theme persistence | `electron-store` key `'theme'` | ✅ Resolved |
| D-04 | Chart library | Recharts | ✅ Resolved |
| D-05 | Keyboard shortcuts | `react-hotkeys-hook` | ✅ Resolved |
| D-06 | Glassmorphism fallback | `@supports` progressive enhancement | ✅ Resolved |
| D-07 | Colour palette | Medical teal + warm dark (#1A1513 equiv.) | ✅ Resolved |
| D-08 | Component library | Extend `packages/ui` | ✅ Resolved |
| D-09 | POS shortcut scheme | F-key primary (F1–F8) | ✅ Resolved |
| D-10 | NativeWind architecture | Flat static tokens for mobile, CSS vars for web | ✅ Resolved |
