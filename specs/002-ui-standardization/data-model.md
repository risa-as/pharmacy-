# Data Model: Global UI & Dark Mode Standardization

**Feature Branch**: `002-ui-standardization`
**Date**: 2026-02-23

## No New Data Models

This feature introduces **zero new Prisma models, database migrations, or API routes**.

It is a pure UI migration: Tailwind class-name substitutions in `.tsx` files and
CSS custom property additions to two `.css` files.

## Token Reference (Informational)

The following semantic tokens from `packages/shared/tailwind.config.ts` and
`apps/web/app/globals.css` are used in this migration. All are pre-existing from Phase 1.

| Token | Light Mode use | Dark Mode use |
|-------|---------------|---------------|
| `bg-background` | Warm off-white page background | Dark warm background |
| `bg-card` | Pure white card surface | Dark card surface |
| `bg-muted` | Subtle off-white for inputs/sections | Dark muted surface |
| `text-foreground` | Dark charcoal for body text | Near-white for body text |
| `text-muted-foreground` | Mid-gray for labels/placeholders | Muted warm gray |
| `border-border` | Light warm gray dividers | Subtle dark dividers |
| `bg-primary` | Medical teal fill | Brighter teal fill |
| `text-primary` | Teal text | Brighter teal text |
| `bg-destructive` | Red fill for errors/delete | Softer red |
| `text-destructive` | Red text | Softer red text |
| `bg-warning` | Amber fill | Warm amber |
| `text-warning` | Amber text | Warm amber text |
| `bg-success` | Green fill | Softer green |
| `text-success` | Green text | Softer green text |

## CSS Custom Properties Added (New in this phase)

### `apps/web/app/globals.css`

```css
/* Auth gradient — login page and landing page */
--gradient-auth-from: #0f0c29;
--gradient-auth-via:  #302b63;
--gradient-auth-to:   #24243e;
```

Added under `:root {}`. No dark-mode variant needed — this gradient is intentionally dark
on both modes (used as a full-page background for the login/landing experience).

### `apps/desktop/src/index.css`

```css
/* Auth gradient — desktop login screen */
--gradient-auth-from: #0f0c29;
--gradient-auth-via:  #302b63;
--gradient-auth-to:   #24243e;
```

Same values as web. Maintains visual parity between web login and desktop login.
