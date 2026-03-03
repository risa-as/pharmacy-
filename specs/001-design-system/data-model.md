# Data Model: Faramace Unified Design System

**Branch**: `001-design-system` | **Date**: 2026-02-23

> **Note**: This feature introduces no new Prisma database models and no schema migrations.
> The "data model" here documents the design token schema, the component prop contracts,
> and the theme-state model (how dark mode preference flows through the system).

---

## 1. Design Token Schema

Design tokens are the canonical source of truth for all visual values. They are defined
once in `packages/shared/tailwind.config.ts` and consumed by all three platforms.

### 1.1 Token Categories

| Category | Tokens | Scope |
|----------|--------|-------|
| `color` | Brand, semantic, neutral | All platforms |
| `fontSize` | xs → 4xl scale | Web + Desktop |
| `fontFamily` | Arabic-first stack | Web + Desktop |
| `spacing` | 0 → 96 scale | All platforms |
| `borderRadius` | sm, md, lg, full | All platforms |
| `boxShadow` | sm, md, lg, glass | Web + Desktop |
| `backdropBlur` | sm, md, lg | Web + Desktop |
| `animation` | fadeIn, slideUp, scaleIn | Web + Desktop |

### 1.2 Colour Token Hierarchy

```
colors/
├── brand/                    ← Faramace identity
│   ├── primary               Medical teal
│   ├── primary-light         Hover/active variant
│   └── primary-dark          Pressed / light-mode main
│
├── semantic/                 ← Functional meaning (not brand)
│   ├── success               Dispensed / good stock
│   ├── warning               Expiring / low stock
│   ├── danger                Out of stock / error / interaction
│   └── info                  Informational only
│
├── neutral/                  ← Backgrounds, surfaces, borders
│   ├── background            Page background
│   ├── card                  Card / panel surface
│   ├── popover               Tooltip / dropdown surface
│   ├── border                Dividers and outlines
│   └── input                 Form field background
│
└── text/                     ← Typography
    ├── foreground            Primary body text
    ├── muted-foreground      Secondary / helper text
    └── ring                  Focus ring colour
```

### 1.3 Token Values (Light / Dark)

All colour tokens are expressed as **HSL components only** (no `hsl()` wrapper) so that
Tailwind's opacity modifier syntax (`bg-primary/50`) works correctly.

| CSS Variable | Light (H S L) | Dark (H S L) | Notes |
|---|---|---|---|
| `--background` | `40 20% 98%` | `20 15% 9%` | Page BG; warm off-white / warm near-black |
| `--foreground` | `20 15% 9%` | `40 15% 95%` | Primary text; mirrors BG for natural inversion |
| `--card` | `0 0% 100%` | `20 12% 13%` | Surface BG; pure white / warm dark card |
| `--card-foreground` | `20 15% 9%` | `40 15% 95%` | Text on card; same as foreground |
| `--popover` | `0 0% 100%` | `20 10% 11%` | Tooltip/popover surface; slightly darker than card |
| `--popover-foreground` | `20 15% 9%` | `40 15% 95%` | Text in popover |
| `--primary` | `177 90% 30%` | `177 65% 45%` | Medical teal brand; lighter in dark mode |
| `--primary-foreground` | `0 0% 100%` | `20 15% 9%` | Text on primary BG |
| `--secondary` | `177 20% 93%` | `177 10% 18%` | Subtle teal tint for secondary surfaces |
| `--secondary-foreground` | `177 90% 20%` | `177 40% 80%` | Text on secondary surface |
| `--muted` | `40 10% 93%` | `20 8% 16%` | Muted background for disabled states |
| `--muted-foreground` | `20 8% 46%` | `30 8% 63%` | Placeholder / helper text |
| `--accent` | `177 20% 93%` | `177 10% 22%` | Hover highlight; light teal tint |
| `--accent-foreground` | `177 80% 20%` | `177 60% 85%` | Text on accent hover |
| `--destructive` | `0 72% 45%` | `0 60% 60%` | Error / delete / danger |
| `--destructive-foreground` | `0 0% 100%` | `0 0% 100%` | Text on destructive bg |
| `--success` | `142 50% 35%` | `142 45% 52%` | OK / dispensed / in-stock |
| `--success-foreground` | `0 0% 100%` | `0 0% 100%` | Text on success bg |
| `--warning` | `32 85% 40%` | `32 75% 58%` | Expiring / low stock |
| `--warning-foreground` | `0 0% 100%` | `20 15% 9%` | Text on warning bg (dark is readable) |
| `--info` | `205 60% 40%` | `205 50% 58%` | Informational (not actionable) |
| `--info-foreground` | `0 0% 100%` | `0 0% 100%` | Text on info bg |
| `--border` | `40 12% 88%` | `20 8% 20%` | Dividers and input outlines |
| `--input` | `40 12% 88%` | `20 8% 20%` | Form field border; same as border |
| `--ring` | `177 90% 30%` | `177 65% 45%` | Focus ring; matches primary |
| `--radius` | `0.5rem` | *(same)* | Global border-radius base |

### 1.4 Static Flat Tokens for NativeWind (Mobile)

NativeWind v4 resolves tokens at Metro compile time. The shared config MUST export
static hex/hsl strings for mobile consumption (no CSS variable references).

```typescript
// packages/shared/tailwind.config.ts — exported from `colors.static`
export const staticColors = {
  primary: { DEFAULT: '#0F7575', light: '#1CABAC', dark: '#0B5E5E' },
  success:  '#2D8A52',
  warning:  '#C47820',
  danger:   '#B03030',
  info:     '#2B6F8F',
  // dark mode variants suffixed with `-dark`
  'primary-dark':  '#1CABAC',
  'success-dark':  '#44C47A',
  'warning-dark':  '#D4934A',
  'danger-dark':   '#D86B6B',
  'info-dark':     '#5B9FBE',
};
```

---

## 2. Theme State Model

Dark mode preference is a user-level setting that MUST persist per platform.

### 2.1 State Transitions

```
           first load
               │
       ┌───────▼────────┐
       │ Read stored    │
       │ preference     │
       └───────┬────────┘
               │
       ┌───────▼────────────────────┐
       │ stored === 'dark' ?        │──Yes──► Apply .dark class
       │ stored === 'light' ?       │──Yes──► Remove .dark class
       │ stored === null/'system' ? │──────► Read OS preference
       └────────────────────────────┘
                    │
              ┌─────▼──────┐
              │  User      │
              │  toggles   │
              └─────┬──────┘
                    │
          ┌─────────▼────────────┐
          │ Persist new pref     │
          │ Apply .dark class    │
          └──────────────────────┘
```

### 2.2 Persistence per Platform

| Platform | Storage Key | Mechanism | Read Timing |
|----------|-------------|-----------|-------------|
| Web | `faramace-theme` | `localStorage` | Before first paint (inline `<script>` in `<head>`) |
| Desktop | `theme` | `electron-store` | Electron `main` → IPC → renderer on window create |
| Mobile | System preference | OS `Appearance` API | NativeWind auto-adapts; no manual toggle in P3 |

---

## 3. Component Prop Model

### 3.1 `Button`

*Already exists in `packages/ui/src/components/ui/button.tsx` — no changes to existing
props. Enhancement: add optional `shortcut` prop for keyboard badge display.*

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'destructive' \| 'outline' \| 'secondary' \| 'ghost' \| 'link' \| 'success' \| 'warning'` | `'default'` | Visual style |
| `size` | `'default' \| 'sm' \| 'lg' \| 'icon'` | `'default'` | Size preset |
| `shortcut` | `string \| undefined` | `undefined` | Keyboard shortcut badge (e.g., `'F4'`) |
| `asChild` | `boolean` | `false` | Render as child element via Radix Slot |
| `...ButtonHTMLAttributes` | — | — | All native button props |

### 3.2 `Input`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string \| undefined` | `undefined` | Visible label text |
| `hint` | `string \| undefined` | `undefined` | Helper text below input |
| `error` | `string \| undefined` | `undefined` | Error message (replaces hint) |
| `leftIcon` | `ReactNode \| undefined` | `undefined` | Icon rendered inside left edge |
| `rightIcon` | `ReactNode \| undefined` | `undefined` | Icon rendered inside right edge |
| `size` | `'sm' \| 'default' \| 'lg'` | `'default'` | Height preset |
| `...InputHTMLAttributes` | — | — | All native input props |

### 3.3 `Card`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'glass' \| 'elevated'` | `'default'` | Visual variant; `'glass'` applies glassmorphism |
| `padding` | `'none' \| 'sm' \| 'default' \| 'lg'` | `'default'` | Internal padding preset |
| `as` | `ElementType` | `'div'` | Render as different element (e.g., `'article'`) |
| `...HTMLAttributes<HTMLDivElement>` | — | — | All native div props |

Sub-components (named exports): `CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, `CardFooter` — following shadcn/ui convention for composability.

### 3.4 `Modal`

Built on `@radix-ui/react-dialog` for focus trap and Escape-close behaviour.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | required | Controlled open state |
| `onOpenChange` | `(open: boolean) => void` | required | Called on close (Escape, overlay click) |
| `title` | `string` | required | Modal title (rendered in `DialogTitle` for a11y) |
| `description` | `string \| undefined` | `undefined` | Subtitle / description |
| `size` | `'sm' \| 'default' \| 'lg' \| 'full'` | `'default'` | Width preset |
| `children` | `ReactNode` | required | Modal body content |
| `footer` | `ReactNode \| undefined` | `undefined` | Footer content (actions) |
| `hideClose` | `boolean` | `false` | Hide the × close button |

### 3.5 `DataTable`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `ColumnDef<TData>[]` | required | TanStack Table column definitions |
| `data` | `TData[]` | required | Row data array |
| `loading` | `boolean` | `false` | Skeleton loading state |
| `emptyMessage` | `string` | `'لا توجد بيانات'` | Empty state message (Arabic default) |
| `onRowClick` | `(row: TData) => void \| undefined` | `undefined` | Row selection handler |
| `rowKeyField` | `keyof TData` | `'id'` | Field used as React key |
| `stickyHeader` | `boolean` | `false` | Pin column headers on scroll |
| `pagination` | `PaginationConfig \| undefined` | `undefined` | Client-side pagination config |

`PaginationConfig`:
```typescript
interface PaginationConfig {
  pageSize: number;
  pageIndex: number;           // 0-based
  total: number;               // total row count (for server-side)
  onPageChange: (pageIndex: number) => void;
}
```

> **Note**: `DataTable` depends on `@tanstack/react-table` for column definitions and
> pagination logic. This is a new dependency for `packages/ui` (see contracts for
> full dependency list).

---

## 4. Package Dependency Map

```
packages/shared
└── tailwind.config.ts  (no runtime dependencies — build-time only)

packages/ui
├── Existing: class-variance-authority, clsx, tailwind-merge, lucide-react,
│             @radix-ui/react-slot, react (peer)
├── Add: @radix-ui/react-dialog  (Modal focus trap + Escape close)
├── Add: @radix-ui/react-label   (Input label association)
└── Add: @tanstack/react-table   (DataTable sorting / pagination)

apps/web
├── Existing: tailwindcss
└── Add: recharts               (interactive dashboard charts)

apps/desktop
├── Existing: tailwindcss, react-hotkeys-hook (verify or add)
└── Add: react-hotkeys-hook     (if not already present)

apps/mobile
├── Existing: tailwindcss (minimal config)
└── Add: nativewind             (if not already at v4)
```
