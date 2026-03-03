# Contract: Design Token Specification

**Package**: `packages/shared`
**File**: `packages/shared/tailwind.config.ts`
**Version**: 1.0.0 | **Date**: 2026-02-23

This contract defines the canonical set of design tokens that ALL platforms MUST consume.
Any colour, spacing, or typography value used in Faramace MUST reference a token defined here.
Hard-coding values outside of this contract is a Constitution Principle VI violation.

---

## Usage by Platform

| Platform | Import Path | Syntax |
|----------|-------------|--------|
| Web (`apps/web`) | `../../packages/shared/tailwind.config.ts` (via `extends`) | `bg-primary`, `text-foreground`, CSS var `hsl(var(--primary))` |
| Desktop (`apps/desktop`) | `../../packages/shared/tailwind.config.ts` (via `extends`) | Same as Web |
| Mobile (`apps/mobile`) | `../../packages/shared/tailwind.config.ts` (via `extends`) | NativeWind static color values only |

---

## Token File Contract

The shared config file MUST export the following structure:

```typescript
// packages/shared/tailwind.config.ts

import type { Config } from 'tailwindcss';

/** Static hex/HSL values for NativeWind (mobile) — no CSS variable references */
export const staticTokens = {
  colors: {
    // Brand
    primary:   { DEFAULT: '#0F7575', light: '#1CABAC', dark: '#0B5E5E' },
    // Semantic
    success:   '#2D8A52',
    warning:   '#C47820',
    danger:    '#B03030',
    info:      '#2B6F8F',
    // Dark mode variants
    'primary-dark': '#1CABAC',
    'success-dark': '#44C47A',
    'warning-dark': '#D4934A',
    'danger-dark':  '#D86B6B',
    'info-dark':    '#5B9FBE',
  },
} as const;

const config: Config = {
  darkMode: 'class',                    // REQUIRED — class strategy for all platforms
  content: ['./src/**/*.{ts,tsx}'],     // Overridden per app; shared has minimal content

  theme: {
    extend: {
      colors: {
        // CSS-variable-based colors (Web + Desktop)
        background:        'hsl(var(--background) / <alpha-value>)',
        foreground:        'hsl(var(--foreground) / <alpha-value>)',
        card:              { DEFAULT: 'hsl(var(--card) / <alpha-value>)',
                             foreground: 'hsl(var(--card-foreground) / <alpha-value>)' },
        popover:           { DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
                             foreground: 'hsl(var(--popover-foreground) / <alpha-value>)' },
        primary:           { DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
                             foreground: 'hsl(var(--primary-foreground) / <alpha-value>)' },
        secondary:         { DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
                             foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)' },
        muted:             { DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
                             foreground: 'hsl(var(--muted-foreground) / <alpha-value>)' },
        accent:            { DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
                             foreground: 'hsl(var(--accent-foreground) / <alpha-value>)' },
        destructive:       { DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
                             foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)' },
        success:           { DEFAULT: 'hsl(var(--success) / <alpha-value>)',
                             foreground: 'hsl(var(--success-foreground) / <alpha-value>)' },
        warning:           { DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
                             foreground: 'hsl(var(--warning-foreground) / <alpha-value>)' },
        info:              { DEFAULT: 'hsl(var(--info) / <alpha-value>)',
                             foreground: 'hsl(var(--info-foreground) / <alpha-value>)' },
        border:            'hsl(var(--border) / <alpha-value>)',
        input:             'hsl(var(--input) / <alpha-value>)',
        ring:              'hsl(var(--ring) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans Arabic', 'Cairo', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## CSS Variable Definitions Contract

Each app's global CSS file MUST define these variables in `:root` and `.dark` blocks.
The values below are the authoritative defaults.

```css
/* === packages/shared — authoritative CSS variable values === */

:root {
  /* Backgrounds */
  --background:          40 20% 98%;
  --foreground:          20 15% 9%;
  --card:                0 0% 100%;
  --card-foreground:     20 15% 9%;
  --popover:             0 0% 100%;
  --popover-foreground:  20 15% 9%;

  /* Brand */
  --primary:             177 90% 30%;
  --primary-foreground:  0 0% 100%;

  /* Secondary */
  --secondary:           177 20% 93%;
  --secondary-foreground: 177 90% 20%;

  /* Muted */
  --muted:               40 10% 93%;
  --muted-foreground:    20 8% 46%;

  /* Accent */
  --accent:              177 20% 93%;
  --accent-foreground:   177 80% 20%;

  /* Semantic — Light Mode */
  --destructive:         0 72% 45%;
  --destructive-foreground: 0 0% 100%;
  --success:             142 50% 35%;
  --success-foreground:  0 0% 100%;
  --warning:             32 85% 40%;
  --warning-foreground:  0 0% 100%;
  --info:                205 60% 40%;
  --info-foreground:     0 0% 100%;

  /* Structure */
  --border:              40 12% 88%;
  --input:               40 12% 88%;
  --ring:                177 90% 30%;
  --radius:              0.5rem;
}

.dark {
  /* Backgrounds — warm darks (reduces blue-light for night shift) */
  --background:          20 15% 9%;
  --foreground:          40 15% 95%;
  --card:                20 12% 13%;
  --card-foreground:     40 15% 95%;
  --popover:             20 10% 11%;
  --popover-foreground:  40 15% 95%;

  /* Brand — brighter teal in dark context */
  --primary:             177 65% 45%;
  --primary-foreground:  20 15% 9%;

  /* Secondary */
  --secondary:           177 10% 18%;
  --secondary-foreground: 177 40% 80%;

  /* Muted */
  --muted:               20 8% 16%;
  --muted-foreground:    30 8% 63%;

  /* Accent */
  --accent:              177 10% 22%;
  --accent-foreground:   177 60% 85%;

  /* Semantic — Dark Mode (warmer, less harsh) */
  --destructive:         0 60% 60%;
  --destructive-foreground: 0 0% 100%;
  --success:             142 45% 52%;
  --success-foreground:  0 0% 100%;
  --warning:             32 75% 58%;
  --warning-foreground:  20 15% 9%;
  --info:                205 50% 58%;
  --info-foreground:     0 0% 100%;

  /* Structure */
  --border:              20 8% 20%;
  --input:               20 8% 20%;
  --ring:                177 65% 45%;
}
```

---

## Glassmorphism Token

The `glass` variant of `Card` MUST use this pattern (defined as a Tailwind utility
or applied directly in the component):

```css
/* Base (fallback for no backdrop-filter support) */
.glass-card {
  background-color: hsl(var(--card) / 0.8);
  border: 1px solid hsl(var(--border) / 0.4);
}

/* Progressive enhancement */
@supports (backdrop-filter: blur(0)) {
  .glass-card {
    background-color: hsl(var(--card) / 0.15);
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid hsl(var(--border) / 0.2);
  }
}
```

---

## Prohibited Patterns

The following are Constitution Principle VI violations:

```typescript
// ❌ PROHIBITED — hard-coded colour value
<div className="bg-[#1CABAC]">

// ❌ PROHIBITED — inline style with colour
<div style={{ backgroundColor: '#1A1513' }}>

// ❌ PROHIBITED — colour value defined in app tailwind.config without token
colors: { primary: '#1CABAC' }  // in apps/web/tailwind.config.ts

// ✅ CORRECT — token via Tailwind class
<div className="bg-primary">

// ✅ CORRECT — token via CSS variable
<div style={{ color: 'hsl(var(--warning))' }}>  // only for runtime-computed values

// ✅ CORRECT — token defined in packages/shared and extended
// in apps/*/tailwind.config.ts
```
