# Contract: Token Migration Registry

**Feature Branch**: `002-ui-standardization`
**Authority**: This file is the authoritative reference for all token substitutions
in this phase. Every implementer MUST follow this mapping exactly.

---

## Part 1: Authoritative Token Mapping Table

### Neutral Colors (Most Common Violations)

| Replace this | With this | When to use |
|-------------|----------|-------------|
| `bg-white` | `bg-background` | Page/layout backgrounds |
| `bg-white` | `bg-card` | Card/panel surfaces |
| `bg-white/80` | `bg-card/80` | Semi-transparent card |
| `bg-gray-50` | `bg-background` | Page background tint |
| `bg-gray-50` | `bg-muted` | Subtle input/section background |
| `bg-gray-100` | `bg-muted` | Slightly stronger muted bg |
| `bg-gray-50/80` | `bg-muted/80` | Semi-transparent muted |
| `bg-slate-50` | `bg-background` | Same as gray-50 |
| `text-black` | `text-foreground` | Body text |
| `text-gray-900` | `text-foreground` | Body text |
| `text-gray-800` | `text-foreground` | Body text (same tier) |
| `text-gray-700` | `text-foreground` | Body text (same tier) |
| `text-gray-600` | `text-muted-foreground` | Secondary text |
| `text-gray-500` | `text-muted-foreground` | Placeholder/helper text |
| `text-gray-400` | `text-muted-foreground` | Subtle secondary text |
| `border-gray-200` | `border-border` | Standard dividers |
| `border-gray-100` | `border-border` | Subtle dividers (same token) |
| `border-gray-200/80` | `border-border/80` | Semi-transparent divider |
| `border-slate-200` | `border-border` | Same |
| `hover:bg-gray-50` | `hover:bg-muted` | Hover states |
| `hover:bg-gray-100` | `hover:bg-muted` | Hover states |
| `hover:bg-gray-200` | `hover:bg-muted` | Stronger hover |

### Brand / Primary Colors

| Replace this | With this | When to use |
|-------------|----------|-------------|
| `bg-blue-500` | `bg-primary` | Primary brand fill |
| `bg-blue-600` | `bg-primary` | Primary brand fill |
| `bg-indigo-600` | `bg-primary` | Brand fill (replaced by teal) |
| `hover:bg-blue-700` | `hover:bg-primary/90` | Primary hover |
| `text-blue-600` | `text-primary` | Primary brand text |
| `text-blue-700` | `text-primary` | Primary brand text |
| `text-blue-50` | `text-primary-foreground` | Text on primary bg |
| `bg-blue-50` | `bg-primary/10` | Subtle primary tint |
| `hover:bg-blue-50` | `hover:bg-primary/10` | Subtle primary hover |
| `focus:border-blue-500` | `focus:border-ring` | Focus border |
| `focus:ring-blue-500` | `focus:ring-ring` | Focus ring |
| `shadow-blue-600/20` | `shadow-primary/20` | Primary shadow |
| `bg-purple-50` | `bg-accent` | Accent tint |
| `text-purple-600` | `text-accent-foreground` | Accent text |
| `text-purple-50` | `text-accent-foreground` | Text on accent |

### Destructive / Error Colors

| Replace this | With this | When to use |
|-------------|----------|-------------|
| `bg-red-600` | `bg-destructive` | Error/delete button fill |
| `bg-red-700` | `bg-destructive` | Error fill |
| `hover:bg-red-700` | `hover:bg-destructive/90` | Error hover |
| `bg-red-50` | `bg-destructive/10` | Subtle error tint |
| `bg-red-50/80` | `bg-destructive/10` | Subtle error tint |
| `bg-red-100` | `bg-destructive/10` | Subtle error tint |
| `hover:bg-red-100` | `hover:bg-destructive/20` | Error hover tint |
| `text-red-600` | `text-destructive` | Error text |
| `text-red-500` | `text-destructive` | Error text |
| `text-red-700` | `text-destructive` | Error text |
| `text-white` (on `bg-red-*`) | `text-destructive-foreground` | Text on destructive bg |

### Warning Colors

| Replace this | With this | When to use |
|-------------|----------|-------------|
| `bg-amber-50` | `bg-warning/10` | Subtle warning tint |
| `bg-orange-100` | `bg-warning/10` | Subtle warning tint |
| `text-amber-600` | `text-warning` | Warning text |
| `text-orange-700` | `text-warning` | Warning text |

### Success Colors

| Replace this | With this | When to use |
|-------------|----------|-------------|
| `bg-emerald-50` | `bg-success/10` | Subtle success tint |
| `bg-emerald-600` | `bg-success` | Success fill |
| `bg-green-100` | `bg-success/10` | Subtle success tint |
| `text-emerald-600` | `text-success` | Success text |
| `text-green-700` | `text-success` | Success text |

### Inline Hex Values

| Replace this | With this |
|-------------|----------|
| `from-[#0f0c29]` | `from-[--gradient-auth-from]` |
| `via-[#302b63]` | `via-[--gradient-auth-via]` |
| `to-[#24243e]` | `to-[--gradient-auth-to]` |
| `bg-[#0f0c29]` | `bg-[--gradient-auth-from]` |

### Gradient Backgrounds

| Replace this | With this |
|-------------|----------|
| `bg-gradient-to-bl from-slate-50 via-gray-50 to-blue-50/30` | `bg-gradient-to-bl from-background via-background to-primary/5` |

---

## Part 2: File Registry

All files in scope. Status tracked during implementation.

### Priority 1 — Shared Web UI Components (highest leverage)

These files are used across ALL forms, modals, and pages. Fix these first.

| File | Violation Count | Key violations |
|------|----------------|----------------|
| `apps/web/app/ui/dashboard/sidenav.tsx` | ~15 | bg-white, bg-blue-50, text-blue-700, bg-red-50, hover:bg-gray-50 |
| `apps/web/app/ui/login-form.tsx` | ~6 | text-gray-900, border-gray-200, focus:border-blue-500 |
| `apps/web/app/ui/delete-button.tsx` | ~8 | bg-red-100, text-red-600, bg-gray-100, text-gray-900 |
| `apps/web/app/ui/submit-button.tsx` | ~3 | bg-blue-600, hover:bg-blue-700 |

### Priority 2 — Web Login / Landing Pages

| File | Violation Count | Key violations |
|------|----------------|----------------|
| `apps/web/app/globals.css` | N/A — ADD | Add `--gradient-auth-*` CSS vars |
| `apps/web/app/login/page.tsx` | ~6 | bg-gray-50, bg-white, inline hex gradient |
| `apps/web/app/page.tsx` | ~5 | inline hex gradient |

### Priority 3 — Desktop Components (high-impact)

| File | Violation Count | Key violations |
|------|----------------|----------------|
| `apps/desktop/src/index.css` | N/A — ADD | Add `--gradient-auth-*` CSS vars |
| `apps/desktop/src/components/DashboardPage.tsx` | ~20 | bg-gray-50, bg-white, bg-blue-500, bg-indigo-600, bg-emerald-50 |
| `apps/desktop/src/components/SettingsPage.tsx` | ~15 | gradient bg, bg-white/80, border-gray-200/60 |
| `apps/desktop/src/components/InventoryPage.tsx` | ~10 | bg-gray-50, bg-white, text-gray-* |
| `apps/desktop/src/components/LoginScreen.tsx` | ~8 | bg-gray-50, bg-white, inline hex, border-gray-200 |

### Priority 4 — Desktop Components (lower-impact)

| File | Violation Count | Key violations |
|------|----------------|----------------|
| `apps/desktop/src/components/POSLayout.tsx` | ~5 | status badge colors |
| `apps/desktop/src/components/HotkeyHelpPanel.tsx` | ~3 | UI colors |
| `apps/desktop/src/components/SyncHealthDashboard.tsx` | ~4 | status indicator colors |

### Priority 5 — Web Dashboard Pages (glass-card application)

Apply `glass-card` to the main container `<div>` in these list/detail pages.
Create/edit sub-pages are excluded (see research.md D-04).

**Main list pages** (add `glass-card` to outermost content wrapper):
```
apps/web/app/dashboard/inventory/page.tsx
apps/web/app/dashboard/suppliers/page.tsx
apps/web/app/dashboard/drugs/page.tsx
apps/web/app/dashboard/patients/page.tsx
apps/web/app/dashboard/sales/page.tsx
apps/web/app/dashboard/purchases/page.tsx
apps/web/app/dashboard/reports/page.tsx
apps/web/app/dashboard/reports/sales/page.tsx
apps/web/app/dashboard/reports/inventory/page.tsx
apps/web/app/dashboard/reports/expiry/page.tsx
apps/web/app/dashboard/reports/profits/page.tsx
apps/web/app/dashboard/reports/profit/page.tsx
apps/web/app/dashboard/reports/employees/page.tsx
apps/web/app/dashboard/reports/shifts/page.tsx
apps/web/app/dashboard/reports/forecast/page.tsx
apps/web/app/dashboard/reports/top-sellers/page.tsx
apps/web/app/dashboard/reports/slow-movers/page.tsx
apps/web/app/dashboard/reports/margins/page.tsx
apps/web/app/dashboard/reports/branch-comparison/page.tsx
apps/web/app/dashboard/reports/analytics/page.tsx
apps/web/app/dashboard/reports/audit-log/page.tsx
apps/web/app/dashboard/reports/purchases/page.tsx
apps/web/app/dashboard/discounts/page.tsx
apps/web/app/dashboard/batches/page.tsx
apps/web/app/dashboard/insurance/page.tsx
apps/web/app/dashboard/insurance/policies/page.tsx
apps/web/app/dashboard/prescriptions/page.tsx
apps/web/app/dashboard/payments/page.tsx
apps/web/app/dashboard/users/page.tsx
apps/web/app/dashboard/settings/page.tsx
apps/web/app/dashboard/debts/page.tsx
apps/web/app/dashboard/expenses/page.tsx
apps/web/app/dashboard/returns/page.tsx
apps/web/app/dashboard/loyalty/page.tsx
apps/web/app/dashboard/loyalty/settings/page.tsx
apps/web/app/dashboard/alerts/page.tsx
apps/web/app/dashboard/notifications/page.tsx
apps/web/app/dashboard/branches/page.tsx
apps/web/app/dashboard/organizations/page.tsx
apps/web/app/dashboard/warehouses/page.tsx
apps/web/app/dashboard/marketplace/page.tsx
apps/web/app/dashboard/tenants/page.tsx
apps/web/app/dashboard/users/permissions/page.tsx
apps/web/app/dashboard/permissions-guide/page.tsx
apps/web/app/dashboard/admin/licenses/page.tsx
apps/web/app/dashboard/finance/safes/page.tsx
apps/web/app/dashboard/finance/transactions/page.tsx
apps/web/app/dashboard/inventory/bulk-pricing/page.tsx
apps/web/app/dashboard/inventory/stocktakes/page.tsx
apps/web/app/dashboard/inventory/transfers/page.tsx
apps/web/app/dashboard/inventory/barcode-print/page.tsx
apps/web/app/dashboard/inventory/shortages/page.tsx
apps/web/app/dashboard/inventory/expired-damaged/page.tsx
apps/web/app/dashboard/inventory/product-movement/page.tsx
apps/web/app/dashboard/inventory/margin-warnings/page.tsx
apps/web/app/dashboard/analytics/demand-forecast/page.tsx
```

---

## Part 3: Exception Registry

| Exception | Files | Rule |
|-----------|-------|------|
| `@media print` blocks | `InvoicePrint.tsx` | May retain `bg-white text-black` |
| Auth gradient | `globals.css`, `index.css` | Hex values moved to CSS vars; visual appearance unchanged |
| Already-compliant files | Any post-Phase-1 file using semantic tokens | Mark as verified-clean; no change |
| `dashboard/page.tsx` | Main dashboard | Already has glass-card from T019/T021; skip glass-card task |

---

## Part 4: Prohibited Patterns (Violation Detection)

After implementation, a grep for ANY of these patterns in the audited scope MUST return
zero results (excluding exception files):

```
bg-white
bg-gray-
bg-slate-
bg-zinc-
bg-neutral-
text-gray-
text-slate-
border-gray-
border-slate-
bg-blue-
bg-indigo-
bg-red-
bg-amber-
bg-orange-
bg-emerald-
bg-green-
bg-purple-
bg-\[#
text-\[#
```

**Scope**: `apps/web/app/ui/`, `apps/web/app/dashboard/`, `apps/web/app/login/`,
`apps/web/app/page.tsx`, `apps/desktop/src/components/`
