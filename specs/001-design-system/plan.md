# Implementation Plan: Faramace Unified Design System

**Branch**: `001-design-system` | **Date**: 2026-02-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-design-system/spec.md`

## Summary

Implement a unified design system across all three Faramace platforms (Next.js Web,
Electron Desktop, Expo Mobile) by:

1. Creating a canonical medical-theme design token config in `packages/shared/tailwind.config.ts`
   that all apps extend — replacing the current per-app HSL variable duplication.
2. Adding dark mode CSS variable blocks (`--primary`, `--background`, etc.) to the
   Desktop's `index.css`, which currently has no `.dark {}` block.
3. Extending `packages/ui` with four new shared components (`Input`, `Card`, `Modal`,
   `DataTable`) alongside the existing `Button`, all using Radix UI primitives and
   TanStack Table for accessible, keyboard-navigable behaviour.
4. Wiring keyboard-first shortcuts (`react-hotkeys-hook`) into `apps/desktop`'s
   `POSLayout.tsx` with visible `<kbd>` badges on every action button.
5. Adding Recharts interactive charts to the Web Dashboard with dark-mode-aware theming.
6. Updating `apps/mobile/tailwind.config.js` to extend the shared config via NativeWind,
   enabling OS-level auto dark mode without a manual toggle.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (all apps and packages)
**Primary Dependencies**:
- Existing: TailwindCSS v3.4, class-variance-authority, clsx, tailwind-merge,
  @radix-ui/react-slot, lucide-react (all in `packages/ui`)
- New in `packages/ui`: @radix-ui/react-dialog, @radix-ui/react-label, @tanstack/react-table
- New in `apps/web`: recharts
- New in `apps/desktop`: react-hotkeys-hook (verify not already present)
- New in `apps/mobile`: nativewind v4 (verify version; update if on v2/v3)

**Storage**: No new Prisma models. Dark mode preference:
- Web → `localStorage` key `faramace-theme`
- Desktop → `electron-store` key `theme` (store already in use)
- Mobile → OS system appearance (auto, no storage needed)

**Testing**: Visual inspection per `quickstart.md` checklist. No automated tests
scoped to this feature (spec does not request them). WCAG contrast verified manually.

**Target Platform**: Web (Next.js, Chromium browsers), Desktop (Electron, Chromium renderer),
Mobile (Expo, iOS + Android via NativeWind)

**Project Type**: shared-library + multi-platform theming / UI component library

**Performance Goals**: All token resolution at compile/build time. No runtime CSS
generation. Dark mode toggle < 100ms perceived latency (CSS class swap, no re-render).

**Constraints**:
- Desktop MUST work fully offline — design system is 100% build-time, no network calls.
- Mobile tokens resolved by Metro bundler at compile time (NativeWind v4 constraint).
- No inline `style={{}}` except for runtime-computed values (Constitution Principle VI).
- All packages installed via pnpm; no npm/yarn.

**Scale/Scope**: 3 platforms, ~100 existing screens (migrating CSS variables only, not
rewriting markup), 5 shared components (1 existing + 4 new), 1 chart integration,
1 keyboard shortcut system.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Gate Question | Status |
|---|-----------|---------------|--------|
| I | Spec-Driven Development | Is an approved `spec.md` present and reviewed before this plan was started? | ✅ |
| II | Offline-First (Desktop) | If this feature touches `apps/desktop`: is offline behaviour documented in spec.md and sync strategy documented here? | ✅ |
| III | Platform Storage | Does each affected platform use its prescribed storage (electron-store for desktop, OS for mobile, localStorage for web)? | ✅ |
| IV | Monorepo Discipline | Does all shared code live in `packages/*`? Are there zero direct cross-app imports? Is pnpm used exclusively? | ✅ |
| V | Schema Source of Truth | Are Prisma migrations included for both schemas if synced entities are added/changed? | ✅ N/A — no Prisma models introduced |
| VI | UI Consistency | Is all styling done via TailwindCSS/NativeWind? Are inline `style={{}}` props and CSS modules absent? | ✅ |

**Gate II note**: Desktop offline compliance — TailwindCSS is compiled into static CSS
at build time; no network call is ever needed to apply the design system at runtime.
Dark mode pref stored in electron-store (local). ✅

**Gate III note**: Dark mode is not a security-sensitive value; electron-store is used
because it is the established app config mechanism (not a security requirement). ✅

All gates pass. No Complexity Tracking entries required.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-design-system/
├── plan.md               # This file
├── research.md           # D-01 through D-10 decision log
├── data-model.md         # Token schema, component prop interfaces, dependency map
├── quickstart.md         # Verification guide and definition of done
├── contracts/
│   ├── design-tokens.md  # Canonical CSS variable values + prohibited patterns
│   └── component-apis.md # TypeScript interfaces + keyboard contract
└── tasks.md              # (Generated by /speckit.tasks — not yet created)
```

### Source Code

```text
packages/
├── shared/
│   ├── src/
│   │   ├── index.ts                   MODIFY — add token exports
│   │   ├── types.ts                   NO CHANGE
│   │   └── zod.ts                     NO CHANGE
│   └── tailwind.config.ts             NEW — base design token config
│
└── ui/
    ├── src/
    │   ├── index.ts                   MODIFY — add new component exports
    │   ├── lib/utils.ts               NO CHANGE (cn() stays as-is)
    │   └── components/ui/
    │       ├── button.tsx             MODIFY — add shortcut prop + success/warning variants
    │       ├── input.tsx              NEW
    │       ├── card.tsx               NEW (+ CardHeader, CardTitle, etc.)
    │       ├── modal.tsx              NEW (Radix Dialog wrapper)
    │       └── data-table.tsx         NEW (TanStack Table wrapper)
    ├── package.json                   MODIFY — add new Radix + TanStack deps
    └── tailwind.config.ts             MODIFY — extend packages/shared

apps/
├── web/
│   ├── tailwind.config.ts             MODIFY — extend packages/shared
│   ├── app/globals.css                MODIFY — update CSS vars to medical palette
│   └── app/dashboard/page.tsx         MODIFY — add glassmorphism cards + Recharts
│   package.json                       MODIFY — add recharts
│
├── desktop/
│   ├── tailwind.config.ts             MODIFY — extend packages/shared
│   ├── src/index.css                  MODIFY — add .dark {} block with medical palette
│   ├── src/components/POSLayout.tsx   MODIFY — add react-hotkeys-hook shortcuts + kbd badges
│   └── electron/main.ts              MODIFY — IPC handler to read/write theme pref
│   package.json                       MODIFY — add react-hotkeys-hook (if absent)
│
└── mobile/
    ├── tailwind.config.js             MODIFY — extend packages/shared + NativeWind
    └── metro.config.js                MODIFY — ensure watchFolders includes packages/shared
```

**Structure Decision**: Multi-package monorepo approach. Shared tokens in `packages/shared`,
shared DOM components in `packages/ui`. Each app config extends the shared base. No new
app directories are created; this is a pure enhancement of existing structure.

---

## Complexity Tracking

> No Constitution Check violations identified. This section is not required.
