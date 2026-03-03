# Research: Global UI & Dark Mode Standardization

**Feature Branch**: `002-ui-standardization`
**Phase**: 0 — Research & Decisions
**Date**: 2026-02-23

---

## D-01: Token Mapping Strategy

**Decision**: Use a four-tier replacement hierarchy: neutral → structure → semantic → accent.

**Rationale**: Not all gray/white usages mean the same thing. A systematic hierarchy
prevents incorrect mappings (e.g., replacing a card surface with `bg-background` when
`bg-card` is semantically correct).

**Mapping tiers**:

| Tier | Rule | Correct token |
|------|------|---------------|
| Page background | Outermost wrapper of a page | `bg-background` |
| Card/surface | A contained box, section, or panel | `bg-card` |
| Muted region | A slightly-off input area, sidebar section | `bg-muted` |
| Text primary | Main readable text | `text-foreground` |
| Text secondary | Labels, helper text, placeholders | `text-muted-foreground` |
| Divider/border | Lines separating content | `border-border` |
| Focus ring | Input focus rings | `ring-ring` |

**Alternatives considered**: Replacing everything with a single token
(`bg-background`) — rejected because it ignores the depth hierarchy and breaks
card-on-background visual layering.

---

## D-02: Semantic Color Replacements

**Decision**: Replace all hardcoded palette classes with their semantic counterparts.
Preserve the semantic intent; only change the mechanism.

| Hardcoded pattern | Semantic replacement | Notes |
|-------------------|---------------------|-------|
| `bg-blue-500`, `bg-indigo-600` (brand) | `bg-primary` | Brand teal from token |
| `text-blue-600`, `text-blue-700` | `text-primary` | |
| `bg-blue-50`, `hover:bg-blue-50` | `bg-primary/10` | Subtle brand tint |
| `bg-red-600`, `bg-red-700` | `bg-destructive` | Error/delete actions |
| `text-red-600`, `text-red-500` | `text-destructive` | |
| `bg-red-50`, `bg-red-100` | `bg-destructive/10` | Subtle error tint |
| `hover:bg-red-100` | `hover:bg-destructive/10` | |
| `bg-amber-50`, `bg-orange-100` | `bg-warning/10` | Subtle warning tint |
| `text-amber-600`, `text-orange-700` | `text-warning` | |
| `bg-emerald-50`, `bg-green-100` | `bg-success/10` | Subtle success tint |
| `text-emerald-600`, `text-green-700` | `text-success` | |
| `bg-purple-50` | `bg-accent` | Secondary accent |
| `text-purple-600` | `text-accent-foreground` | |
| `text-white` (on colored bg) | `text-primary-foreground` / `text-destructive-foreground` / etc. | Must match the bg token's foreground |

**Alternatives considered**: Leaving semantic-color hardcoding as acceptable for status
badges — rejected because these exact classes break dark mode (e.g., `bg-red-50` becomes
unreadably light in dark mode).

---

## D-03: Inline Hex Gradient Handling

**Decision**: Define auth-gradient colors as CSS custom properties in the app's global CSS
file, then reference them via `from-[--gradient-auth-from]` Tailwind arbitrary-value syntax.

**Current offending pattern** (web `login/page.tsx` and `page.tsx`):
```
className="bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e]"
```

**Resolution**:
1. Add to `apps/web/app/globals.css` under `:root`:
   ```css
   --gradient-auth-from: #0f0c29;
   --gradient-auth-via:  #302b63;
   --gradient-auth-to:   #24243e;
   ```
2. Replace class with:
   ```
   className="bg-gradient-to-br from-[--gradient-auth-from] via-[--gradient-auth-via] to-[--gradient-auth-to]"
   ```
3. Apply identical pattern in `apps/desktop/src/index.css` for `LoginScreen.tsx`.

**Why preserve the gradient visually**: The dark-purple gradient is a deliberate brand
decision for the login page. This migration preserves the appearance exactly — only the
mechanism changes from inline hex to CSS custom properties.

**Alternatives considered**:
- Replace gradient with a semantic token (`bg-primary`) — rejected, as the gradient
  is a distinct brand element from the primary teal color.
- Keep inline hex — rejected, as it violates Constitution Principle VI and breaks the
  ability to theme or override the gradient centrally.

---

## D-04: Glass-Card Application Scope

**Decision**: Apply `glass-card` only to the **main page container** `<div>` — the
outermost wrapper that contains the page title, action buttons, and the data table or
content area. Do NOT apply to inner cards, table rows, modals, or form sections.

**Rationale**: The `glass-card` effect requires `backdrop-filter: blur()` which is
GPU-accelerated. Stacking multiple glass layers produces visual noise and performance
degradation. One glass layer per page is the correct design pattern.

**Target structure** (example):
```tsx
// BEFORE
<div className="p-6">
  ...page content...
</div>

// AFTER
<div className="glass-card p-6">
  ...page content...
</div>
```

**Pages to include**: All `apps/web/app/dashboard/**/page.tsx` files that have a direct
wrapping `<div>` as their top-level content container.

**Pages to exclude**:
- Create/edit form sub-pages (e.g., `users/create/page.tsx`) — these render a form inside
  a card; applying glass-card to the wrapper would conflict with the card's own styling.
- The main `dashboard/page.tsx` — already migrated in Phase 1 (T021); do not double-apply.

**Alternatives considered**: Applying `glass-card` to all pages including form pages —
rejected because forms have specific input/label contrast requirements that conflict with
the translucent glass background.

---

## D-05: Exception Registry

**Decision**: Document three explicit exceptions that are excluded from the migration.

| Exception | File | Reason |
|-----------|------|--------|
| `@media print` blocks | `InvoicePrint.tsx` | Paper output requires absolute `bg-white text-black` |
| Auth gradient (visual preservation) | `globals.css`, `index.css` | Gradient colors moved to CSS vars, visual appearance unchanged |
| Already-migrated files | Any file created post-Phase-1 that uses semantic tokens | Verified clean; no change needed — counts as compliant |

---

## D-06: Sidebar Active-State Token Strategy

**Decision**: Map the sidebar's active nav item to `bg-primary/10 text-primary` and
hover to `hover:bg-muted text-foreground`. Replace the logout button to use
`bg-destructive/10 text-destructive hover:bg-destructive/20`.

**Current violations in `sidenav.tsx`**:
- Active item: `bg-blue-50 text-blue-700`
- Inactive hover: `hover:bg-gray-50 text-gray-800`
- Logout: `bg-red-50/80 text-red-500 hover:bg-red-100 text-red-600`
- Container: `bg-white border-gray-200/80`

**Replacement map**:
- Container: `bg-background border-border`
- Active item: `bg-primary/10 text-primary`
- Inactive item: `text-muted-foreground hover:bg-muted hover:text-foreground`
- Logout: `bg-destructive/10 text-destructive hover:bg-destructive/20`
- Divider: `border-border`

**Alternatives considered**: Using `bg-secondary` for active state — rejected, as
`bg-primary/10` creates a clearer visual signal that the item is selected (primary-tinted)
rather than merely secondary-styled.
