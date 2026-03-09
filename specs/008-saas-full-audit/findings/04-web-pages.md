# Findings: Web Dashboard Pages (US4)

**Auditor**: Claude Code
**Date**: 2026-03-09

---

## Page Inventory

Total pages found: 96

---

## Layout / Auth Guard Summary

- `dashboard/layout.tsx` — Loads session, permissions, and subscription state. Does NOT redirect unauthenticated users here; relies on middleware or child pages to redirect.
- `dashboard/admin/layout.tsx` — Correctly redirects non-SUPER_ADMIN to `/dashboard`. Role guard in place.
- `dashboard/(sales-hub)/layout.tsx` — Tab navigation only; no role guard.
- `dashboard/(patients-hub)/layout.tsx` — Tab navigation only; no role guard.
- `dashboard/users/layout.tsx` — Tab navigation only; no role guard.

**Key observation**: There is no centralized role-based redirect in the root `dashboard/layout.tsx`. Role enforcement is delegated to `getTenantContext()` inside individual pages. Hub layouts (sales, patients, users) provide no role filtering — any authenticated user can access them.

---

## PASS Items

- `dashboard/layout.tsx` — `export const dynamic = 'force-dynamic'` present; subscription state loaded.
- `dashboard/admin/layout.tsx` — SUPER_ADMIN role guard correctly redirects non-admins.
- `dashboard/inventory/page.tsx` — Calls `getTenantContext()`; uses `tenantBranchWhere` in all Prisma queries; `export const dynamic = 'force-dynamic'` present; pagination is safe.
- `dashboard/inventory/create/page.tsx` — Calls `getTenantContext()`; redirects to `/login` on failure; `force-dynamic` present; branches filtered by `tenantWhere`.
- `dashboard/inventory/[id]/edit/page.tsx` — Uses `tenantBranchWhere` in `findFirst` to scope the inventory item; calls `notFound()` if absent; `force-dynamic` present.
- `dashboard/(sales-hub)/invoices/create/page.tsx` — Calls `getTenantContext()`; redirects on failure; suppliers scoped to `organizationId`; branches scoped to `tenantWhere`; drugs scoped with `organizationId` filter; `force-dynamic` present.
- `dashboard/(patients-hub)/patients/page.tsx` — Calls `getTenantContext()`; uses `tenantBranchWhere`; `force-dynamic` present.
- `dashboard/purchases/smart-order/page.tsx` — Calls `getTenantContext()`; branches only loaded for admins; `force-dynamic` present.
- `dashboard/reports/analytics/page.tsx` — Calls `getTenantContext()`; best-selling and stagnant queries scoped by `tenantBranchWhere`; `force-dynamic` present.
- `dashboard/organizations/page.tsx` — Calls `getTenantContext()`; redirects on failure; `force-dynamic` present.
- `dashboard/organizations/[id]/edit/page.tsx` — Calls `getTenantContext()`; redirects on failure; calls `notFound()` if org missing; `force-dynamic` present.
- `dashboard/branches/page.tsx` — Calls `getTenantContext()`; redirects on failure; uses `tenantWhere`; `force-dynamic` present.
- `dashboard/branches/create/page.tsx` — Calls `getTenantContext()`; redirects on failure; `force-dynamic` present.
- `dashboard/suppliers/page.tsx` — Calls `getTenantContext()`; scopes by `organizationId` for non-SUPER_ADMIN; `force-dynamic` present.
- `dashboard/suppliers/[id]/page.tsx` — Calls `getTenantContext()`; `getSupplierSummary`/`getSupplierLedger` scope supplier lookup to `organizationId`; calls `notFound()` on missing supplier; `force-dynamic` present.
- `dashboard/users/page.tsx` — Calls `getTenantContext()`; uses `tenantBranchWhere`; `force-dynamic` present.
- `dashboard/users/create/page.tsx` — Calls `getTenantContext()`; branches scoped to `tenantWhere`; `force-dynamic` present.
- `dashboard/users/[id]/edit/page.tsx` — Calls `getTenantContext()`; user fetched with `tenantBranchWhere` scope; calls `notFound()` if user missing; `force-dynamic` present.
- `dashboard/reports/purchases/page.tsx` — Calls `getTenantContext()`; uses `tenantBranchWhere`; `force-dynamic` present.
- `dashboard/reports/forecast/page.tsx` — Calls `getTenantContext()`; inventory scoped by `tenantBranchWhere`; redirects on failure; `force-dynamic` present.
- `app/lib/actions/purchase-actions.ts` `getPurchases()` — Correctly calls `getTenantContext()` and applies `tenantBranchWhere`.
- `app/lib/actions/supplier-ledger-actions.ts` — `getSupplierSummary`, `getSupplierLedger`, `recordSupplierPayment`, `recalculateSupplierBalance` all call `getTenantContext()` and scope supplier lookups to `organizationId`.

---

## FAIL Items

### Critical

- ❌ `dashboard/(sales-hub)/sales/page.tsx` — **No redirect on `getTenantContext()` failure**: uses inline ternary `'tenantBranchWhere' in tenantCtx ? tenantCtx.tenantBranchWhere : {}`. When `getTenantContext()` returns `NextResponse` (unauthenticated/unauthorized), the Prisma query silently runs with an empty where clause, exposing ALL sales across ALL tenants. — `apps/web/app/dashboard/(sales-hub)/sales/page.tsx:18` — Severity: **Critical**

- ❌ `dashboard/(sales-hub)/returns/page.tsx` — **Same empty-where fallback pattern as sales page**: `'tenantBranchWhere' in tenantCtx ? tenantCtx.tenantBranchWhere : {}`. Unauthenticated call returns ALL returns across ALL tenants. — `apps/web/app/dashboard/(sales-hub)/returns/page.tsx:14` — Severity: **Critical**

- ❌ `dashboard/users/page.tsx` — **Silent catch fallback to unscoped query**: the `catch` block at line 32 calls `getUsers({})` (empty where), fetching all users across all tenants when the scoped query throws any transient error. — `apps/web/app/dashboard/users/page.tsx:29-33` — Severity: **Critical**

- ❌ `dashboard/suppliers/page.tsx` — **Same catch pattern**: catch block calls `getSuppliers()` with no arguments (line 36), running `WHERE {}` and returning all suppliers from all tenants on any error. — `apps/web/app/dashboard/suppliers/page.tsx:33-37` — Severity: **Critical**

### High

- ❌ `dashboard/inventory/page.tsx` — **Returns `null` instead of redirecting** on auth failure (`if (tenantCtx instanceof NextResponse) return null`). Unauthenticated users see a blank page; no redirect to `/login`. — `apps/web/app/dashboard/inventory/page.tsx:72` — Severity: **High**

- ❌ `dashboard/(patients-hub)/patients/page.tsx` — **Same `return null` on auth failure** with no redirect. — `apps/web/app/dashboard/(patients-hub)/patients/page.tsx:21` — Severity: **High**

- ❌ `dashboard/reports/analytics/page.tsx` — **Same `return null` on auth failure** with no redirect. — `apps/web/app/dashboard/reports/analytics/page.tsx:17` — Severity: **High**

- ❌ `dashboard/users/page.tsx` — **Same `return null` on auth failure** (line 25), compounding the Critical catch fallback. — `apps/web/app/dashboard/users/page.tsx:25` — Severity: **High**

- ❌ `dashboard/suppliers/page.tsx` — **Same `return null` on auth failure** (line 28). — `apps/web/app/dashboard/suppliers/page.tsx:28` — Severity: **High**

- ❌ `dashboard/purchases/smart-order/page.tsx` — **Same `return null` on auth failure** (line 20). — `apps/web/app/dashboard/purchases/smart-order/page.tsx:20` — Severity: **High**

- ❌ `dashboard/organizations/page.tsx` — **Unscoped `prisma.organization.findMany()` with no where clause**: any authenticated non-SUPER_ADMIN (e.g., ADMIN of Org A) can see all organizations in the system. `getTenantContext()` is called and redirects on error, but `tenantWhere` is never applied to the query. — `apps/web/app/dashboard/organizations/page.tsx:15` — Severity: **High**

- ❌ `dashboard/organizations/[id]/edit/page.tsx` — **Unscoped `prisma.organization.findUnique({ where: { id } })`**: no tenant filter; any authenticated user who knows an org UUID can view and trigger the edit form for it. — `apps/web/app/dashboard/organizations/[id]/edit/page.tsx:15` — Severity: **High**

- ❌ `dashboard/branches/create/page.tsx` — **Unscoped `prisma.organization.findMany()`**: all organizations exposed in the branch-creation form dropdown to any authenticated user, regardless of their tenant. — `apps/web/app/dashboard/branches/create/page.tsx:14` — Severity: **High**

- ❌ `dashboard/purchases/page.tsx` — **Missing `export const dynamic = 'force-dynamic'`**: no dynamic directive and no `revalidate` setting. Next.js may statically render or cache the page in production, serving stale purchase records. — `apps/web/app/dashboard/purchases/page.tsx` — Severity: **High**

- ❌ `app/lib/actions/purchase-actions.ts` `getPurchaseDetails()` — **No tenant context check**: fetches purchase by UUID with no `tenantBranchWhere` scope; any authenticated user who knows a purchase ID gets its full details including supplier and item list. — `apps/web/app/lib/actions/purchase-actions.ts:133-159` — Severity: **High**

- ❌ `app/lib/actions/purchase-actions.ts` `receivePurchase()` — **No tenant context check**: server action callable by any authenticated user with a valid `purchaseId`; does not verify the purchase belongs to the caller's organization/branch before writing to the DB. — `apps/web/app/lib/actions/purchase-actions.ts:161-247` — Severity: **High**

### Medium

- ❌ `dashboard/reports/analytics/page.tsx` — **N+1 query in best-selling items loop**: 2 additional `prisma.*` calls issued per drug inside `Promise.all(bestSellingData.map(...))`, producing up to 20 extra queries for 10 results. — `apps/web/app/dashboard/reports/analytics/page.tsx:51-82` — Severity: **Medium**

- ❌ `dashboard/reports/forecast/page.tsx` — **N+1 query inside sequential `for` loop**: issues `prisma.saleItem.findMany()` once per inventory item inside a non-parallel loop. For 500 inventory items this is 500 sequential DB round-trips; will time out in production. — `apps/web/app/dashboard/reports/forecast/page.tsx:32-63` — Severity: **Medium**

- ❌ `app/lib/actions/supplier-ledger-actions.ts` `getSupplierSummary()` / `getSupplierLedger()` — **Purchase aggregations lack tenant scope**: `prisma.purchase.aggregate({ where: { supplierId, status: 'COMPLETED' } })` does not include `organizationId`, making the totals inconsistent with the rest of the codebase's scoping pattern. — `apps/web/app/lib/actions/supplier-ledger-actions.ts:52-56,89-93` — Severity: **Medium**

- ❌ `dashboard/(sales-hub)/sales/page.tsx` — **Silent hard cap of 100 records with no pagination or warning**: `take: 100` silently truncates the sales list for high-volume pharmacies with no indication to the user that older records exist. — `apps/web/app/dashboard/(sales-hub)/sales/page.tsx:35` — Severity: **Medium**

---

## Needs Fix

- [ ] Replace `'tenantBranchWhere' in tenantCtx ? tenantCtx.tenantBranchWhere : {}` with `instanceof NextResponse` check + `redirect('/login')` in `sales/page.tsx` and `returns/page.tsx`.
- [ ] Remove the `catch` fallback `getUsers({})` in `users/page.tsx`; on error, redirect or render an error UI — never fall back to an unscoped query.
- [ ] Remove the `catch` fallback `getSuppliers()` in `suppliers/page.tsx` — same fix as users.
- [ ] Add `redirect('/login')` (instead of `return null`) in all pages that silently swallow auth failure: `inventory/page.tsx`, `patients/page.tsx`, `analytics/page.tsx`, `users/page.tsx`, `suppliers/page.tsx`, `smart-order/page.tsx`.
- [ ] Scope `prisma.organization.findMany()` in `organizations/page.tsx` to `tenantCtx.tenantWhere`, or restrict the page to SUPER_ADMIN via an inline role check.
- [ ] Scope `prisma.organization.findUnique()` in `organizations/[id]/edit/page.tsx` to include `organizationId` in the where clause.
- [ ] Scope `prisma.organization.findMany()` in `branches/create/page.tsx` to `tenantWhere` or restrict to SUPER_ADMIN.
- [ ] Add `export const dynamic = 'force-dynamic'` to `purchases/page.tsx`.
- [ ] Add tenant context check + `tenantBranchWhere` scoping to `getPurchaseDetails()` in `purchase-actions.ts`.
- [ ] Add tenant context check + purchase ownership verification to `receivePurchase()` in `purchase-actions.ts`.
- [ ] Refactor `analytics/page.tsx` best-selling block to batch drug lookups in a single `findMany` rather than N individual queries.
- [ ] Refactor `forecast/page.tsx` to aggregate `saleItem` data in a single grouped query instead of a per-inventory-item loop.
- [ ] Add `branchId`/`organizationId` scoping to purchase aggregations inside `getSupplierSummary()` and `getSupplierLedger()` for defence-in-depth.
