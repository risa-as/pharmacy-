# Quickstart & Definition of Done: Global UI & Dark Mode Standardization

**Feature Branch**: `002-ui-standardization`
**Date**: 2026-02-23

---

## Definition of Done

Check each item before marking this feature complete.

### Automated Verification (grep checks)

Run these from the repo root. All MUST return zero matches.

```bash
# 1. Neutral backgrounds
grep -rn "bg-white\|bg-gray-\|bg-slate-\|bg-zinc-\|bg-neutral-" \
  apps/web/app/ui/ apps/web/app/dashboard/ apps/web/app/login/ apps/web/app/page.tsx \
  apps/desktop/src/components/ \
  --include="*.tsx" | grep -v "@media print"

# 2. Neutral text
grep -rn "text-gray-\|text-slate-\|text-zinc-\|text-black" \
  apps/web/app/ui/ apps/web/app/dashboard/ apps/web/app/login/ apps/web/app/page.tsx \
  apps/desktop/src/components/ \
  --include="*.tsx"

# 3. Neutral borders
grep -rn "border-gray-\|border-slate-\|border-zinc-" \
  apps/web/app/ui/ apps/web/app/dashboard/ apps/web/app/login/ \
  apps/desktop/src/components/ \
  --include="*.tsx"

# 4. Hardcoded palette colors
grep -rn "bg-blue-\|bg-indigo-\|bg-red-\|bg-amber-\|bg-orange-\|bg-emerald-\|bg-green-\|bg-purple-" \
  apps/web/app/ui/ apps/web/app/dashboard/ apps/desktop/src/components/ \
  --include="*.tsx"

# 5. Inline hex values
grep -rn "bg-\[#\|text-\[#\|from-\[#\|via-\[#\|to-\[#" \
  apps/web/app/ apps/desktop/src/ \
  --include="*.tsx"
```

**Expected**: All commands return zero output.

---

### Visual Verification Checklist

#### Web App — Dark Mode

- [ ] Enable dark mode via the theme toggle
- [ ] Sidebar: dark background, teal active item, no blue/gray hardcoded colors
- [ ] Login page: auth gradient visible, form inputs dark-themed
- [ ] Landing page (`/`): auth gradient visible
- [ ] Inventory page: dark background, no white surfaces
- [ ] Suppliers page: dark background, no white surfaces
- [ ] Reports pages (5 spot-checks): dark background, readable tables
- [ ] Purchases page: dark background, no white surfaces
- [ ] Patients page: dark background, no white surfaces
- [ ] Settings page: dark background, no white surfaces
- [ ] Users page: dark background, no white surfaces
- [ ] Discounts page: dark background, no white surfaces
- [ ] Delete confirmation modal: dark background (not white)
- [ ] Form submit button: primary teal (not blue-600)

#### Web App — Glass-Card Effect

- [ ] Inventory page: main container shows frosted glass effect
- [ ] Suppliers page: main container shows frosted glass effect
- [ ] Reports/Sales page: main container shows frosted glass effect
- [ ] Purchases page: main container shows frosted glass effect
- [ ] Patients page: main container shows frosted glass effect
- [ ] Settings page: main container shows frosted glass effect
- [ ] Compare any above page with Dashboard — glass effect matches

#### Web App — Light Mode

- [ ] All pages still look clean in light mode (glass-card on white BG)
- [ ] Sidebar uses muted hover, primary active state
- [ ] Status badges (Low Stock, Expiring, etc.) use semantic warning/destructive tokens

#### Desktop App — Dark Mode

- [ ] Enable dark mode via desktop theme toggle
- [ ] DashboardPage: no white/gray backgrounds, semantic status colors
- [ ] InventoryPage: dark background, semantic tokens
- [ ] SettingsPage: no gradient-to-slate background, semantic tokens
- [ ] LoginScreen: auth gradient preserved, form fields dark-themed
- [ ] POS keyboard shortcut badges: readable in dark mode
- [ ] Hotkey help panel: dark background, readable text
- [ ] Sync health dashboard: semantic status colors

#### Desktop App — Light Mode

- [ ] All desktop pages look clean in light mode
- [ ] No visual regression from before the migration

---

## Verification Commands (Post-Implementation)

### Check glass-card was applied correctly

```bash
# Count pages with glass-card applied
grep -rl "glass-card" apps/web/app/dashboard/ --include="*.tsx" | wc -l
```

Expected: >= 50 files (all major list pages).

### Check CSS variables were added

```bash
grep "gradient-auth-from\|gradient-auth-via\|gradient-auth-to" \
  apps/web/app/globals.css apps/desktop/src/index.css
```

Expected: 3 variables found in each file (6 total).

---

## Rollback Notes

Since this is a pure Tailwind class-name substitution:
- Each file change is independently reversible
- No database changes to roll back
- No dependency changes to roll back
- If a specific page looks wrong, revert only that file

---

## Known Exceptions (Do Not Fix)

| File | Exception |
|------|-----------|
| `apps/desktop/src/components/InvoicePrint.tsx` | `@media print` — retain `bg-white text-black` |
| `apps/web/app/dashboard/page.tsx` | Already migrated in Phase 1 (T021) — skip glass-card |
| Any file created post-Phase-1 that already uses tokens | Verify as clean; no change needed |
