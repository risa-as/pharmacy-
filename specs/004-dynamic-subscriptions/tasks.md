# Tasks: Dynamic Subscription Engine & Tenant Management

**Input**: Design documents from `specs/004-dynamic-subscriptions/`
**Spec**: spec.md (4 user stories)

---

## Phase 1: Setup

**Purpose**: Project initialization and basic structure

- [X] T001 Verify project structure and prepare environment for schema migrations.

---

## Phase 2: Foundational (Schema & Data Migration)

**Purpose**: Core database changes linking Organizations to dynamic Plans.
**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [SYNC-IMPACT] Create `SubscriptionPlan` model in `apps/web/prisma/schema.prisma` with fields: `id`, `name`, `price`, `maxBranches`, `maxUsers`, `features` (Json), and `isActive`.
- [X] T003 [SYNC-IMPACT] Modify `Organization` model in `apps/web/prisma/schema.prisma`: add `planId` referencing `SubscriptionPlan`. Retain `maxBranches` and `maxUsers` for custom overrides.
- [X] T004 Run `pnpm --filter @faramace/web prisma migrate dev --name "add_subscription_plans"` to apply schema changes.
- [X] T005 Create data migration script `apps/web/prisma/seed-plans.ts` to convert existing enum-based organizations to new dynamic default plans (e.g. FREE, BASIC, PROFESSIONAL).

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Subscription Plan CRUD (Priority: P1) 🎯 MVP

**Goal**: Admin UI to manage plans dynamically.

**Independent Test**: Navigate to `/dashboard/admin/plans`. Create a new plan "Ramadan Offer". Deactivate an old plan. Verify the changes persist in the database.

- [X] T006 [P] [US1] Create server actions in `apps/web/app/lib/actions/plans.ts` for CRUD operations on `SubscriptionPlan`.
- [X] T007 [P] [US1] Create page layout and listing UI in `apps/web/app/dashboard/admin/plans/page.tsx`.
- [X] T008 [US1] Create `PlanForm` component in `apps/web/app/ui/admin/plan-form.tsx` for creating/editing plans.
- [X] T009 [US1] Implement deactivate plan functionality connected to the UI.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Tenant Management with Dynamic Plans (Priority: P1)

**Goal**: Assign dynamic plans to new/existing organizations with optional limit overrides.

**Independent Test**: Navigate to `/dashboard/tenants`. Open the Create/Edit form. The Plan dropdown populates from the DB. Selecting a plan auto-fills `maxBranches` and `maxUsers`, which can then be manually overridden before saving.

- [X] T010 [P] [US2] Update `apps/web/app/api/tenants/route.ts` to assign limits and pricing using `SubscriptionPlan` via `planId` instead of the old Enum logic.
- [X] T011 [P] [US2] Update `apps/web/app/dashboard/tenants/page.tsx` fetching logic to retrieve dynamic plans for the dropdown.
- [X] T012 [US2] Refactor the tenant creation UI form to include "Custom Limits Override" inputs for `maxBranches` and `maxUsers` (e.g., VIP overrides)./tenant-form.tsx`) to render a dynamic Plan dropdown fetched from the DB.
- [X] T013 [US2] Implement client-side logic in the form to auto-fill `maxBranches` and `maxUsers` when a plan is selected.

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently.

---

## Phase 5: User Story 3 - Emergency DRM Controls (Priority: P2)

**Goal**: Instantly suspend/reactivate tenants and cascade DRM to device licenses directly from the tenant list.

**Independent Test**: Click "Suspend" on an active organization in the tenant list. Verify the organization and all its device licenses become inactive instantly.

- [X] T014 [P] [US3] Create UI components for "Suspend" and "Reactivate" buttons in the tenant table rows in `apps/web/app/dashboard/tenants/page.tsx`.
- [X] T015 [US3] Wire the buttons to the existing `suspendOrganization` and `reactivateOrganization` server actions.
- [X] T016 [US3] Ensure the DRM cascade logic correctly updates tenant/license states visually in the UI table without requiring a hard refresh.

---

## Phase 6: User Story 4 - Dynamic Iron Wall Enforcement (Priority: P1)

**Goal**: API and server endpoints respect the dynamic, overridden plan limits instead of hardcoded Enums.

**Independent Test**: Attempt to create a branch via API when the organization has reached its dynamic `maxBranches`. It must return a 403 Forbidden.

- [X] T017 [US4] Update `checkPlanLimit` and relevant guards in `apps/web/app/lib/saas-guards.ts` to compare aggregate usage against the `Organization`'s native `maxBranches` and `maxUsers` limits.
- [X] T018 [US4] Validate the change in `apps/web/app/api/branches/route.ts` and `apps/web/app/api/users/route.ts` to ensure 403s are triggered correctly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [X] T019 Run full integration test locally verifying the end-to-end flow from Plan Creation -> Tenant Assignment -> Limit Enforcement.
- [X] T020 Code cleanup and UI polishing across the new admin views.
