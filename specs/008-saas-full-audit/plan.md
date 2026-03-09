# Implementation Plan: SaaS Pharmacy Management System — Full Audit & QA

**Feature**: 008-saas-full-audit
**Type**: System Audit & Verification (not a new feature — verifies existing implementation)
**Created**: 2026-03-09

---

## Tech Stack

- **Web**: Next.js 14 (App Router), TypeScript 5.3+, Prisma ORM, PostgreSQL (Neon serverless), NextAuth.js, TailwindCSS v3.4
- **Desktop**: Electron, React, SQLite (via Prisma with desktop-client), TypeScript 5.3+
- **Mobile**: Expo SDK, React Native, NativeWind, TypeScript 5.3+
- **Shared**: pnpm workspaces monorepo, packages/shared (design tokens), packages/ui (components)
- **Payments**: Stripe (international), ZainCash (local Iraqi gateway)
- **File Upload**: UploadThing
- **Audit Tools**: Manual code review, API testing (curl/Postman), browser DevTools, SQLite Inspector

---

## Project Structure

```
apps/
  web/
    app/
      api/           ← 101 API routes to audit
      dashboard/     ← 92 pages to audit
    prisma/
      schema.prisma  ← 60+ models to audit for integrity
    auth.ts / auth.config.ts ← auth & role enforcement
  desktop/
    electron/
      main.ts        ← 64 IPC handlers to audit
      sync.ts        ← all sync logic to audit
    src/components/  ← 14 screens to audit
    prisma/
      schema.prisma  ← SQLite schema
  mobile/
    app/             ← 35 screens to audit
    services/        ← API service layer
specs/
  008-saas-full-audit/
    spec.md          ← acceptance criteria
    tasks.md         ← this audit task list
    findings/        ← audit findings per domain (created during audit)
```

---

## Audit Domains & Approach

### Domain 1 — Tenant Isolation & API Security (US1)
**Method**: Code review of every API route for `getTenantContext()` usage + manual API tests with cross-tenant tokens.
**Key files**: `apps/web/app/api/**/*.ts`, `apps/web/app/lib/tenant-utils.ts`, `apps/web/auth.config.ts`
**Output**: `findings/01-tenant-isolation.md`

### Domain 2 — Sync Pipeline Correctness (US2)
**Method**: Code review of all sync routes + desktop sync functions + end-to-end offline test scenarios.
**Key files**: `apps/web/app/api/sync/**/*.ts`, `apps/desktop/electron/sync.ts`
**Output**: `findings/02-sync-correctness.md`

### Domain 3 — Super Admin System (US3)
**Method**: Code review of admin routes + manual testing of provision/suspend/license flows.
**Key files**: `apps/web/app/api/admin/**/*.ts`, `apps/web/app/dashboard/admin/**/*.tsx`
**Output**: `findings/03-super-admin.md`

### Domain 4 — Web Dashboard Pages (US4)
**Method**: Page-by-page navigation audit across all 4 roles + form validation testing.
**Key files**: `apps/web/app/dashboard/**/*.tsx` (92 pages)
**Output**: `findings/04-web-pages.md`

### Domain 5 — Point of Sale (US5)
**Method**: Full sale flow testing on each platform (web, desktop, mobile) + loyalty point calculation verification.
**Key files**: `apps/web/app/lib/actions/pos-actions.ts`, `apps/desktop/electron/main.ts` (process-sale), `apps/mobile/app/(tabs)/sales.tsx`
**Output**: `findings/05-pos-flows.md`

### Domain 6 — Subscription & Licensing (US6)
**Method**: Code review of plan-limit enforcement + license verification logic + Stripe webhook handler.
**Key files**: `apps/web/app/api/admin/provision-tenant/route.ts`, `apps/web/app/api/license/**`, `apps/desktop/electron/offline-token.ts`
**Output**: `findings/06-subscription-licensing.md`

### Domain 7 — Mobile App (US7)
**Method**: Screen-by-screen navigation on iOS simulator + Android emulator + API call verification.
**Key files**: `apps/mobile/app/**/*.tsx`, `apps/mobile/services/**/*.ts`
**Output**: `findings/07-mobile-app.md`

### Domain 8 — Data Integrity (US8)
**Method**: Database query validation — loyalty balances, sale totals, transfer quantities, cascade deletes.
**Key files**: `apps/web/prisma/schema.prisma`, `apps/web/app/api/**/*.ts`
**Output**: `findings/08-data-integrity.md`

---

## Findings Format

Each finding file uses this structure:

```markdown
# Findings: [Domain Name]

## PASS Items
- ✅ [Item] — [Evidence]

## FAIL Items
- ❌ [Item] — [Description of issue] — [File:Line] — [Severity: Critical/High/Medium/Low]

## Needs Fix
- [ ] [Fix description] — [Assignee/Priority]
```

---

## Severity Levels

| Level | Definition |
|-------|-----------|
| **Critical** | Data breach, financial loss, or system unavailability |
| **High** | Feature broken for all users, security bypass possible |
| **Medium** | Feature broken for some users or roles, workaround exists |
| **Low** | UI/UX issue, minor inconsistency, cosmetic |

---

## Execution Order

1. Domain 1 (Tenant Isolation) — P1, blocks all others if critical issues found
2. Domain 2 (Sync) — P1, parallel with Domain 3
3. Domain 3 (Super Admin) — P1, parallel with Domain 2
4. Domain 4 (Web Pages) — P2, requires Domain 1 clean
5. Domain 5 (POS) — P2, requires Domain 2 clean
6. Domain 6 (Subscriptions) — P2, requires Domain 3 clean
7. Domain 7 (Mobile) — P2, parallel with Domains 4-6
8. Domain 8 (Data Integrity) — P3, final pass

---

## Dependencies

```
[Domain 1: Tenant Isolation]
    └──→ [Domain 4: Web Pages]
    └──→ [Domain 5: POS]
    └──→ [Domain 7: Mobile]

[Domain 2: Sync]
    └──→ [Domain 5: POS]

[Domain 3: Super Admin]
    └──→ [Domain 6: Subscriptions]

[Domain 8: Data Integrity] ← runs last (depends on all others)
```

---

## Deliverables

1. `findings/01-tenant-isolation.md` — security audit report
2. `findings/02-sync-correctness.md` — sync pipeline report
3. `findings/03-super-admin.md` — admin system report
4. `findings/04-web-pages.md` — 92-page audit checklist
5. `findings/05-pos-flows.md` — POS flow report (3 platforms)
6. `findings/06-subscription-licensing.md` — plan/license enforcement report
7. `findings/07-mobile-app.md` — 35-screen mobile audit
8. `findings/08-data-integrity.md` — database integrity report
9. `findings/00-executive-summary.md` — consolidated report with all Critical/High findings
